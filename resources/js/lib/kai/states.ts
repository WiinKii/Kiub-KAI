/**
 * Estados y reacciones de KAI.
 *
 * Cada estado define su pose final, una entrada escalonada (cues) y su
 * comportamiento mientras dura. Las reacciones son gestos con tres tiempos:
 * anticipación, gesto principal y recuperación.
 *
 * Tiempos en segundos; distancias relativas al radio del cuerpo.
 */

import type { Channel, PoseTargets, SpringConfig } from './motion';
import type { KaiReaction, KaiState } from './types';

export type DropSpawn = {
    /** Dirección de salida en radianes (0 = derecha, -π/2 = arriba). */
    angle: number;
    /** Distancia que recorre fuera del contorno. */
    distance: number;
    /** Radio de la gota. */
    size: number;
    /** Tiempo hasta que vuelve a integrarse. */
    hold: number;
};

export type Cue = {
    at: number;
    set?: PoseTargets;
    /** Muelle para los canales de `set`; por canal o común. */
    spring?: SpringConfig | Partial<Record<Channel, SpringConfig>>;
    drops?: DropSpawn[];
    blink?: boolean;
};

export type Periodic = {
    /** Intervalo aleatorio entre repeticiones. */
    every: [number, number];
    cues: Cue[];
};

export type StateBehavior = {
    /** Periodo de respiración. */
    breath: number;
    /** Intervalo entre parpadeos; `null` sin parpadeo espontáneo. */
    blink: [number, number] | null;
    /** Miradas breves alrededor del punto de atención. */
    saccade: {
        every: [number, number];
        amount: number;
        hold: [number, number];
    } | null;
    /** Cuánto atiende a `lookAt` o al puntero (0-1). */
    lookWeight: number;
    /** Cuánto sigue el cuerpo a la mirada. */
    bodyFollow: number;
    /** Deriva lenta de la mirada (pensando). */
    drift?: { x: number; y: number; speed: number };
    periodic?: Periodic;
};

export type StateDef = {
    pose: PoseTargets;
    enter?: Cue[];
    behavior: StateBehavior;
};

export type ReactionDef = {
    duration: number;
    cues: Cue[];
    /** Variante para movimiento reducido: solo expresión, sin saltos. */
    reduced: Cue[];
    reducedDuration: number;
};

const snap: SpringConfig = { w: 26, z: 0.55 };
const quick: SpringConfig = { w: 18, z: 0.62 };
const soft: SpringConfig = { w: 7, z: 0.72 };
const bouncy: SpringConfig = { w: 12, z: 0.38 };

const calmBehavior: StateBehavior = {
    breath: 4.2,
    blink: [2.6, 6],
    saccade: { every: [3.5, 7.5], amount: 0.14, hold: [0.6, 1.4] },
    lookWeight: 0.7,
    bodyFollow: 0.05,
};

export const STATES: Record<KaiState, StateDef> = {
    idle: {
        pose: {},
        behavior: calmBehavior,
    },

    attentive: {
        pose: { gx: 0.52, gy: 0.18, open: 1.04, eyeH: 1.05, sx: 0.98 },
        enter: [
            // Primero mira…
            { at: 0, set: { gx: 0.52, gy: 0.18, open: 1.06 } },
            // …después la masa se inclina hacia lo que mira.
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
            gx: 0.62,
            gy: -0.12,
            bx: 0.13,
            by: -0.04,
            lean: 0.07,
            sx: 1.03,
            asym: 0.55,
            tilt: 0.06,
            open: 1.04,
        },
        enter: [
            { at: 0, set: { gx: 0.62, gy: -0.12, open: 1.06 } },
            {
                at: 0.18,
                set: { bx: 0.13, by: -0.04, lean: 0.07, sx: 1.03 },
                spring: { w: 8, z: 0.55 },
            },
            { at: 0.3, set: { asym: 0.55, tilt: 0.06 } },
        ],
        behavior: {
            breath: 3.6,
            blink: [2.4, 5],
            saccade: { every: [2.5, 5], amount: 0.1, hold: [0.3, 0.7] },
            lookWeight: 0.9,
            bodyFollow: 0.08,
            periodic: {
                every: [2.6, 4.2],
                cues: [
                    { at: 0, set: { bx: 0.17 }, spring: quick },
                    { at: 0.32, set: { bx: 0.13 }, spring: soft },
                ],
            },
        },
    },

    thinking: {
        pose: {
            gx: -0.1,
            gy: -0.58,
            ripple: 1,
            wob: 1.4,
            open: 0.94,
            sx: 0.99,
        },
        enter: [
            { at: 0, set: { gx: -0.25, gy: -0.58, open: 0.94 } },
            { at: 0.25, set: { ripple: 1, wob: 1.4, sx: 0.99 } },
        ],
        behavior: {
            breath: 5,
            blink: [3.5, 7],
            saccade: null,
            lookWeight: 0.15,
            bodyFollow: 0.06,
            drift: { x: 0.32, y: 0.08, speed: 0.35 },
        },
    },

    working: {
        pose: {
            gx: 0,
            gy: 0.28,
            open: 0.72,
            eyeW: 1.06,
            sep: 0.86,
            pulse: 1,
            wob: 0.35,
            breath: 0,
            sx: 1.02,
        },
        enter: [
            {
                at: 0,
                set: { gx: 0, gy: 0.28, open: 0.72, eyeW: 1.06, sep: 0.86 },
            },
            { at: 0.12, set: { sx: 1.02, wob: 0.35, breath: 0, pulse: 1 } },
        ],
        behavior: {
            breath: 4,
            blink: [4.5, 8],
            saccade: null,
            lookWeight: 0.1,
            bodyFollow: 0,
        },
    },

    doubt: {
        pose: {
            gx: 0.3,
            gy: -0.32,
            rot: 0.13,
            lean: -0.03,
            bx: 0.05,
            by: -0.07,
            squint: 0.55,
            asym: -0.25,
            tilt: 0.1,
            cool: 0.25,
        },
        enter: [
            // Mirada interrogativa antes de inclinarse.
            { at: 0, set: { gx: 0.3, gy: -0.32 } },
            {
                at: 0.22,
                set: { rot: 0.13, lean: -0.03, bx: 0.05, by: -0.07 },
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
                    { at: 0, set: { rot: 0.17 }, spring: soft },
                    { at: 0.5, set: { rot: 0.13 }, spring: soft },
                ],
            },
        },
    },

    error: {
        pose: {
            lean: -0.05,
            x: -0.02,
            sx: 1.04,
            flat: 0.6,
            eyeH: 1.12,
            eyeW: 1.04,
            gx: 0.22,
            gy: 0.32,
            cool: 0.55,
        },
        enter: [
            // Un instante de sorpresa contenida…
            { at: 0, set: { open: 0.55, sx: 1.03 }, spring: snap },
            // …retrocede con suavidad…
            {
                at: 0.09,
                set: {
                    open: 1,
                    lean: -0.15,
                    x: -0.07,
                    sx: 1.08,
                    eyeH: 1.15,
                    cool: 0.55,
                },
                spring: { w: 13, z: 0.58 },
            },
            // …y se queda atento a lo que hay que resolver.
            {
                at: 0.55,
                set: {
                    lean: -0.05,
                    x: -0.02,
                    sx: 1.04,
                    flat: 0.6,
                    eyeH: 1.12,
                    eyeW: 1.04,
                    gx: 0.22,
                    gy: 0.32,
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
            flat: 0.95,
            sx: 1.05,
            y: 0.01,
            open: 0.96,
            eyeH: 0.9,
            gy: 0.1,
            wob: 0.7,
        },
        enter: [
            {
                at: 0,
                set: { flat: 0.95, sx: 1.05, y: 0.01 },
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
                    // Mira con calma hacia un lado y vuelve, sin insistir.
                    {
                        at: 0,
                        set: { gx: -0.28, gy: 0.02 },
                        spring: { w: 9, z: 0.9 },
                    },
                    {
                        at: 1.6,
                        set: { gx: 0, gy: 0.06 },
                        spring: { w: 7, z: 0.9 },
                    },
                ],
            },
        },
    },
};

export const REACTIONS: Record<KaiReaction, ReactionDef> = {
    welcome: {
        duration: 1.75,
        cues: [
            // Anticipación: se comprime y entrecierra los ojos.
            {
                at: 0,
                set: {
                    sx: 1.13,
                    y: 0.03,
                    flat: 0.9,
                    open: 0.6,
                    gx: 0,
                    gy: 0.05,
                },
                spring: { w: 15, z: 0.8 },
            },
            // Asciende en un pequeño saludo.
            {
                at: 0.17,
                set: {
                    y: -0.3,
                    sx: 0.88,
                    flat: 0,
                    open: 1.08,
                    eyeH: 1.06,
                    by: -0.05,
                },
                spring: { y: { w: 11, z: 0.6 }, sx: { w: 15, z: 0.5 } },
                drops: [
                    { angle: -0.95, distance: 0.32, size: 0.1, hold: 0.55 },
                ],
            },
            {
                at: 0.36,
                set: { smile: 1, rot: 0.1, lean: 0.06 },
                spring: { w: 9, z: 0.5 },
            },
            {
                at: 0.62,
                set: { rot: -0.07, lean: -0.04 },
                spring: { w: 9, z: 0.55 },
            },
            // Se asienta.
            {
                at: 0.84,
                set: { y: 0, sx: 1.04, rot: 0, lean: 0, by: 0, eyeH: 1 },
                spring: { y: { w: 10, z: 0.78 }, sx: { w: 12, z: 0.5 } },
            },
            {
                at: 1.12,
                set: { sx: 1, flat: 0, smile: 0, open: 1 },
                spring: { w: 8, z: 0.5 },
            },
        ],
        reduced: [
            { at: 0, set: { smile: 1 } },
            { at: 1.1, set: { smile: 0 } },
        ],
        reducedDuration: 1.4,
    },

    success: {
        duration: 1.95,
        cues: [
            // Anticipación: se agacha y aprieta los ojos.
            {
                at: 0,
                set: { sx: 1.12, y: 0.04, flat: 1, open: 0.35 },
                spring: { w: 16, z: 0.75 },
            },
            // Salto elástico con ojos curvados.
            {
                at: 0.16,
                set: {
                    y: -0.38,
                    sx: 0.86,
                    flat: 0,
                    smile: 1,
                    open: 1,
                    by: -0.06,
                },
                spring: { y: { w: 13, z: 0.62 }, sx: { w: 18, z: 0.45 } },
                drops: [
                    { angle: -2.25, distance: 0.3, size: 0.085, hold: 0.5 },
                    { angle: -0.8, distance: 0.34, size: 0.07, hold: 0.6 },
                ],
            },
            // Cae…
            {
                at: 0.43,
                set: { y: 0, sx: 1, by: 0 },
                spring: { y: { w: 15, z: 0.5 }, sx: { w: 10, z: 0.6 } },
            },
            // …aterriza con un rebote gelatinoso.
            {
                at: 0.56,
                set: { sx: 1.08, wob: 2.6 },
                spring: { sx: { w: 22, z: 0.4 }, wob: { w: 10, z: 1 } },
            },
            { at: 0.66, set: { sx: 1 }, spring: { w: 11, z: 0.3 } },
            { at: 1.05, set: { wob: 1 } },
            { at: 1.3, set: { smile: 0 }, spring: { w: 9, z: 0.7 } },
        ],
        reduced: [
            { at: 0, set: { smile: 1 } },
            { at: 1.2, set: { smile: 0 } },
        ],
        reducedDuration: 1.5,
    },

    surprised: {
        duration: 0.95,
        cues: [
            { at: 0, set: { sx: 1.05, open: 0.6 }, spring: { w: 30, z: 0.7 } },
            // Estiramiento vertical breve con ojos muy abiertos.
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
                },
                spring: { w: 22, z: 0.48 },
            },
            // Recuperación rápida.
            {
                at: 0.38,
                set: { sx: 1, y: 0, eyeH: 1, eyeW: 1, sep: 1, gy: 0 },
                spring: {
                    sx: { w: 16, z: 0.72 },
                    y: { w: 14, z: 0.8 },
                    eyeH: { w: 12, z: 0.7 },
                },
            },
        ],
        reduced: [
            { at: 0, set: { eyeH: 1.3, eyeW: 1.12 } },
            { at: 0.6, set: { eyeH: 1, eyeW: 1 } },
        ],
        reducedDuration: 0.8,
    },
};

/** Muelles con nombre para reutilizar desde el laboratorio. */
export const CUE_SPRINGS = { snap, quick, soft, bouncy };
