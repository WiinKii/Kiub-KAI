/**
 * Parámetros de movimiento de KAI.
 *
 * Toda la pose se describe con canales numéricos. Cada canal persigue su
 * objetivo con un muelle amortiguado, así que los cambios de estado y las
 * interrupciones nunca producen saltos: la velocidad actual se conserva y la
 * forma se reconduce hacia el nuevo objetivo.
 */

export const NEUTRAL = {
    /* Cuerpo (unidades relativas al radio en reposo) */
    x: 0,
    y: 0,
    /** Ancho relativo; el alto es 1/sx para conservar el área. */
    sx: 1,
    /** Cizalla: desplaza la parte alta respecto a la base. */
    lean: 0,
    /** Giro alrededor de la base, en radianes. */
    rot: 0,
    /** Protuberancia direccional (vector). */
    bx: 0,
    by: 0,
    /** Base aplanada, como cuando se asienta. */
    flat: 0,
    /** Escala global; solo para retrocesos pequeños. */
    scale: 1,

    /* Capas orgánicas (amplitudes) */
    wob: 1,
    breath: 1,
    ripple: 0,
    pulse: 0,
    /** Mezcla con el azul grisáceo para estados que piden atención. */
    cool: 0,

    /* Ojos */
    gx: 0,
    gy: 0,
    open: 1,
    eyeH: 1,
    eyeW: 1,
    /** 0 = cápsula, 1 = arco alegre. */
    smile: 0,
    sep: 1,
    /** Diferencia de tamaño: positivo agranda el ojo derecho. */
    asym: 0,
    /** Entrecierra un ojo: positivo el izquierdo, negativo el derecho. */
    squint: 0,
    /** Inclinación conjunta de los ojos, en radianes. */
    tilt: 0,
} as const;

export type Channel = keyof typeof NEUTRAL;

export type Pose = Record<Channel, number>;

export type PoseTargets = Partial<Pose>;

export const CHANNELS = Object.keys(NEUTRAL) as Channel[];

/** Frecuencia angular (rad/s) y razón de amortiguamiento. */
export type SpringConfig = { w: number; z: number };

export const SPRINGS = {
    /** Mirada: rápida y precisa, llega antes que el cuerpo. */
    gaze: { w: 21, z: 0.86 },
    /** Forma de los ojos. */
    eyes: { w: 22, z: 0.74 },
    /** Masa del cuerpo: más lenta, con algo de inercia. */
    body: { w: 9, z: 0.6 },
    /** Desplazamiento. */
    move: { w: 10, z: 0.62 },
    /** Asentamiento y escala. */
    settle: { w: 8, z: 0.8 },
    /** Capas orgánicas: entran y salen despacio. */
    layer: { w: 3.2, z: 1 },
    /** Movimiento reducido: transiciones cortas y sin rebote. */
    reduced: { w: 16, z: 1 },
} satisfies Record<string, SpringConfig>;

export const CHANNEL_SPRING: Record<Channel, SpringConfig> = {
    x: SPRINGS.move,
    y: SPRINGS.move,
    sx: SPRINGS.body,
    lean: SPRINGS.body,
    rot: SPRINGS.body,
    bx: SPRINGS.body,
    by: SPRINGS.body,
    flat: SPRINGS.settle,
    scale: SPRINGS.settle,
    wob: SPRINGS.layer,
    breath: SPRINGS.layer,
    ripple: SPRINGS.layer,
    pulse: SPRINGS.layer,
    cool: SPRINGS.layer,
    gx: SPRINGS.gaze,
    gy: SPRINGS.gaze,
    open: SPRINGS.eyes,
    eyeH: SPRINGS.eyes,
    eyeW: SPRINGS.eyes,
    smile: SPRINGS.eyes,
    sep: SPRINGS.eyes,
    asym: SPRINGS.eyes,
    squint: SPRINGS.eyes,
    tilt: SPRINGS.eyes,
};

/**
 * Canales cuya desviación se escala con la intensidad. Las formas de los ojos
 * quedan fuera para que la expresión se lea igual con intensidad baja.
 */
export const AMPLITUDE_CHANNELS: Channel[] = [
    'x',
    'y',
    'sx',
    'lean',
    'rot',
    'bx',
    'by',
    'flat',
    'scale',
    'wob',
    'ripple',
    'pulse',
];

/**
 * En movimiento reducido se conservan las diferencias de pose (inclinación,
 * ojos) pero se eliminan desplazamientos y capas oscilantes.
 */
export const REDUCED_SCALE: Partial<Record<Channel, number>> = {
    x: 0,
    y: 0,
    sx: 0.35,
    lean: 0.6,
    rot: 0.6,
    bx: 0.5,
    by: 0.5,
    scale: 0.4,
    wob: 0,
    breath: 0,
    ripple: 0,
    pulse: 0,
};

export const TIMING = {
    /** Duración del cierre y la apertura de un parpadeo (s). */
    blinkClose: 0.07,
    blinkHold: 0.035,
    blinkOpen: 0.13,
    /** Probabilidad de parpadeo doble. */
    doubleBlink: 0.16,
    /** Periodo del pulso de trabajo (s). */
    workPeriod: 1.05,
};

/** Paso fijo de integración (s). */
export const STEP = 1 / 240;

export function springStep(
    value: number,
    velocity: number,
    target: number,
    { w, z }: SpringConfig,
    dt: number,
): [number, number] {
    const accel = w * w * (target - value) - 2 * z * w * velocity;
    const v = velocity + accel * dt;

    return [value + v * dt, v];
}
