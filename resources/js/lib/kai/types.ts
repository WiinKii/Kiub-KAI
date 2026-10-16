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
    | 'shy';

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
    | 'boing';

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

export type KaiEngineEvents = {
    stateChange: { from: KaiState; to: KaiState };
    reactionStart: { name: KaiReaction };
    reactionEnd: KaiReactionResult;
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
    pause: () => void;
    resume: () => void;
};

/** Tamaños del KAI flotante. */
export type KaiDockSize = 'mini' | 'normal' | 'grande';
