/**
 * Tipos públicos de KAI, el compañero digital de Kiub.
 *
 * Los estados son persistentes: reflejan lo que ocurre en la interacción y se
 * mantienen hasta que la interfaz los cambia. Las reacciones son gestos
 * temporales: terminan solas y devuelven a KAI al estado vigente.
 */

export type { KaiColors } from './palette';

export type KaiState =
    | 'idle'
    | 'attentive'
    | 'curious'
    | 'thinking'
    | 'working'
    | 'loading'
    | 'doubt'
    | 'error'
    | 'waiting'
    | 'content'
    | 'music'
    | 'sleeping'
    | 'shy'
    | 'notice'
    | 'travel'
    | 'rush';

export type KaiReaction =
    | 'welcome'
    | 'success'
    | 'surprised'
    | 'dance'
    | 'love'
    | 'giggle'
    | 'idea'
    | 'dizzy'
    | 'explore'
    | 'yawn'
    | 'boing'
    | 'nod';

/** Dirección de la mirada; cada eje va de -1 a 1 (y positivo hacia abajo). */
export type KaiGaze = { x: number; y: number };

export type KaiReducedMotion = 'auto' | 'reduce' | 'no-preference';

export type KaiSurface = 'auto' | 'light' | 'dark';

export type KaiReactOptions = {
    /** Estado al que pasa al terminar el gesto. Por defecto, el estado vigente. */
    next?: KaiState;
};

export type KaiReactionResult = {
    name: KaiReaction;
    /** `true` si otro gesto o un cambio de estado lo cortó antes de terminar. */
    interrupted: boolean;
};

export type KaiTrackOptions = {
    /** Gesto al resolverse la promesa. `null` para no celebrar. */
    success?: KaiReaction | null;
    /** Estado después del éxito. */
    next?: KaiState;
    /** Estado si la promesa se rechaza. */
    failure?: KaiState;
};

/**
 * Coreografías de aparición: «Convergencia» (gotas que se funden) y
 * «Corriente» (un cuerpo de agua que entra, se pliega y despierta).
 */
export type KaiEmergeKind = 'converge' | 'stream';

/**
 * Fases de las apariciones. `gentle` es la variante de movimiento reducido
 * (aparece y abre los ojos, sin trayectorias).
 */
export type KaiEmergePhase =
    | 'pulse'
    | 'attraction'
    | 'fusion'
    | 'current'
    | 'fold'
    | 'awakening'
    | 'recognition'
    | 'gentle';

export type KaiEmergeResult = {
    /** `true` si se canceló o se reinició antes de terminar. */
    cancelled: boolean;
};

export type KaiEngineEvents = {
    stateChange: { from: KaiState; to: KaiState };
    reactionStart: { name: KaiReaction };
    reactionEnd: KaiReactionResult;
    emergeStart: { reduced: boolean; kind: KaiEmergeKind };
    emergePhase: { phase: KaiEmergePhase };
    emergeEnd: KaiEmergeResult;
};

/** API que expone `<KaiCharacter>` mediante su ref. */
export type KaiController = {
    setState: (state: KaiState) => void;
    react: (
        name: KaiReaction,
        options?: KaiReactOptions,
    ) => Promise<KaiReactionResult>;
    track: <T>(
        task: Promise<T> | (() => Promise<T>),
        options?: KaiTrackOptions,
    ) => Promise<T>;
    lookAt: (gaze: KaiGaze | null) => void;
    blink: () => void;
    /** Empujón elástico externo, en radios/s (se ignora en movimiento reducido). */
    nudge: (vx: number, vy: number) => void;
    /** Señala con una manita hacia una dirección (pantalla); `null` la recoge. */
    point: (dir: KaiGaze | null) => void;
    /**
     * Aparición: por defecto «Convergencia» (gotas que se funden y
     * despierta); `'stream'` es la corriente del inicio de sesión.
     * Llamarla de nuevo reinicia; se resuelve al terminar o al cancelarse.
     * Las peticiones de estado y gesto durante la aparición se guardan (la
     * última de cada tipo) y se aplican al terminar.
     */
    emerge: (kind?: KaiEmergeKind) => Promise<KaiEmergeResult>;
    /** Termina la aparición ya, desde la pose actual, y aplica lo pendiente. */
    cancelEmerge: () => void;
    pause: () => void;
    resume: () => void;
};

/** Tamaños del KAI flotante. */
export type KaiDockSize = 'mini' | 'normal' | 'grande';
