/**
 * Aparición «Una corriente que cobra vida».
 *
 * Corriente: un cuerpo de agua entra por abajo a la izquierda siguiendo una
 * curva ascendente. La punta concentra el volumen y arrastra una estela que
 * se afina; empieza rápido y frena al llegar. En el centro la punta gira y
 * dibuja una «S»; la cola sigue por inercia, se pliega hacia la punta, se
 * tocan (puente líquido) y todo se reúne en una masa suspendida. La masa se
 * estira hacia arriba, se ensancha y es KAI: los ojos aparecen cerrados y se
 * abren mientras se acomoda. Llega tarde una última gotita por un costado;
 * KAI la mira, oscila dos veces, parpadea y se inclina hacia el formulario.
 *
 * Igual que la Convergencia, es una función pura del tiempo evaluada por el
 * motor en su propio reloj.
 */

import type { EmergeContext } from './emerge';
import type { KaiEmergePhase } from './types';

export const STREAM = {
    /** Duración total a velocidad normal (s). */
    duration: 2.9,
    /** Retraso entre segmentos de la estela (s): más, estela más larga. */
    lag: 0.055,
    /** Elasticidad del estiramiento, el ensanche y las dos oscilaciones. */
    elasticity: 1,
    /** Mirada final hacia el formulario (-1…1). */
    lookTo: 0.32,
};

export const STREAM_PHASES: { id: KaiEmergePhase; from: number }[] = [
    { id: 'current', from: 0 },
    { id: 'fold', from: 0.85 },
    { id: 'awakening', from: 1.45 },
    { id: 'recognition', from: 2.2 },
];

const NOMINAL = 2.9;

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(a: number, b: number, t: number): number {
    const u = clamp01((t - a) / (b - a));

    return u * u * (3 - 2 * u);
}

function easeOut(u: number, p = 2.4): number {
    return 1 - Math.pow(1 - clamp01(u), p);
}

/* ── Camino de la corriente (radios desde el centro de reposo) ──────── */

/**
 * Entra por abajo a la izquierda, sube en curva, pasa a la derecha del
 * centro, gira hacia arriba y se curva de vuelta a la izquierda: la «S».
 */
const CONTROL: [number, number][] = [
    [-3.5, 2.7],
    [-2.2, 2.25],
    [-1.05, 1.45],
    [0.25, 0.55],
    [0.85, -0.25],
    [0.55, -0.95],
    [-0.15, -0.95],
    [-0.42, -0.55],
];

const SAMPLES = 240;

/** Polilínea por Catmull-Rom y su longitud acumulada (para ir a velocidad real). */
const PATH = (() => {
    const pts: [number, number][] = [];
    const n = CONTROL.length;

    for (let i = 0; i < n - 1; i++) {
        const p0 = CONTROL[Math.max(0, i - 1)];
        const p1 = CONTROL[i];
        const p2 = CONTROL[i + 1];
        const p3 = CONTROL[Math.min(n - 1, i + 2)];
        const steps = SAMPLES / (n - 1);

        for (let k = 0; k < steps; k++) {
            const t = k / steps;
            const t2 = t * t;
            const t3 = t2 * t;
            const f = (a: number, b: number, c: number, d: number) =>
                0.5 *
                (2 * b +
                    (-a + c) * t +
                    (2 * a - 5 * b + 4 * c - d) * t2 +
                    (-a + 3 * b - 3 * c + d) * t3);
            pts.push([
                f(p0[0], p1[0], p2[0], p3[0]),
                f(p0[1], p1[1], p2[1], p3[1]),
            ]);
        }
    }

    pts.push(CONTROL[n - 1]);
    const acc = [0];

    for (let i = 1; i < pts.length; i++) {
        acc.push(
            acc[i - 1] +
                Math.hypot(
                    pts[i][0] - pts[i - 1][0],
                    pts[i][1] - pts[i - 1][1],
                ),
        );
    }

    return { pts, acc, length: acc[acc.length - 1] };
})();

/** Punto del camino a la fracción `s` (0-1) de su longitud, y su dirección. */
function along(s: number): { x: number; y: number; angle: number } {
    const target = clamp01(s) * PATH.length;
    let lo = 0;
    let hi = PATH.acc.length - 1;

    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;

        if (PATH.acc[mid] < target) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    const span = PATH.acc[hi] - PATH.acc[lo] || 1;
    const u = (target - PATH.acc[lo]) / span;
    const a = PATH.pts[lo];
    const b = PATH.pts[hi];

    return {
        x: a[0] + (b[0] - a[0]) * u,
        y: a[1] + (b[1] - a[1]) * u,
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
    };
}

/** Avance de la punta: rápido al entrar y frenando al llegar (s nominales). */
function headProgress(t: number): number {
    return easeOut(t / 1.12, 2.1);
}

/** Final del camino: donde se reúne la masa. */
const GATHER = CONTROL[CONTROL.length - 1];

/* Punta y estela: la punta concentra el volumen; la estela se afina. */
const RADII = [0.56, 0.46, 0.42, 0.38, 0.33, 0.28, 0.23, 0.18, 0.13];
const MICRO = 0.075;
const TOTAL = RADII.reduce((sum, r) => sum + r * r, 0) + MICRO * MICRO;
/** Gotita tardía: llega por la izquierda cuando KAI ya está formado. */
const LATE: [number, number] = [-1.02, 0.12];

export function streamPhaseAt(t: number): KaiEmergePhase {
    let phase: KaiEmergePhase = 'current';

    for (const p of STREAM_PHASES) {
        if (t >= p.from) {
            phase = p.id;
        }
    }

    return phase;
}

export function streamNominal(elapsed: number): number {
    return (elapsed * NOMINAL) / STREAM.duration;
}

/** Un fotograma de la corriente. `t` en segundos nominales (0-2,9). */
export function streamFrame(t: number, ctx: EmergeContext): KaiEmergePhase {
    const el = STREAM.elasticity;
    let absorbedVolume = 0;
    let existing = 0;

    // La corriente aparece ya en movimiento (entra desde fuera del panel),
    // translúcida como agua; gana cuerpo al reunirse.
    ctx.presence(smooth(0, 0.06, t) * (0.78 + 0.22 * smooth(1.1, 1.7, t)));
    // Mientras corre es un cuerpo pequeño; el volumen se concentra al plegarse.
    const slim = 0.7 + 0.3 * smooth(0.7, 1.2, t);

    RADII.forEach((r0, i) => {
        // Cada segmento recorre el mismo camino con retraso: la cola sigue
        // avanzando cuando la punta frena, y por eso se pliega hacia ella.
        const local = t - i * STREAM.lag;
        const s = headProgress(local);
        const p = along(s);
        // Al llegar al final del camino se vacía en la masa.
        const arrive = 1.0 + i * STREAM.lag * 0.85;
        const absorbed = easeOut((t - arrive) / 0.42, 1.8);
        const grow = smooth(0, 0.08 + i * 0.012, local) * slim;
        existing += r0 * r0 * grow * grow;
        absorbedVolume += r0 * r0 * absorbed;

        if (local <= 0 || absorbed >= 0.985) {
            ctx.drop(i, null);

            return;
        }

        const radius = r0 * grow * Math.sqrt(1 - absorbed);

        // Se estira en la dirección de avance, más cuanto más rápido va.
        const speed = Math.max(0, 1 - s);
        const stretch = 1 + 0.38 * speed * (1 - absorbed);
        const pull = absorbed > 0 ? easeOut(absorbed, 1.6) : 0;
        ctx.drop(i, {
            x: p.x + (GATHER[0] - p.x) * pull,
            y: p.y + (GATHER[1] - p.y) * pull,
            r: radius,
            stretch,
            angle: p.angle,
            // Brillo propio solo mientras viaja suelta.
            glass: i === 0 ? 0.6 * (1 - smooth(0.7, 1.0, t)) : 0.35 * speed,
        });
    });

    // Microgotas: siguen la corriente con más retraso; una se funde con la
    // estela y la otra llega tarde por el costado izquierdo de KAI.
    const tail = headProgress(t - 0.42);
    const m = along(tail);
    const mIn = easeOut((t - 1.55) / 0.3);

    if (t > 0.42 && mIn < 0.985) {
        ctx.drop(9, {
            x: m.x - 0.18 * Math.sin(m.angle) + (GATHER[0] - m.x) * mIn,
            y: m.y + 0.18 * Math.cos(m.angle) + (GATHER[1] - m.y) * mIn,
            r: 0.06 * Math.sqrt(1 - mIn),
            stretch: 1,
            angle: 0,
            glass: 1,
        });
    } else {
        ctx.drop(9, null);
    }

    const lateT = t - 0.7;
    const lateAbs = easeOut((t - 2.06) / 0.2);
    existing += MICRO * MICRO * smooth(0, 0.1, lateT);
    absorbedVolume += MICRO * MICRO * lateAbs;

    if (lateT > 0 && lateAbs < 0.985) {
        // Primero va con la corriente; al final se desvía hacia el costado.
        const lp = along(headProgress(lateT));
        const veer = smooth(1.55, 2.06, t);
        const sx = LATE[0] * 0.92 + ctx.body.x * 0.08;
        const sy = LATE[1] + ctx.body.y * 0.1;
        ctx.drop(10, {
            x: lp.x + (sx - lp.x) * veer + (ctx.body.x - sx) * lateAbs * 0.4,
            y: lp.y + (sy - lp.y) * veer,
            r: MICRO * 1.6 * Math.sqrt(1 - lateAbs),
            stretch: 1 + 0.25 * veer * (1 - lateAbs),
            angle: Math.atan2(ctx.body.y - sy, ctx.body.x - sx),
            glass: 1 - smooth(1.9, 2.06, t),
        });
    } else {
        ctx.drop(10, null);
    }

    if (lateAbs > 0) {
        ctx.wave(1, Math.PI + 0.1, 0.06 * ctx.amp * el);
        ctx.nudge(1, 0.45 * el, -0.05);
    }

    /* Volumen: lo que llega se suma a la masa, que se forma en el pliegue. */
    ctx.mass(Math.sqrt(absorbedVolume / TOTAL));
    ctx.volume(existing / TOTAL, 1 - smooth(2.3, 2.7, t));

    // El cuerpo nace donde se reúne la corriente y baja a su sitio al tomar
    // forma (con la inercia de los muelles).
    const settle = smooth(1.5, 2.05, t);
    ctx.set('x', GATHER[0] * (1 - settle));
    ctx.set('y', GATHER[1] * (1 - settle));

    /* La masa se estira hacia arriba y después se ensancha: es KAI. */
    let sx = 1;

    if (t > 1.45 && t < 1.6) {
        sx = 1 - 0.27 * el;
    } else if (t >= 1.6 && t < 1.78) {
        sx = 1 + 0.1 * el;
    } else if (t >= 1.78 && t < 1.95) {
        sx = 1 - 0.05 * el;
    }

    ctx.spring('sx', { w: 16, z: 0.5 });
    ctx.set('sx', sx);
    ctx.set('wob', 1 + 0.9 * smooth(0.9, 1.2, t) * (1 - smooth(1.9, 2.5, t)));

    /* Ojos: aparecen cerrados mientras se acomoda y se abren. */
    ctx.set('face', t < 1.62 ? 0 : 1);
    const awake = t >= 1.96;
    ctx.set('closeL', t < 1.84 ? 1 : t < 1.9 ? 0.45 : t < 1.96 ? 0.9 : 0);
    ctx.set('closeR', t < 1.87 ? 1 : t < 1.9 ? 0.5 : t < 1.96 ? 0.9 : 0);
    ctx.set('bendL', awake ? 1 : 0.15);
    ctx.set('bendR', awake ? 1 : 0.15);
    ctx.set('eyeW', t < 1.84 ? 0.75 : 1);
    ctx.set('open', awake && t < 2.3 ? 1.07 : 1);

    // Mirada: la gotita tardía (izquierda), luego al frente y al formulario.
    let gx = 0;
    let gy = 0.04;

    if (t > 2.08 && t < 2.34) {
        gx = -0.62;
        gy = 0.12;
    } else if (t >= 2.5) {
        gx = STREAM.lookTo;
    }

    ctx.set('gx', gx);
    ctx.set('gy', gy);

    /* Dos oscilaciones suaves y decrecientes, parpadeo e inclinación. */
    let rot = 0;

    if (t > 2.22 && t < 2.74) {
        const u = (t - 2.22) / 0.52;
        rot = 0.085 * el * Math.sin(u * Math.PI * 2) * (1 - u);
    }

    ctx.set('rot', rot);
    ctx.set('lean', smooth(2.55, 2.8, t) * 0.035);

    if (t >= 2.58) {
        ctx.blink(1);
    }

    ctx.set('float', smooth(2.1, 2.7, t));
    ctx.set('breath', smooth(2, 2.6, t));
    ctx.set('drift', smooth(2.3, 2.9, t));

    return streamPhaseAt(t);
}
