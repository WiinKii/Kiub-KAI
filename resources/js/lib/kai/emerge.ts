/**
 * Aparición «Convergencia: KAI cobra vida».
 *
 * Una gota pequeña late una vez; otras dos se acercan por caminos curvos,
 * se alargan hacia ella y se funden mediante puentes de líquido (el campo de
 * metabolas da un contorno continuo, sin bordes internos). Su volumen pasa al
 * cuerpo, cada impacto lanza una onda por el contorno y la última deja una
 * protuberancia que se absorbe. Después se abren los ojos, mira esa última
 * incorporación, vuelve al frente, inclina la cabeza y se asienta con un
 * rebote: entra en reposo desde su pose real.
 *
 * La coreografía es una función pura del tiempo de la secuencia: el motor la
 * evalúa en cada fotograma con su propio reloj (pausa, velocidad y cámara
 * lenta incluidas) y no hay temporizadores sueltos.
 */

import type { Channel, SpringConfig } from './motion';
import type { KaiEmergePhase } from './types';

/** Parámetros para afinar la aparición. */
export const EMERGE = {
    /** Duración total a velocidad normal (s); la coreografía se escala entera. */
    duration: 2.8,
    /** Variante de movimiento reducido: aparición suave y ojos que se abren. */
    reducedDuration: 1,
    /** Separación inicial de las gotas (1 = diseñada; mayor, más lejos). */
    separation: 1,
    /** Elasticidad: ondas, empujones y rebote de asentamiento (1 = diseñada). */
    elasticity: 1,
    /** Alargamiento máximo de una gota al acercarse (1 = redonda). */
    stretch: 1.34,
    /** Radios, en radios del cuerpo final: núcleo y las dos gotas que llegan. */
    core: 0.5,
    dropA: 0.64,
    dropB: 0.58,
    /**
     * Al terminar entra en reposo en la ventana tranquila de su ciclo (sin
     * lóbulos): estos aparecen después, despacio, como siempre.
     */
    idleOffset: 10.5,
};

/** Tramos de la coreografía, en segundos nominales (duración 2,8 s). */
export const EMERGE_PHASES: { id: KaiEmergePhase; from: number }[] = [
    { id: 'pulse', from: 0 },
    { id: 'attraction', from: 0.4 },
    { id: 'fusion', from: 1.1 },
    { id: 'awakening', from: 1.6 },
    { id: 'recognition', from: 2.1 },
];

const NOMINAL = 2.8;

/** Gota de la aparición, en radios desde el centro de reposo. */
export type EmergeDrop = {
    x: number;
    y: number;
    r: number;
    /** Alargamiento con área constante a lo largo de `angle` (1 = redonda). */
    stretch: number;
    angle: number;
    /** Brillo de esfera propia: 1 suelta, 0 integrada (sin bordes internos). */
    glass: number;
};

/** Lo que el motor ofrece a la coreografía en cada fotograma. */
export type EmergeContext = {
    /** Intensidad × tamaño (0-1,5): escala gestos, no la fusión. */
    amp: number;
    /** Centro actual del cuerpo, en radios. */
    body: { x: number; y: number };
    /** Objetivo de un canal en este fotograma. */
    set: (ch: Channel, value: number) => void;
    /** Muelle de un canal mientras dura la aparición. */
    spring: (ch: Channel, config: SpringConfig) => void;
    /** Volumen del cuerpo (radio relativo, 0-1). */
    mass: (value: number) => void;
    /**
     * Área visible que debería haber (fracción del reposo): el motor corrige
     * el cuerpo para conservarla también mientras las gotas se solapan con
     * él. `weight` (0-1) apaga la corrección al final.
     */
    volume: (target: number, weight: number) => void;
    /** Visibilidad global (0-1). */
    presence: (value: number) => void;
    drop: (slot: number, drop: EmergeDrop | null) => void;
    /** Onda que recorre el contorno desde un ángulo (una vez por id). */
    wave: (id: number, angle: number, amp: number) => void;
    /** Empujón de inercia, en radios/s (una vez por id). */
    nudge: (id: number, vx: number, vy: number) => void;
    /** Parpadeo puntual (una vez por id). */
    blink: (id: number) => void;
};

/* ── Utilidades ─────────────────────────────────────────────────────── */

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(a: number, b: number, t: number): number {
    const u = clamp01((t - a) / (b - a));

    return u * u * (3 - 2 * u);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Arranque lento y llegada rápida: la atracción crece al acercarse. */
function easeIn(u: number): number {
    return 1 - Math.cos((clamp01(u) * Math.PI) / 2);
}

function easeOut(u: number, power = 2.2): number {
    return 1 - Math.pow(1 - clamp01(u), power);
}

/* ── Gotas ──────────────────────────────────────────────────────────── */

type Plan = {
    slot: number;
    r: number;
    /** Punto de partida (radios, antes de aplicar la separación). */
    start: [number, number];
    /** Curvatura del camino (fracción de su longitud, con signo). */
    bend: number;
    appear: number;
    travel: [number, number];
};

/** Núcleo algo desplazado del centro: «cerca de su posición final». */
const CORE_AT: [number, number] = [0.12, -0.1];

/**
 * Llegadas escalonadas: A toca primero y termina de integrarse antes de que
 * B, que viene por abajo, alcance el cuerpo ya redondeado.
 */
const A: Plan = {
    slot: 3,
    r: EMERGE.dropA,
    start: [-1.5, -0.98],
    bend: 0.28,
    appear: 0.4,
    travel: [0.44, 0.96],
};

const B: Plan = {
    slot: 4,
    r: EMERGE.dropB,
    start: [1.25, 1.18],
    bend: -0.34,
    appear: 0.6,
    travel: [0.72, 1.36],
};

/** Cuánto se ha condensado una gota (fracción de su volumen). */
function condensed(plan: Plan, t: number): number {
    const grow = easeOut((t - plan.appear) / 0.22, 2.6);

    return t < plan.appear ? 0 : grow * grow;
}

/** Absorción de A: rápida al principio, se calma al llenarse. */
function absorbA(t: number): number {
    return easeOut((t - 0.96) / 0.28);
}

/**
 * Absorción de B: casi toda de golpe y una cola lenta que deja una
 * protuberancia lateral durante un instante.
 */
function absorbB(t: number): number {
    if (t < 1.36) {
        return 0;
    }

    if (t < 1.56) {
        return 0.7 * easeOut((t - 1.36) / 0.2);
    }

    return 0.7 + 0.3 * smooth(1.56, 2.06, t);
}

const TOTAL = EMERGE.core ** 2 + EMERGE.dropA ** 2 + EMERGE.dropB ** 2;

type DropState = { approach: number; absorbed: number; dir: [number, number] };

/**
 * Coloca una gota: aparece, recorre un camino curvo hacia el cuerpo
 * alargándose, y al tocarlo se hunde mientras cede su volumen.
 */
function placeDrop(
    ctx: EmergeContext,
    plan: Plan,
    t: number,
    mass: number,
    absorbed: number,
): DropState {
    const sep = EMERGE.separation;
    const sx = plan.start[0] * sep;
    const sy = plan.start[1] * sep;
    // Dirección fija desde el núcleo hacia la salida: camino estable.
    const ox = sx - CORE_AT[0];
    const oy = sy - CORE_AT[1];
    const len = Math.hypot(ox, oy) || 1;
    const dir: [number, number] = [ox / len, oy / len];
    const u = (t - plan.travel[0]) / (plan.travel[1] - plan.travel[0]);
    const approach = clamp01(u);

    if (t < plan.appear) {
        ctx.drop(plan.slot, null);

        return { approach: 0, absorbed: 0, dir };
    }

    // Se condensa en su sitio (no «aparece» de golpe).
    const grow = easeOut((t - plan.appear) / 0.22, 2.6);
    const radius = plan.r * grow * Math.sqrt(1 - absorbed);

    // Casi vacía ya es parte del cuerpo: se retira antes de ser una mota.
    if (absorbed >= 0.985 || radius < 0.004) {
        ctx.drop(plan.slot, null);

        return { approach, absorbed, dir };
    }

    // Punto de contacto: viaja con el cuerpo, que también se mueve.
    const reach = (mass + plan.r) * 0.94;
    const ex = ctx.body.x + dir[0] * reach;
    const ey = ctx.body.y + dir[1] * reach;
    let x: number;
    let y: number;

    if (absorbed <= 0) {
        // Bézier cuadrática con el control desplazado: curvas cortas y
        // asimétricas, nada de órbitas.
        const e = easeIn(approach);
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        const px = -(ey - sy);
        const py = ex - sx;
        const cx = mx + px * plan.bend;
        const cy = my + py * plan.bend;
        const k = 1 - e;
        x = k * k * sx + 2 * k * e * cx + e * e * ex;
        y = k * k * sy + 2 * k * e * cy + e * e * ey;
    } else {
        // Se vacía a través del cuello: sigue pegada a la superficie mientras
        // su volumen pasa al cuerpo, y el puente se ensancha hasta integrarla.
        const left = plan.r * Math.sqrt(1 - absorbed);
        const d = mass + left * lerp(0.9, 0.35, absorbed);
        x = ctx.body.x + dir[0] * d;
        y = ctx.body.y + dir[1] * d;
    }

    // Se alarga hacia el punto de encuentro y se relaja al integrarse.
    const toward = Math.atan2(ctx.body.y - y, ctx.body.x - x);
    const stretch =
        1 +
        (EMERGE.stretch - 1) *
            smooth(0.35, 0.95, approach) *
            (1 - smooth(0, 0.55, absorbed));
    // El frente se adelanta un poco: forma de lágrima, no de huevo.
    const lead = plan.r * (stretch - 1) * 0.35;
    // Su brillo de esfera propia se apaga al formarse el puente (según la
    // distancia real entre superficies): unida, no queda ningún borde interno.
    const gap = Math.hypot(x - ctx.body.x, y - ctx.body.y) - mass - radius;
    const glass = absorbed > 0 ? 0 : smooth(0.12, 0.55, gap);

    ctx.drop(plan.slot, {
        x: x + Math.cos(toward) * lead,
        y: y + Math.sin(toward) * lead,
        r: radius,
        stretch,
        angle: toward,
        glass,
    });

    return { approach, absorbed, dir };
}

/* ── Coreografía ────────────────────────────────────────────────────── */

const SPRINGS: Partial<Record<Channel, SpringConfig>> = {
    x: { w: 6, z: 0.62 },
    y: { w: 6, z: 0.62 },
    sx: { w: 20, z: 0.5 },
    lean: { w: 9, z: 0.55 },
    rot: { w: 9, z: 0.55 },
    bx: { w: 9, z: 0.6 },
    by: { w: 9, z: 0.6 },
    gx: { w: 13, z: 0.75 },
    gy: { w: 13, z: 0.75 },
    face: { w: 10, z: 1 },
    wob: { w: 5, z: 1 },
};

/** Muelles del principio de la aparición (canales sin muelle propio usan el habitual). */
export function emergeSprings(): Partial<Record<Channel, SpringConfig>> {
    return SPRINGS;
}

/** Tiempo nominal (2,8 s) a partir del tiempo real de la secuencia. */
export function nominalTime(elapsed: number): number {
    return (elapsed * NOMINAL) / EMERGE.duration;
}

export function phaseAt(t: number): KaiEmergePhase {
    let phase: KaiEmergePhase = 'pulse';

    for (const p of EMERGE_PHASES) {
        if (t >= p.from) {
            phase = p.id;
        }
    }

    return phase;
}

/**
 * Un fotograma de la aparición. `t` en segundos nominales (0-2,8).
 * Devuelve la fase en curso.
 */
export function emergeFrame(t: number, ctx: EmergeContext): KaiEmergePhase {
    const amp = ctx.amp;
    const el = EMERGE.elasticity;

    /* Volumen: el núcleo se condensa y cada gota cede el suyo al cuerpo. */
    const core = easeOut(t / 0.16, 2.4);
    const aA = absorbA(t);
    const aB = absorbB(t);
    const mass = Math.sqrt(
        (EMERGE.core ** 2 * core +
            EMERGE.dropA ** 2 * aA +
            EMERGE.dropB ** 2 * aB) /
            TOTAL,
    );
    ctx.mass(mass);
    // El líquido que ya existe (núcleo y gotas condensadas) no crece ni
    // mengua al fundirse: el puente toma su volumen de las masas que une.
    const existing =
        (EMERGE.core ** 2 * core +
            EMERGE.dropA ** 2 * condensed(A, t) +
            EMERGE.dropB ** 2 * condensed(B, t)) /
        TOTAL;
    ctx.volume(existing, 1 - smooth(2.2, 2.6, t));
    ctx.presence(smooth(0, 0.1, t));

    const a = placeDrop(ctx, A, t, mass, aA);
    const b = placeDrop(ctx, B, t, mass, aB);

    /* 1. Primer pulso: se comprime y se expande una vez. */
    let sx = 1;
    let y = 0;

    if (t > 0.15 && t < 0.42) {
        sx = t < 0.24 ? 1 + 0.13 * el : t < 0.31 ? 1 - 0.1 * el : 1;
        y = t < 0.24 ? 0.02 : t < 0.31 ? -0.03 : 0;
    }

    /* 2-3. Atracción y fusión: el cuerpo se tiende hacia cada gota. */
    const tide = (s: DropState) =>
        smooth(0.45, 0.95, s.approach) * (1 - smooth(0.1, 0.6, s.absorbed));
    const pA = tide(a);
    const pB = tide(b);
    // La cola de B: protuberancia lateral que se absorbe con suavidad.
    const tail = smooth(1.46, 1.64, t) * (1 - smooth(1.78, 2.14, t));
    let bx = a.dir[0] * 0.17 * pA + b.dir[0] * (0.17 * pB + 0.12 * tail);
    let by = a.dir[1] * 0.17 * pA + b.dir[1] * (0.17 * pB + 0.12 * tail);
    let lean = a.dir[0] * 0.06 * pA + b.dir[0] * 0.05 * pB;
    let rot = 0;

    // El centro va del núcleo desplazado al de reposo; la gota que entra
    // tira de él un momento (inercia de la masa que llega).
    const home = 1 - smooth(0.9, 1.85, t);
    const pullA = Math.sin(Math.PI * aA) * 0.08;
    const pullB = Math.sin(Math.PI * Math.min(1, aB / 0.7)) * 0.07;
    let x = CORE_AT[0] * home + a.dir[0] * pullA + b.dir[0] * pullB;
    y += CORE_AT[1] * home + a.dir[1] * pullA + b.dir[1] * pullB;

    // Cada incorporación empuja la masa y lanza una onda por el contorno.
    if (aA > 0) {
        const angle = Math.atan2(a.dir[1], a.dir[0]);
        ctx.wave(1, angle, 0.075 * amp * el);
        ctx.nudge(1, -a.dir[0] * 0.6 * el, -a.dir[1] * 0.6 * el);
    }

    if (aB > 0) {
        const angle = Math.atan2(b.dir[1], b.dir[0]);
        ctx.wave(2, angle, 0.065 * amp * el);
        ctx.nudge(2, -b.dir[0] * 0.5 * el, -b.dir[1] * 0.5 * el);
    }

    const busy = smooth(0.95, 1.2, t) * (1 - smooth(1.75, 2.3, t));
    ctx.set('wob', 1 + 0.75 * busy);

    /* 4. Despertar: ojos cerrados que se abren; mira la última gota. */
    ctx.set('face', t < 1.6 ? 0 : 1);
    let closeL = 1;
    let closeR = 1;
    let bend = 0.1;
    let eyeW = 0.72;
    let open = 1;
    let eyeH = 0.92;
    let gx = 0;
    let gy = 0.04;

    if (t >= 1.8) {
        // Abre a medias (primero el izquierdo), parpadea y abre del todo.
        closeL = t < 1.93 ? 0.5 : t < 2 ? 0.9 : 0;
        closeR = t < 1.84 ? 1 : t < 1.93 ? 0.55 : t < 2 ? 0.9 : 0;
        // Entreabiertos y planos (aún adormilados), no «◠» de alegría.
        bend = t < 2 ? 0.15 : 1;
        eyeW = 1;
        eyeH = 1;
    }

    if (t >= 2) {
        open = 1.06;
        eyeH = 1.04;
    }

    if (t > 1.84 && t < 2.06) {
        // «¿Y eso?»: la mirada va a la protuberancia que se absorbe.
        gx = 0.62 * b.dir[0];
        gy = 0.5 * b.dir[1];
    }

    /* 5. Reconocimiento: inclinación curiosa y rebote de asentamiento. */
    if (t > 2.14 && t < 2.48) {
        rot = 0.13;
        lean += 0.04;
        gx = 0.12;
        open = 1.08;
        eyeH = 1.05;
    }

    // Un parpadeo tranquilo durante la inclinación: está despierto.
    if (t >= 2.32) {
        ctx.blink(1);
    }

    if (t >= 2.48) {
        const springy = { w: 13, z: 0.42 / el };
        ctx.spring('sx', springy);
        ctx.spring('y', { w: 11, z: 0.45 / el });
        sx = t < 2.57 ? 1 + 0.085 * el : t < 2.66 ? 1 - 0.05 * el : 1;
        y = t < 2.57 ? 0.035 : t < 2.66 ? -0.035 : 0;
        open = t < 2.66 ? 1.04 : 1;
        eyeH = t < 2.66 ? 1.02 : 1;
        gx = 0;
        gy = 0;
    }

    // Las capas de reposo (flotar, respirar, derivar) entran al final, así
    // el relevo al motor habitual no salta.
    ctx.set('float', smooth(1.85, 2.4, t));
    ctx.set('breath', smooth(1.7, 2.3, t));
    ctx.set('drift', smooth(2, 2.7, t));

    if (t >= 2.62) {
        bx = 0;
        by = 0;
        lean = 0;
        rot = 0;
        x = 0;
    }

    ctx.set('x', x);
    ctx.set('y', y);
    ctx.set('sx', sx);
    ctx.set('bx', bx);
    ctx.set('by', by);
    ctx.set('lean', lean);
    ctx.set('rot', rot);
    ctx.set('closeL', closeL);
    ctx.set('closeR', closeR);
    ctx.set('bendL', bend);
    ctx.set('bendR', bend);
    ctx.set('eyeW', eyeW);
    ctx.set('eyeH', eyeH);
    ctx.set('open', open);
    ctx.set('gx', gx);
    ctx.set('gy', gy);

    return phaseAt(t);
}

/**
 * Movimiento reducido: aparece con suavidad y abre los ojos, sin
 * trayectorias, deformaciones ni rebotes. `t` en segundos reales.
 */
export function emergeReducedFrame(
    t: number,
    ctx: EmergeContext,
): KaiEmergePhase {
    ctx.mass(1);
    ctx.volume(1, 0);
    ctx.presence(smooth(0, 0.5, t));
    ctx.set('face', 1);
    const awake = t >= 0.45;
    ctx.set('closeL', awake ? 0 : 1);
    ctx.set('closeR', awake ? 0 : 1);
    ctx.set('bendL', awake ? 1 : 0.1);
    ctx.set('bendR', awake ? 1 : 0.1);

    return 'gentle';
}
