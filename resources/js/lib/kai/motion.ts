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
    /** Giro alrededor del centro, en radianes. */
    rot: 0,
    /** Protuberancia direccional (vector). */
    bx: 0,
    by: 0,
    /** Base aplanada. */
    flat: 0,
    /** Escala global; solo para gestos pequeños. */
    scale: 1,

    /* Capas orgánicas (amplitudes) */
    wob: 1,
    breath: 1,
    ripple: 0,
    /** Hervor: ondulación rápida e irregular del contorno. */
    boil: 0,
    pulse: 0,
    /** Flotación (amplitud del vaivén vertical). */
    float: 1,
    /** Deriva lenta de la posición en reposo. */
    drift: 1,
    /** Velocidad del color que fluye dentro del cuerpo. */
    flow: 1,
    /** Mezcla con el azul grisáceo para estados que piden atención. */
    cool: 0,
    /** Estiramiento hacia arriba (final del scroll). */
    pull: 0,

    /* Ojos */
    gx: 0,
    gy: 0,
    open: 1,
    eyeH: 1,
    eyeW: 1,
    sep: 1,
    /** Diferencia de tamaño: positivo agranda el ojo derecho. */
    asym: 0,
    /** Entrecierra un ojo: positivo el izquierdo, negativo el derecho. */
    squint: 0,
    tilt: 0,
    /** 0 cápsula vertical → 1 trazo horizontal, por ojo. */
    closeL: 0,
    closeR: 0,
    /** Curvatura del trazo: +1 «◠», 0 «—», -1 «◡». */
    bendL: 1,
    bendR: 1,
    spiral: 0,
    heart: 0,
    /** Visibilidad del rostro (0 = sin cara, como al cargar). */
    face: 1,
    blush: 0,

    /* Boca (solo se dibuja si está activada) */
    mSmile: 0.35,
    mOpen: 0,
    mWide: 1,
    mWave: 0,
    mCat: 0,
} as const;

export type Channel = keyof typeof NEUTRAL;

export type Pose = Record<Channel, number>;

export type PoseTargets = Partial<Pose>;

export const CHANNELS = Object.keys(NEUTRAL) as Channel[];

/** Frecuencia angular (rad/s) y razón de amortiguamiento. */
export type SpringConfig = { w: number; z: number };

export const SPRINGS = {
    /** Mirada: rápida, con un pequeño rebote al llegar. */
    gaze: { w: 16, z: 0.72 },
    /** Forma de los ojos y la boca. */
    eyes: { w: 18, z: 0.7 },
    /** Masa del cuerpo: blanda, con inercia. */
    body: { w: 7.5, z: 0.5 },
    /** Desplazamiento. */
    move: { w: 7, z: 0.55 },
    /** Asentamiento y escala. */
    settle: { w: 7, z: 0.7 },
    /** Capas orgánicas: entran y salen despacio. */
    layer: { w: 3, z: 1 },
    /** Expresiones lentas (rubor, visibilidad del rostro). */
    mood: { w: 5, z: 0.95 },
    /** Movimiento reducido: transiciones cortas y sin rebote. */
    reduced: { w: 16, z: 1 },
} satisfies Record<string, SpringConfig>;

const EYE_CHANNELS: Channel[] = [
    'open',
    'eyeH',
    'eyeW',
    'sep',
    'asym',
    'squint',
    'tilt',
    'closeL',
    'closeR',
    'bendL',
    'bendR',
    'spiral',
    'heart',
    'mSmile',
    'mOpen',
    'mWide',
    'mWave',
    'mCat',
];

export const CHANNEL_SPRING = Object.fromEntries(
    CHANNELS.map((ch): [Channel, SpringConfig] => {
        if (ch === 'gx' || ch === 'gy') {
            return [ch, SPRINGS.gaze];
        }

        if (EYE_CHANNELS.includes(ch)) {
            return [ch, SPRINGS.eyes];
        }

        if (ch === 'x' || ch === 'y') {
            return [ch, SPRINGS.move];
        }

        if (ch === 'flat' || ch === 'scale') {
            return [ch, SPRINGS.settle];
        }

        if (ch === 'face' || ch === 'blush') {
            return [ch, SPRINGS.mood];
        }

        if (['sx', 'lean', 'rot', 'bx', 'by'].includes(ch)) {
            return [ch, SPRINGS.body];
        }

        if (ch === 'pull') {
            return [ch, { w: 16, z: 0.9 }];
        }

        return [ch, SPRINGS.layer];
    }),
) as Record<Channel, SpringConfig>;

/**
 * Canales cuya desviación se escala con la intensidad. La forma de ojos y
 * boca queda fuera para que la expresión se lea igual con intensidad baja.
 */
export const AMPLITUDE_CHANNELS = new Set<Channel>([
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
    'boil',
    'pulse',
    'float',
    'drift',
]);

/**
 * En movimiento reducido se conservan las diferencias de pose (inclinación,
 * ojos, boca, rubor) pero se eliminan desplazamientos y capas oscilantes.
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
    boil: 0,
    pulse: 0,
    float: 0,
    drift: 0,
    flow: 0,
    pull: 0.4,
};

export const TIMING = {
    blinkClose: 0.07,
    blinkHold: 0.035,
    blinkOpen: 0.13,
    doubleBlink: 0.16,
    workPeriod: 1.05,
    /** Periodo del vaivén de flotación (s). */
    floatPeriod: 3.4,
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
