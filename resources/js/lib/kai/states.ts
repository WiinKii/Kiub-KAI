/**
 * Estados y reacciones de KAI.
 *
 * Cada estado define su pose final, una entrada escalonada (cues), su
 * comportamiento (parpadeo, miradas) y un «rig»: una función que en cada
 * fotograma coloca lóbulos, manos y gotas (satélites del fluido) y emite
 * partículas. Los satélites que un rig deja de usar se reabsorben solos.
 *
 * Tiempos en segundos; distancias y radios relativos al radio del cuerpo;
 * ángulos en radianes (0 = derecha, -π/2 = arriba) relativos al cuerpo.
 */

import type { Channel, PoseTargets, SpringConfig } from './motion';
import type { EmitOptions, SpriteKind } from './sprites';
import type { KaiReaction, KaiState } from './types';

export type Cue = {
    at: number;
    set?: PoseTargets;
    /** Muelle para los canales de `set`; por canal o común. */
    spring?: SpringConfig | Partial<Record<Channel, SpringConfig>>;
    blink?: boolean;
};

export type RigContext = {
    /** Segundos desde que empezó el estado o el gesto. */
    t: number;
    /** Lóbulos y motas ambientales permitidos (no en tamaño mínimo). */
    ambient: boolean;
    /** Mirada actual (para orientar lóbulos). */
    gx: number;
    gy: number;
    /**
     * Satélite en polares respecto al cuerpo. `falloff` es la caída en el
     * campo: 3 (por defecto) se funde ancho; 4-5 deja un cuello visible,
     * como una mano o un lóbulo con forma propia.
     */
    sat: (
        slot: number,
        angle: number,
        dist: number,
        r: number,
        spring?: SpringConfig,
        falloff?: number,
    ) => void;
    /** Satélite en cartesianas respecto al centro del cuerpo. */
    satXY: (
        slot: number,
        x: number,
        y: number,
        r: number,
        spring?: SpringConfig,
        falloff?: number,
    ) => void;
    /** Sustituye el objetivo de un canal en este fotograma. */
    set: (ch: Channel, value: number) => void;
    /** Partícula; posición y velocidad relativas al cuerpo (en radios). */
    emit: (kind: SpriteKind, o: EmitOptions) => void;
    /** `true` una vez por intervalo. */
    every: (id: number, interval: number) => boolean;
    /** `true` la primera vez que `t` alcanza `at`. */
    once: (id: number, at: number) => boolean;
    rand: () => number;
    /** Alguien dirige su mirada (puntero o `lookAt`): sin gestos espontáneos. */
    engaged: boolean;
    /** Memoria propia de la instancia; se vacía al cambiar de estado o gesto. */
    mem: Record<string, number>;
};

export type Rig = (c: RigContext) => void;

export type Periodic = { every: [number, number]; cues: Cue[] };

export type StateBehavior = {
    breath: number;
    blink: [number, number] | null;
    saccade: {
        every: [number, number];
        amount: number;
        hold: [number, number];
    } | null;
    lookWeight: number;
    bodyFollow: number;
    drift?: { x: number; y: number; speed: number };
    periodic?: Periodic;
};

export type StateDef = {
    pose: PoseTargets;
    /** Satélites «sólidos»: se separan aunque estén muy cerca (cargando). */
    tight?: boolean;
    enter?: Cue[];
    behavior: StateBehavior;
    rig?: Rig;
};

export type ReactionDef = {
    duration: number;
    cues: Cue[];
    rig?: Rig;
    /** Variante para movimiento reducido: solo expresión. */
    reduced: Cue[];
    reducedDuration: number;
};

const TAU = Math.PI * 2;
const PI = Math.PI;

function smooth(a: number, b: number, t: number): number {
    const u = Math.max(0, Math.min(1, (t - a) / (b - a)));

    return u * u * (3 - 2 * u);
}

const soft: SpringConfig = { w: 7, z: 0.72 };
const quick: SpringConfig = { w: 18, z: 0.62 };
const snap: SpringConfig = { w: 26, z: 0.55 };
const limb: SpringConfig = { w: 9, z: 0.55 };
const floaty: SpringConfig = { w: 4.5, z: 0.7 };

/* Ojos con forma: cápsula, «◠», «◡», «—». */
const HAPPY = { closeL: 1, closeR: 1, bendL: 1, bendR: 1 };
const CONTENT = { closeL: 1, closeR: 1, bendL: -1, bendR: -1 };
const CLOSED = { closeL: 1, closeR: 1, bendL: 0.15, bendR: 0.15 };
const OPEN = { closeL: 0, closeR: 0, bendL: 1, bendR: 1 };

const calmBehavior: StateBehavior = {
    breath: 4.2,
    blink: [2.6, 6],
    saccade: { every: [2.4, 5.5], amount: 0.22, hold: [0.6, 1.6] },
    lookWeight: 0.75,
    bodyFollow: 0.08,
};

/* ── Rigs de estados ───────────────────────────────────────────────── */

/** Reposo vivo: «manitas» que respiran y migran, y motas que orbitan. */
const idleRig: Rig = (c) => {
    if (!c.ambient) {
        return;
    }

    const t = c.t;
    // Los lóbulos aparecen y se reabsorben en ciclos lentos.
    const presence = smooth(-0.35, 0.55, Math.sin((t / 15) * TAU + 1.3));

    if (presence > 0.03) {
        // Como en la pose base de la referencia: uno mayor abajo a la
        // izquierda y otro menor en el costado derecho, cada uno con su
        // cuello (no una falda que se funde con el cuerpo).
        c.sat(
            0,
            2.62 + 0.16 * Math.sin(t * 0.42),
            0.84 + 0.42 * presence + 0.04 * Math.sin(t * 0.9),
            0.3 * presence,
            floaty,
            4,
        );
        c.sat(
            1,
            0.18 + 0.18 * Math.sin(t * 0.31 + 2),
            0.8 + 0.4 * presence + 0.04 * Math.sin(t * 1.1 + 1),
            0.19 * presence,
            floaty,
            4,
        );
    }

    // Entre ciclo y ciclo, una gotita brota arriba, se suelta, flota un
    // momento y vuelve a fundirse (se reabsorbe al dejar de pedirla).
    const u = ((t % 15) - 5.8) / 5;

    if (u > 0 && u < 0.86) {
        const grow = smooth(0, 0.28, u);
        const free = smooth(0.3, 0.5, u);
        c.sat(
            2,
            -1.1 + 0.1 * Math.sin(t * 0.8),
            0.82 + 0.2 * grow + 0.45 * free + 0.05 * Math.sin(t * 1.6) * free,
            0.17 * grow - 0.055 * free,
            { w: 5.5, z: 0.62 },
            5,
        );
    }

    idleFidget(c);

    c.sat(6, t * 0.32 + 2.6, 1.48 + 0.08 * Math.sin(t * 0.7), 0.05, floaty);
    c.sat(
        7,
        -t * 0.24 + 0.5,
        1.56 + 0.1 * Math.sin(t * 0.5 + 1),
        0.034,
        floaty,
    );
};

/**
 * De vez en cuando, en reposo, un gesto breve y distinto (mirar alrededor,
 * sacudirse como un cachorro mojado, tararear): así el reposo largo, el de la
 * intranet, no se vuelve un bucle.
 */
const FIDGET_LENGTH = [2.3, 1.2, 2.6];

function idleFidget(c: RigContext): void {
    const m = c.mem;
    m.next ??= 10 + c.rand() * 8;

    if (m.start === undefined) {
        if (c.t < m.next) {
            return;
        }

        m.start = c.t;
        m.fired = 0;
        // Nunca dos veces seguidas el mismo.
        m.kind = ((m.kind ?? -1) + 1 + Math.floor(c.rand() * 2)) % 3;
    }

    const u = c.t - m.start;

    // Si alguien le está mirando, no aparta la vista para mirar alrededor.
    if (u > FIDGET_LENGTH[m.kind] || (m.kind === 0 && c.engaged)) {
        delete m.start;
        m.next = c.t + 18 + c.rand() * 12;

        return;
    }

    if (m.kind === 0) {
        // Mira a un lado, luego al otro: los ojos primero, el cuerpo después.
        if (u > 0.15 && u < 2.05) {
            c.set('gx', u < 1.05 ? -0.75 : 0.75);
            c.set('gy', 0.08);
        }
    } else if (m.kind === 1) {
        // Sacudida: giro rápido que se apaga y ojitos felices.
        const env = smooth(0, 0.12, u) * (1 - smooth(0.6, 1.1, u));
        c.set('rot', 0.13 * env * Math.sin(u * TAU * 5.5));
        c.set('wob', 1 + 1.6 * env);
        c.set('closeL', 1);
        c.set('closeR', 1);
        c.set('bendL', 1);
        c.set('bendR', 1);

        if (u > 0.35 && !m.fired) {
            m.fired = 1;

            for (const side of [-1, 1]) {
                c.emit('dot', {
                    x: side * 0.95,
                    y: -0.1,
                    vx: side * (0.8 + 0.3 * c.rand()),
                    vy: -0.55,
                    ay: 1.6,
                    size: 0.035,
                    life: 0.7,
                    tint: 3,
                });
            }
        }
    } else {
        // Tararea: ojos «◡», se mece y suelta una nota.
        const env = smooth(0, 0.3, u) * (1 - smooth(2.1, 2.6, u));
        c.set('rot', 0.06 * env * Math.sin((u / 1.3) * TAU));
        c.set('closeL', env);
        c.set('closeR', env);
        c.set('bendL', -1);
        c.set('bendR', -1);
        c.set('blush', 0.45 * env);
        c.set('mSmile', 0.35 + 0.5 * env);

        if (u > 0.5 && !m.fired) {
            m.fired = 1;
            c.emit('note', {
                x: 0.75,
                y: -0.35,
                vx: 0.25,
                vy: -0.35,
                size: 0.16,
                life: 1.8,
                sway: 0.2,
                tint: 1,
            });
        }
    }
}

/** Curioso: un lóbulo se asoma hacia donde mira. */
const curiousRig: Rig = (c) => {
    const side = c.gx >= 0 ? 1 : -1;
    const angle = side > 0 ? -0.35 : PI + 0.35;
    c.sat(0, angle, 1.1 + 0.05 * Math.sin(c.t * 1.7), 0.17, limb);
};

/** Pensando: una gota sube como una idea, flota y vuelve. */
const thinkingRig: Rig = (c) => {
    const p = (c.t % 4.4) / 4.4;

    if (p > 0.08 && p < 0.88) {
        const up = smooth(0.08, 0.3, p) - smooth(0.62, 0.86, p);
        c.sat(2, -1.2 + 0.08 * Math.sin(c.t * 2), 0.95 + 0.7 * up, 0.12, {
            w: 6,
            z: 0.62,
        });
    }
};

/** Trabajando: el contorno hierve y dos motas giran alrededor. */
const workingRig: Rig = (c) => {
    c.sat(6, c.t * 1.5, 1.34, 0.045, quick);
    c.sat(7, c.t * 1.5 + PI, 1.34, 0.034, quick);

    if (c.every(0, 0.42)) {
        const a = c.rand() * TAU;
        c.emit('dot', {
            x: Math.cos(a) * 1.05,
            y: Math.sin(a) * 1.05,
            vx: Math.cos(a) * 0.3,
            vy: Math.sin(a) * 0.3 - 0.15,
            size: 0.022,
            life: 1.1,
            tint: 3,
        });
    }
};

/** Cargando: el cuerpo se divide en una fila de gotas que laten en onda. */
const LOADING = [0.62, 0.46, 0.27];

const loadingRig: Rig = (c) => {
    // Medidas en radios del cuerpo ya encogido: gotas como en la referencia
    // (1 : 0,62 : 0,46 : 0,27) y un puntito en cada extremo.
    const beat = (i: number): number =>
        1 + 0.1 * Math.sin(c.t * TAU * 0.9 - i * 0.95);
    const spring = { w: 8, z: 0.58 };
    let x = 1 + 0.36;

    LOADING.forEach((r, i) => {
        x += r;
        c.satXY(i, x, 0.03 * Math.sin(c.t * 3 + i), r * beat(i + 1), spring);
        x += r + 0.36;
    });
    c.satXY(3, x + 0.1, 0, 0.15 * beat(4), spring);
    c.satXY(4, -1.45, 0, 0.15 * beat(0), spring);
};

/** Esperando: se sienta sobre dos «patitas». */
const waitingRig: Rig = (c) => {
    if (c.ambient) {
        c.sat(0, 2.25, 1.04, 0.16, floaty);
        c.sat(1, 0.9, 1.04, 0.16, floaty);
    }
};

/** Contento: nube de lóbulos que migran mientras se mece. */
const contentRig: Rig = (c) => {
    const t = c.t;
    c.sat(0, -0.95 + 0.4 * Math.sin(t * 0.45), 1.08, 0.27, floaty);
    c.sat(1, 0.2 + 0.45 * Math.sin(t * 0.37 + 1.3), 1.1, 0.23, floaty);

    if (c.ambient) {
        c.sat(2, 2.5 + 0.25 * Math.sin(t * 0.5 + 2), 1.1, 0.21, floaty);
    }

    c.set('rot', 0.09 * Math.sin((t / 3.2) * TAU));
    c.set('x', 0.05 * Math.sin((t / 6.4) * TAU));

    // De vez en cuando abre los ojos un momento y vuelve a cerrarlos.
    if (t % 7 > 5.7) {
        c.set('closeL', 0);
        c.set('closeR', 0);
    }
};

/** Música: se balancea al ritmo y le salen notas. */
const musicRig: Rig = (c) => {
    const t = c.t;
    const beat = Math.abs(Math.sin((PI * t) / 0.5));
    c.set('y', -0.08 * beat + 0.1 * Math.sin((t / 5.2) * TAU));
    c.set('x', 0.42 * Math.sin((t / 6) * TAU));
    c.set('rot', 0.1 * Math.sin((PI * t) / 1));
    c.set('mOpen', 0.12 + 0.28 * beat);

    // Ráfagas de notas que brotan de un costado, como en la referencia.
    if (c.every(0, 1.7)) {
        const side = c.rand() < 0.5 ? -1 : 1;

        for (let i = 0; i < 3; i++) {
            c.emit(i === 1 ? 'notes' : 'note', {
                x: side * (0.72 + 0.25 * c.rand()),
                y: -0.15 + 0.5 * (c.rand() - 0.5),
                vx: side * (0.2 + 0.45 * c.rand()),
                vy: -0.15 - 0.5 * c.rand(),
                size: 0.2 - 0.03 * i,
                life: 1.6 + 0.4 * c.rand(),
                sway: 0.2,
                tint: i % 2,
            });
        }

        c.emit('star', {
            x: side * 0.95,
            y: 0.3,
            vx: side * 0.4,
            vy: -0.1,
            size: 0.06,
            life: 1.1,
            tint: 3,
        });
    }
};

/** Dormido: respiración profunda y zetas que suben. */
const sleepingRig: Rig = (c) => {
    c.set('sx', 1.05 + 0.04 * Math.sin((c.t / 4.4) * TAU));
    c.set('mOpen', 0.12 + 0.08 * Math.sin((c.t / 4.4) * TAU));

    if (c.every(0, 1.6)) {
        c.emit('z', {
            x: 0.45,
            y: -0.75,
            vx: 0.14,
            vy: -0.32,
            size: 0.085,
            life: 2.6,
            sway: 0.12,
            tint: 3,
        });
    }
};

/** Tímido: se encoge, sube las «manitas» junto a las mejillas y mira de reojo. */
const shyRig: Rig = (c) => {
    const fidget = 0.05 * Math.sin(c.t * 2.2);
    c.sat(0, 2.55 + fidget, 1.02, 0.18, limb);
    c.sat(1, 0.6 - fidget, 1.02, 0.18, limb);
    const peek = c.t % 4 > 3.1;
    c.set('gx', peek ? 0.05 : -0.5);
    c.set('gy', peek ? 0.05 : 0.38);
};

/**
 * Aviso: mira el globito de arriba a la derecha, alza una manita a su lado y
 * después te mira a ti («tienes algo»), con un saltito de vez en cuando.
 */
const noticeRig: Rig = (c) => {
    const p = c.t % 4.2;
    const raise = smooth(0.2, 0.55, p) - smooth(2.2, 2.7, p);

    if (raise > 0.02) {
        c.sat(
            0,
            -0.3 + 0.07 * Math.sin(c.t * 9) * raise,
            0.95 + 0.28 * raise,
            0.13 + 0.04 * raise,
            limb,
            4.5,
        );
    }

    // Si alguien le mira, le atiende a él.
    if (!c.engaged) {
        const atBadge = p < 2.4;
        c.set('gx', atBadge ? 0.6 : 0.05);
        c.set('gy', atBadge ? -0.62 : 0.1);
    }

    if (p > 2.75 && p < 3.25) {
        const hop = Math.sin(((p - 2.75) / 0.5) * PI);
        c.set('y', -0.1 * hop);
        c.set('sx', 1 - 0.06 * hop);
    }
};

/* ── Estados ───────────────────────────────────────────────────────── */

export const STATES: Record<KaiState, StateDef> = {
    idle: {
        pose: { ...OPEN },
        behavior: calmBehavior,
        rig: idleRig,
    },

    attentive: {
        pose: {
            ...OPEN,
            gx: 0.6,
            gy: 0.18,
            open: 1.04,
            eyeH: 1.05,
            sx: 0.98,
            mSmile: 0.25,
        },
        enter: [
            { at: 0, set: { gx: 0.6, gy: 0.18, open: 1.06 } },
            { at: 0.16, set: { sx: 0.98 }, spring: soft },
        ],
        behavior: {
            breath: 3.8,
            blink: [2.8, 5.5],
            saccade: { every: [4, 8], amount: 0.06, hold: [0.4, 0.8] },
            lookWeight: 1,
            bodyFollow: 0.3,
        },
    },

    curious: {
        pose: {
            ...OPEN,
            gx: 0.72,
            gy: -0.14,
            bx: 0.1,
            by: -0.04,
            lean: 0.07,
            sx: 1.03,
            asym: 0.55,
            tilt: 0.06,
            open: 1.04,
            mSmile: 0,
            mOpen: 0.18,
            mWide: 0.55,
        },
        enter: [
            { at: 0, set: { gx: 0.72, gy: -0.14, open: 1.06 } },
            {
                at: 0.18,
                set: { bx: 0.1, by: -0.04, lean: 0.07, sx: 1.03 },
                spring: { w: 8, z: 0.55 },
            },
            { at: 0.3, set: { asym: 0.55, tilt: 0.06 } },
        ],
        behavior: {
            breath: 3.6,
            blink: [2.4, 5],
            saccade: { every: [2.5, 5], amount: 0.1, hold: [0.3, 0.7] },
            lookWeight: 0.9,
            bodyFollow: 0.1,
        },
        rig: curiousRig,
    },

    thinking: {
        pose: {
            ...OPEN,
            gx: -0.15,
            gy: -0.62,
            ripple: 1,
            wob: 1.4,
            open: 0.94,
            sx: 0.99,
            mSmile: -0.1,
            mWave: 0.5,
            mWide: 0.6,
        },
        enter: [
            { at: 0, set: { gx: -0.3, gy: -0.62, open: 0.94 } },
            { at: 0.25, set: { ripple: 1, wob: 1.4, sx: 0.99 } },
        ],
        behavior: {
            breath: 5,
            blink: [3.5, 7],
            saccade: null,
            lookWeight: 0.15,
            bodyFollow: 0.06,
            drift: { x: 0.34, y: 0.08, speed: 0.35 },
        },
        rig: thinkingRig,
    },

    working: {
        pose: {
            ...CLOSED,
            gx: 0,
            gy: 0.18,
            sep: 0.9,
            pulse: 1,
            boil: 1,
            wob: 0.6,
            breath: 0,
            sx: 1.02,
            flow: 2.4,
            face: 0.9,
            mSmile: 0,
            mWide: 0.6,
        },
        enter: [
            { at: 0, set: { ...CLOSED, gx: 0, gy: 0.18, sep: 0.9 } },
            {
                at: 0.12,
                set: {
                    sx: 1.02,
                    wob: 0.6,
                    breath: 0,
                    pulse: 1,
                    boil: 1,
                    flow: 2.4,
                },
            },
        ],
        behavior: {
            breath: 4,
            blink: null,
            saccade: null,
            lookWeight: 0.1,
            bodyFollow: 0,
        },
        rig: workingRig,
    },

    loading: {
        tight: true,
        pose: {
            ...CLOSED,
            x: -0.8,
            scale: 0.5,
            face: 0,
            flow: 1.8,
            float: 0.4,
            drift: 0,
            wob: 0.4,
        },
        enter: [
            { at: 0, set: { ...CLOSED } },
            {
                at: 0.15,
                set: { face: 0, scale: 0.5, x: -0.8 },
                spring: { w: 6, z: 0.75 },
            },
        ],
        behavior: {
            breath: 3,
            blink: null,
            saccade: null,
            lookWeight: 0,
            bodyFollow: 0,
        },
        rig: loadingRig,
    },

    doubt: {
        pose: {
            ...OPEN,
            gx: 0.3,
            gy: -0.34,
            rot: 0.14,
            lean: -0.03,
            bx: 0.05,
            by: -0.07,
            squint: 0.55,
            asym: -0.25,
            tilt: 0.1,
            cool: 0.25,
            mSmile: -0.15,
            mWave: 0.7,
            mWide: 0.7,
        },
        enter: [
            { at: 0, set: { gx: 0.3, gy: -0.34 } },
            {
                at: 0.22,
                set: { rot: 0.14, lean: -0.03, bx: 0.05, by: -0.07 },
                spring: { w: 7.5, z: 0.7 },
            },
            { at: 0.3, set: { squint: 0.55, asym: -0.25, tilt: 0.1 } },
        ],
        behavior: {
            breath: 4.6,
            blink: [3, 6.5],
            saccade: null,
            lookWeight: 0.3,
            bodyFollow: 0.03,
            periodic: {
                every: [4.5, 7],
                cues: [
                    { at: 0, set: { rot: 0.19 }, spring: soft },
                    { at: 0.5, set: { rot: 0.14 }, spring: soft },
                ],
            },
        },
    },

    error: {
        pose: {
            ...OPEN,
            lean: -0.05,
            x: -0.02,
            sx: 1.04,
            flat: 0.5,
            eyeH: 1.12,
            eyeW: 1.04,
            gx: 0.25,
            gy: 0.34,
            cool: 0.55,
            mSmile: -0.05,
            mWide: 0.6,
        },
        enter: [
            { at: 0, set: { open: 0.55, sx: 1.03 }, spring: snap },
            {
                at: 0.09,
                set: {
                    open: 1,
                    lean: -0.15,
                    x: -0.07,
                    sx: 1.08,
                    eyeH: 1.15,
                    cool: 0.55,
                    mOpen: 0.25,
                },
                spring: { w: 13, z: 0.58 },
            },
            {
                at: 0.55,
                set: {
                    lean: -0.05,
                    x: -0.02,
                    sx: 1.04,
                    flat: 0.5,
                    eyeH: 1.12,
                    eyeW: 1.04,
                    gx: 0.25,
                    gy: 0.34,
                    mOpen: 0,
                },
                spring: soft,
            },
        ],
        behavior: {
            breath: 4.4,
            blink: [3, 6],
            saccade: null,
            lookWeight: 0.4,
            bodyFollow: 0.04,
        },
    },

    waiting: {
        pose: {
            ...OPEN,
            flat: 0.8,
            sx: 1.05,
            y: 0.04,
            open: 0.96,
            eyeH: 0.9,
            gy: 0.1,
            wob: 0.7,
            float: 0.5,
            mSmile: 0.45,
        },
        enter: [
            {
                at: 0,
                set: { flat: 0.8, sx: 1.05, y: 0.04 },
                spring: { w: 5, z: 0.85 },
            },
            { at: 0.2, set: { open: 0.96, eyeH: 0.9, gy: 0.1, wob: 0.7 } },
        ],
        behavior: {
            breath: 5.6,
            blink: [3.5, 7.5],
            saccade: null,
            lookWeight: 0.6,
            bodyFollow: 0.04,
            periodic: {
                every: [8, 13],
                cues: [
                    {
                        at: 0,
                        set: { gx: -0.35, gy: 0.02 },
                        spring: { w: 9, z: 0.9 },
                    },
                    {
                        at: 1.6,
                        set: { gx: 0, gy: 0.1 },
                        spring: { w: 7, z: 0.9 },
                    },
                ],
            },
        },
        rig: waitingRig,
    },

    content: {
        pose: {
            ...CONTENT,
            blush: 0.75,
            mSmile: 0.8,
            mCat: 0.45,
            mWide: 0.9,
            wob: 1.3,
        },
        enter: [
            { at: 0, set: { closeL: 1, closeR: 1, bendL: -1, bendR: -1 } },
            { at: 0.25, set: { blush: 0.75, mSmile: 0.8, mCat: 0.45 } },
        ],
        behavior: {
            breath: 4.8,
            blink: null,
            saccade: null,
            lookWeight: 0.2,
            bodyFollow: 0,
        },
        rig: contentRig,
    },

    music: {
        pose: {
            ...CLOSED,
            bendL: 0.35,
            bendR: 0.35,
            blush: 0.3,
            mSmile: 0.4,
            mWide: 0.65,
            flow: 1.6,
        },
        enter: [{ at: 0, set: { ...CLOSED, bendL: 0.35, bendR: 0.35 } }],
        behavior: {
            breath: 4,
            blink: null,
            saccade: null,
            lookWeight: 0,
            bodyFollow: 0,
        },
        rig: musicRig,
    },

    sleeping: {
        pose: {
            ...CONTENT,
            bendL: -0.35,
            bendR: -0.35,
            y: 0.06,
            flat: 0.6,
            float: 0.35,
            drift: 0.2,
            blush: 0.25,
            mSmile: 0.1,
            mWide: 0.5,
            flow: 0.4,
            wob: 0.6,
        },
        enter: [
            { at: 0, set: { closeL: 0.6, closeR: 0.6 } },
            {
                at: 0.5,
                set: { closeL: 1, closeR: 1, bendL: -0.35, bendR: -0.35 },
                spring: soft,
            },
            {
                at: 0.6,
                set: { y: 0.06, flat: 0.6 },
                spring: { w: 3.5, z: 0.9 },
            },
        ],
        behavior: {
            breath: 4.4,
            blink: null,
            saccade: null,
            lookWeight: 0,
            bodyFollow: 0,
        },
        rig: sleepingRig,
    },

    shy: {
        pose: {
            ...OPEN,
            gx: -0.5,
            gy: 0.38,
            sx: 0.95,
            scale: 0.96,
            lean: -0.05,
            rot: -0.08,
            blush: 1,
            eyeH: 0.92,
            mSmile: 0.2,
            mWave: 0.6,
            mWide: 0.55,
        },
        enter: [
            { at: 0, set: { blush: 1, gx: -0.5, gy: 0.38 } },
            {
                at: 0.15,
                set: { sx: 0.95, scale: 0.96, lean: -0.05, rot: -0.08 },
                spring: soft,
            },
        ],
        behavior: {
            breath: 3.8,
            blink: [2, 4.5],
            saccade: null,
            lookWeight: 0.2,
            bodyFollow: 0.05,
        },
        rig: shyRig,
    },

    notice: {
        pose: {
            ...OPEN,
            gx: 0.6,
            gy: -0.62,
            open: 1.06,
            eyeH: 1.04,
            lean: 0.03,
            blush: 0.2,
            mSmile: 0.5,
        },
        enter: [
            { at: 0, set: { gx: 0.6, gy: -0.62, open: 1.12 }, spring: quick },
            {
                at: 0.05,
                set: { y: -0.12, sx: 0.92 },
                spring: { w: 16, z: 0.5 },
            },
            { at: 0.28, set: { y: 0, sx: 1 }, spring: { w: 11, z: 0.4 } },
        ],
        behavior: {
            breath: 3.6,
            blink: [2.4, 5],
            saccade: null,
            lookWeight: 0.4,
            bodyFollow: 0.08,
        },
        rig: noticeRig,
    },
};

/* ── Rigs de reacciones ────────────────────────────────────────────── */

/** Saludo: un brazo crece, se desprende como mano y saluda (con guiño). */
const welcomeRig: Rig = (c) => {
    const t = c.t;

    if (t > 0.2 && t < 2.8) {
        const grow = smooth(0.25, 0.55, t);
        const free = smooth(0.55, 0.9, t) - smooth(2.25, 2.7, t);
        const wave =
            t > 0.85 && t < 2.3
                ? Math.sin(((t - 0.85) / 0.44) * TAU) *
                  0.3 *
                  smooth(0.85, 1.05, t)
                : 0;
        c.sat(
            0,
            -0.62 + wave,
            0.9 + 0.28 * grow + 0.36 * free,
            0.2 + 0.05 * grow,
            { w: 12, z: 0.55 },
        );
    }

    if (t > 0.3 && t < 2.6) {
        c.sat(1, 2.45, 1.1, 0.19, floaty);
    }
};

/** Éxito: manitas arriba y hacia fuera en el salto, y destellos. */
const successRig: Rig = (c) => {
    const t = c.t;

    if (t > 0.12 && t < 1.35) {
        const up = smooth(0.12, 0.35, t);
        // A los lados, algo alzadas y agitándose: manos, no «orejas».
        const jazz = 0.14 * Math.sin(t * 14) * up;
        const arm = { w: 13, z: 0.5 };
        c.sat(0, -2.8 - jazz, 1.0 + 0.3 * up, 0.18, arm, 5);
        c.sat(1, -0.34 + jazz, 1.0 + 0.3 * up, 0.18, arm, 5);
    }

    if (c.once(0, 0.42)) {
        for (let i = 0; i < 4; i++) {
            const a = -PI / 2 + (i - 1.5) * 0.65;
            c.emit('star', {
                x: Math.cos(a) * 1.05,
                y: Math.sin(a) * 1.05,
                vx: Math.cos(a) * 0.7,
                vy: Math.sin(a) * 0.7,
                size: 0.08 + 0.03 * (i % 2),
                life: 0.9,
                tint: i % 2 ? 1 : 3,
            });
        }
    }
};

/** Sorpresa: dos gotitas saltan a los lados y vuelven. */
const surprisedRig: Rig = (c) => {
    if (c.t > 0.07 && c.t < 0.55) {
        c.sat(2, -0.35, 1.55, 0.085, quick);
        c.sat(3, PI + 0.35, 1.55, 0.075, quick);
    }
};

/** Baile: dos brazos que giran con el balanceo y se desplaza de lado. */
const danceRig: Rig = (c) => {
    const t = c.t;
    const env = smooth(0.1, 0.5, t) * (1 - smooth(3.6, 4.1, t));
    const ph = (t / 1.1) * TAU;
    const swing = Math.sin(ph);
    c.set('x', 0.26 * Math.sin((t / 2.2) * TAU) * env);
    c.set('y', -0.07 * Math.abs(Math.sin(ph)) * env);
    c.set('rot', 0.2 * swing * env);
    c.set('sx', 1 + 0.05 * Math.cos(ph * 2) * env);

    if (env > 0.02) {
        c.sat(
            0,
            -0.3 + 0.5 * swing,
            0.75 + 0.38 * env,
            0.27 * env + 0.02,
            limb,
        );
        c.sat(
            1,
            PI + 0.3 + 0.5 * swing,
            0.75 + 0.38 * env,
            0.27 * env + 0.02,
            limb,
        );
    }
};

/** Encantado: ojos de corazón, rubor y corazones que suben. */
const loveRig: Rig = (c) => {
    const t = c.t;
    c.set('y', -0.05 * Math.abs(Math.sin((t / 0.9) * TAU)));
    c.set('rot', 0.07 * Math.sin((t / 1.8) * TAU));

    if (t < 2 && c.every(0, 0.42)) {
        const side = c.rand() < 0.5 ? -1 : 1;
        c.emit('heart', {
            x: side * (0.5 + c.rand() * 0.3),
            y: -0.7,
            vx: side * 0.15,
            vy: -0.55,
            size: 0.09 + c.rand() * 0.04,
            life: 1.5,
            sway: 0.18,
            tint: 2,
        });
    }
};

/** Cosquillas: se sacude riendo. */
const giggleRig: Rig = (c) => {
    const decay = 1 - smooth(0.9, 1.4, c.t);
    c.set('rot', 0.11 * Math.sin(c.t * TAU * 5) * decay);
    c.set('sx', 1 + 0.07 * Math.sin(c.t * TAU * 6.5) * decay);
    c.set('y', -0.04 * Math.abs(Math.sin(c.t * TAU * 3)) * decay);
};

/** Idea: una gota salta por arriba, flota y vuelve como una antena. */
const ideaRig: Rig = (c) => {
    const t = c.t;

    if (t > 0.05 && t < 2.3) {
        const up = smooth(0.05, 0.45, t);
        const back = smooth(1.45, 1.85, t);
        const merge = smooth(1.9, 2.25, t);
        const dist =
            0.95 +
            0.72 * up -
            0.42 * back -
            0.3 * merge +
            0.04 * Math.sin(t * 6) * (1 - back);
        c.sat(2, -1.25, dist, 0.13, { w: 6.5, z: 0.6 });
    }

    if (t < 2.3) {
        c.sat(1, 0.75, 1.1, 0.2, floaty);
    }

    if (c.once(0, 0.55)) {
        c.emit('star', {
            x: 0.35,
            y: -1.6,
            vx: 0.1,
            vy: -0.25,
            size: 0.07,
            life: 0.9,
            tint: 3,
        });
    }
};

/** Mareo: gira en círculos con ojos de espiral y estrellas encima. */
const dizzyRig: Rig = (c) => {
    const t = c.t;
    const w = TAU / 1.05;
    // Tambaleo: crece, se mantiene y se apaga antes del traspié.
    const env = smooth(0.2, 0.6, t) * (1 - smooth(2.35, 2.75, t));

    if (env > 0.001) {
        // Ocho de borracho, con la parte de arriba retrasada (pesa).
        c.set('x', 0.2 * env * Math.sin(t * w));
        c.set('y', 0.06 * env * Math.sin(t * w * 2));
        c.set('rot', 0.3 * env * Math.sin(t * w + 0.9));
        c.set('lean', 0.14 * env * Math.sin(t * w + 1.6));
        c.set('sx', 1 + 0.1 * env * Math.sin(t * w * 2 + 0.5));
        c.set('gx', 0.55 * Math.sin(t * w * 0.7));
        c.set('gy', 0.2 * Math.cos(t * w));

        // El fluido chapotea: dos lóbulos dan vueltas alrededor del cuerpo.
        const slosh = -t * w * 1.25;
        c.sat(
            0,
            slosh + PI,
            0.93 + 0.08 * Math.sin(t * 5),
            0.24 * env,
            limb,
            3.5,
        );
        c.sat(1, slosh + 0.4, 0.95, 0.13 * env, limb, 4);
    }

    // Traspié: se le van los pies, se aplasta como un charco y se ladea.
    const plop = smooth(2.5, 2.8, t) - smooth(3.1, 3.45, t);

    if (plop > 0.001) {
        c.set('y', 0.12 * plop);
        c.set('flat', 0.75 * plop);
        c.set('sx', 1 + 0.16 * plop);
        c.set('rot', -0.16 * plop);
    }

    // Se sacude para despejarse…
    if (t > 3.15 && t < 3.85) {
        const k = 1 - smooth(3.15, 3.85, t);
        c.set('rot', 0.15 * k * Math.sin((t - 3.15) * TAU * 7));
        c.set('wob', 1 + 2 * k);
    }

    // …y da un saltito de alivio.
    if (t > 3.8 && t < 4.25) {
        const hop = Math.sin(((t - 3.8) / 0.45) * PI);
        c.set('y', -0.09 * hop);
        c.set('sx', 1 - 0.06 * hop);
    }

    if (c.once(0, 0.15)) {
        for (let i = 0; i < 3; i++) {
            c.emit('star', {
                x: 0,
                y: -1.15,
                orbit: 0.45,
                orbitW: 3.4,
                orbitPhase: (i / 3) * TAU,
                size: 0.075,
                life: 2.6,
                tint: i === 1 ? 1 : 3,
            });
        }
    }

    // Al aplastarse salpica un par de gotitas.
    if (c.once(1, 2.72)) {
        for (const side of [-1, 1]) {
            c.emit('dot', {
                x: side * 0.9,
                y: 0.55,
                vx: side * 0.9,
                vy: -0.7,
                ay: 2,
                size: 0.04,
                life: 0.7,
                tint: 3,
            });
        }
    }
};

/** Explorar: viaja a un lado mirando, con una gota rezagada, y vuelve. */
const exploreRig: Rig = (c) => {
    const t = c.t;
    const go = smooth(0.2, 1.0, t) - smooth(2.2, 3.1, t);
    c.set('x', 0.5 * go);
    c.set(
        'gx',
        t < 2.0 ? 0.95 : t < 2.3 ? 0.15 : -0.9 * (1 - smooth(3.1, 3.6, t)),
    );
    c.set(
        'lean',
        t < 1.0 ? 0.06 * smooth(0.1, 0.4, t) : t > 2.2 && t < 3.1 ? -0.06 : 0,
    );

    if (t > 0.15 && t < 1.45) {
        c.sat(
            3,
            PI - 0.4,
            1.12 + 0.4 * smooth(0.2, 0.55, t) - 0.5 * smooth(0.9, 1.4, t),
            0.16,
            { w: 5, z: 0.6 },
        );
    }

    if (t > 2.25 && t < 3.5) {
        c.sat(
            3,
            -0.4,
            1.12 + 0.4 * smooth(2.3, 2.65, t) - 0.5 * smooth(3.0, 3.45, t),
            0.16,
            { w: 5, z: 0.6 },
        );
    }
};

/* ── Reacciones ────────────────────────────────────────────────────── */

export const REACTIONS: Record<KaiReaction, ReactionDef> = {
    welcome: {
        duration: 3,
        cues: [
            {
                at: 0,
                set: { sx: 1.1, y: 0.03, open: 0.6, gx: 0, gy: 0.05 },
                spring: { w: 15, z: 0.8 },
            },
            {
                at: 0.2,
                set: {
                    y: -0.12,
                    sx: 0.95,
                    open: 1.06,
                    eyeH: 1.05,
                    blush: 0.55,
                    mSmile: 0.9,
                    mOpen: 0.3,
                    lean: 0.05,
                    rot: 0.06,
                },
                spring: { y: { w: 8, z: 0.6 }, sx: { w: 12, z: 0.5 } },
            },
            { at: 0.75, set: { gx: 0.35, gy: -0.25 } },
            { at: 0.95, set: { closeR: 1, bendR: 1, gx: 0.1, gy: 0 } },
            { at: 1.9, set: { closeR: 0 } },
            {
                at: 2.3,
                set: { y: 0, sx: 1.03, lean: 0, rot: 0, mOpen: 0, eyeH: 1 },
                spring: { w: 8, z: 0.55 },
            },
            { at: 2.7, set: { sx: 1, blush: 0.15, mSmile: 0.45 } },
        ],
        rig: welcomeRig,
        reduced: [
            { at: 0, set: { closeR: 1, bendR: 1, blush: 0.5, mSmile: 0.9 } },
            { at: 1.2, set: { closeR: 0, blush: 0 } },
        ],
        reducedDuration: 1.5,
    },

    success: {
        duration: 2,
        cues: [
            {
                at: 0,
                set: { sx: 1.12, y: 0.04, flat: 1, open: 0.35 },
                spring: { w: 16, z: 0.75 },
            },
            {
                at: 0.16,
                set: {
                    y: -0.4,
                    sx: 0.86,
                    flat: 0,
                    ...HAPPY,
                    open: 1,
                    by: -0.06,
                    blush: 0.6,
                    mSmile: 1,
                    mOpen: 0.55,
                    mWide: 1.15,
                },
                spring: { y: { w: 13, z: 0.62 }, sx: { w: 18, z: 0.45 } },
            },
            {
                at: 0.43,
                set: { y: 0, sx: 1, by: 0 },
                spring: { y: { w: 15, z: 0.5 }, sx: { w: 10, z: 0.6 } },
            },
            {
                at: 0.56,
                set: { sx: 1.08, wob: 2.6 },
                spring: { sx: { w: 22, z: 0.4 }, wob: { w: 10, z: 1 } },
            },
            { at: 0.66, set: { sx: 1 }, spring: { w: 11, z: 0.3 } },
            { at: 1.05, set: { wob: 1, mOpen: 0.15 } },
            {
                at: 1.35,
                set: { ...OPEN, blush: 0.15, mOpen: 0, mWide: 1, mSmile: 0.5 },
                spring: { w: 9, z: 0.7 },
            },
        ],
        rig: successRig,
        reduced: [
            { at: 0, set: { ...HAPPY, blush: 0.5, mSmile: 1, mOpen: 0.4 } },
            { at: 1.2, set: { ...OPEN, blush: 0, mOpen: 0, mSmile: 0.35 } },
        ],
        reducedDuration: 1.5,
    },

    surprised: {
        duration: 1,
        cues: [
            { at: 0, set: { sx: 1.05, open: 0.6 }, spring: { w: 30, z: 0.7 } },
            {
                at: 0.07,
                set: {
                    sx: 0.82,
                    y: -0.08,
                    eyeH: 1.38,
                    eyeW: 1.15,
                    open: 1.05,
                    sep: 1.07,
                    gx: 0,
                    gy: -0.08,
                    mOpen: 0.7,
                    mSmile: 0,
                    mWide: 0.55,
                },
                spring: { w: 22, z: 0.48 },
            },
            {
                at: 0.4,
                set: {
                    sx: 1,
                    y: 0,
                    eyeH: 1,
                    eyeW: 1,
                    sep: 1,
                    gy: 0,
                    mOpen: 0.1,
                },
                spring: {
                    sx: { w: 16, z: 0.72 },
                    y: { w: 14, z: 0.8 },
                    eyeH: { w: 12, z: 0.7 },
                },
            },
            { at: 0.8, set: { mOpen: 0, mWide: 1, mSmile: 0.35 } },
        ],
        rig: surprisedRig,
        reduced: [
            { at: 0, set: { eyeH: 1.3, eyeW: 1.12, mOpen: 0.6, mWide: 0.55 } },
            { at: 0.6, set: { eyeH: 1, eyeW: 1, mOpen: 0, mWide: 1 } },
        ],
        reducedDuration: 0.8,
    },

    dance: {
        duration: 4.2,
        cues: [
            {
                at: 0,
                set: { ...HAPPY, blush: 0.45, mSmile: 1, mOpen: 0.35, flow: 2 },
            },
            {
                at: 3.8,
                set: { ...OPEN, blush: 0.1, mOpen: 0, mSmile: 0.5, flow: 1 },
            },
        ],
        rig: danceRig,
        reduced: [
            { at: 0, set: { ...HAPPY, blush: 0.4, mSmile: 1 } },
            { at: 1.6, set: { ...OPEN, blush: 0 } },
        ],
        reducedDuration: 2,
    },

    love: {
        duration: 2.6,
        cues: [
            { at: 0, set: { sx: 1.08, open: 0.5 }, spring: { w: 16, z: 0.7 } },
            {
                at: 0.12,
                set: {
                    heart: 1,
                    blush: 1,
                    mCat: 0.8,
                    mSmile: 0.7,
                    mWide: 0.8,
                    sx: 1,
                    eyeH: 1.1,
                },
                spring: { heart: { w: 14, z: 0.5 } },
            },
            {
                at: 2.1,
                set: { heart: 0, blush: 0.3, mCat: 0, mSmile: 0.45, eyeH: 1 },
            },
        ],
        rig: loveRig,
        reduced: [
            { at: 0, set: { heart: 1, blush: 1, mCat: 0.8 } },
            { at: 1.6, set: { heart: 0, blush: 0, mCat: 0 } },
        ],
        reducedDuration: 2,
    },

    giggle: {
        duration: 1.5,
        cues: [
            {
                at: 0,
                set: { sx: 1.16, scale: 0.95, open: 0.4 },
                spring: { w: 22, z: 0.5 },
            },
            {
                at: 0.1,
                set: {
                    ...HAPPY,
                    open: 1,
                    scale: 1,
                    blush: 0.85,
                    mOpen: 0.55,
                    mSmile: 1,
                    mWide: 1.15,
                },
            },
            {
                at: 1.2,
                set: { ...OPEN, blush: 0.2, mOpen: 0, mWide: 1, mSmile: 0.5 },
            },
        ],
        rig: giggleRig,
        reduced: [
            { at: 0, set: { ...HAPPY, blush: 0.8, mOpen: 0.45, mSmile: 1 } },
            { at: 1, set: { ...OPEN, blush: 0, mOpen: 0 } },
        ],
        reducedDuration: 1.2,
    },

    idea: {
        duration: 2.4,
        cues: [
            {
                at: 0,
                set: {
                    eyeH: 1.22,
                    eyeW: 1.08,
                    open: 1.06,
                    gx: 0.2,
                    gy: -0.6,
                    mOpen: 0.45,
                    mWide: 0.5,
                    mSmile: 0,
                },
                spring: quick,
            },
            {
                at: 0.15,
                set: { y: -0.06, sx: 0.95 },
                spring: { w: 12, z: 0.5 },
            },
            {
                at: 0.6,
                set: { mOpen: 0.15, mSmile: 0.8, mWide: 1, blush: 0.25 },
            },
            { at: 1.5, set: { gx: 0, gy: 0, eyeH: 1, eyeW: 1, y: 0, sx: 1 } },
            { at: 2.1, set: { mOpen: 0, blush: 0.1 } },
        ],
        rig: ideaRig,
        reduced: [
            { at: 0, set: { eyeH: 1.2, mOpen: 0.4, mWide: 0.5 } },
            { at: 1, set: { eyeH: 1, mOpen: 0, mWide: 1, mSmile: 0.8 } },
        ],
        reducedDuration: 1.4,
    },

    dizzy: {
        duration: 4.3,
        cues: [
            {
                at: 0,
                set: {
                    spiral: 1,
                    wob: 2.6,
                    boil: 0.45,
                    mWave: 1,
                    mOpen: 0.12,
                    mSmile: -0.1,
                    mWide: 0.8,
                },
                spring: { spiral: { w: 10, z: 0.6 } },
            },
            {
                at: 3.15,
                set: {
                    ...CLOSED,
                    spiral: 0,
                    boil: 0,
                    mWave: 0,
                    mOpen: 0,
                    mSmile: 0.1,
                },
                spring: { spiral: { w: 14, z: 0.7 } },
            },
            {
                at: 3.8,
                set: { ...OPEN, wob: 1, mSmile: 0.45 },
                spring: { w: 18, z: 0.55 },
                blink: true,
            },
        ],
        rig: dizzyRig,
        reduced: [
            { at: 0, set: { spiral: 1, mWave: 1 } },
            { at: 1.6, set: { spiral: 0, mWave: 0 } },
        ],
        reducedDuration: 2,
    },

    explore: {
        duration: 3.8,
        cues: [
            {
                at: 0,
                set: { open: 1.05, mOpen: 0.15, mWide: 0.6, mSmile: 0.2 },
            },
            { at: 3.4, set: { mOpen: 0, mWide: 1, mSmile: 0.4 } },
        ],
        rig: exploreRig,
        reduced: [
            { at: 0, set: { gx: 0.9 } },
            { at: 1, set: { gx: -0.9 } },
            { at: 2, set: { gx: 0 } },
        ],
        reducedDuration: 2.4,
    },

    yawn: {
        duration: 2.3,
        cues: [
            {
                at: 0.05,
                set: {
                    pull: 0.45,
                    closeL: 1,
                    closeR: 1,
                    bendL: -0.5,
                    bendR: -0.5,
                },
                spring: { pull: { w: 5, z: 0.8 } },
            },
            {
                at: 0.25,
                set: { mOpen: 0.95, mWide: 0.8, mSmile: 0 },
                spring: { w: 6, z: 0.85 },
            },
            {
                at: 1.35,
                set: { pull: 0, mOpen: 0, mWide: 1, mSmile: 0.3 },
                spring: { pull: { w: 10, z: 0.3 } },
            },
            { at: 1.7, set: { closeL: 0, closeR: 0 }, spring: soft },
        ],
        reduced: [
            {
                at: 0,
                set: {
                    closeL: 1,
                    closeR: 1,
                    bendL: -0.5,
                    bendR: -0.5,
                    mOpen: 0.8,
                },
            },
            { at: 1.2, set: { closeL: 0, closeR: 0, mOpen: 0 } },
        ],
        reducedDuration: 1.6,
    },

    boing: {
        duration: 0.9,
        cues: [
            { at: 0, set: { sx: 1.16, y: 0.03 }, spring: { w: 20, z: 0.6 } },
            {
                at: 0.1,
                set: { sx: 0.86, y: -0.1, eyeH: 1.15 },
                spring: { w: 16, z: 0.45 },
            },
            {
                at: 0.3,
                set: { sx: 1, y: 0, eyeH: 1 },
                spring: { w: 11, z: 0.32 },
            },
        ],
        reduced: [],
        reducedDuration: 0.3,
    },

    nod: {
        duration: 0.95,
        cues: [
            {
                at: 0,
                set: { y: 0.06, gy: 0.45, sx: 1.04, eyeH: 0.86, mSmile: 0.6 },
                spring: { w: 18, z: 0.6 },
            },
            {
                at: 0.17,
                set: { y: -0.01, gy: 0.05, sx: 1 },
                spring: { w: 16, z: 0.6 },
            },
            {
                at: 0.35,
                set: { y: 0.05, gy: 0.4, sx: 1.03 },
                spring: { w: 18, z: 0.6 },
            },
            {
                at: 0.53,
                set: { y: 0, gy: 0, sx: 1, eyeH: 1 },
                spring: { w: 12, z: 0.55 },
            },
        ],
        reduced: [
            { at: 0, set: { gy: 0.4 } },
            { at: 0.3, set: { gy: 0 } },
        ],
        reducedDuration: 0.6,
    },
};

/** Muelles con nombre para reutilizar desde el laboratorio. */
export const CUE_SPRINGS = { snap, quick, soft, limb, floaty };
