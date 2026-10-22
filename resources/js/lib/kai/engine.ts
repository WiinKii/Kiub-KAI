/**
 * Motor de KAI: estados, transiciones, comportamientos y composición de cada
 * fotograma. No toca el DOM; el componente lee `frame` y lo dibuja.
 *
 * Todo el tiempo es tiempo del motor: los gestos programados avanzan solo
 * mientras el motor recibe `update()`, así pausar o perder visibilidad nunca
 * deja temporizadores compitiendo.
 */

import {
    EMERGE,
    emergeFrame,
    emergeReducedFrame,
    emergeSprings,
    nominalTime,
} from './emerge';
import type { EmergeContext, EmergeDrop } from './emerge';
import {
    SPLIT,
    STREAM,
    splitFrame,
    splitReducedFrame,
    streamFrame,
    streamNominal,
} from './stream';
import { EYE, FACE_RADIUS, eyeStroke, mouthPath } from './face';
import { BINS, radiiFromContour, traceField } from './field';
import type { Ball } from './field';
import {
    AMPLITUDE_CHANNELS,
    CHANNELS,
    CHANNEL_SPRING,
    NEUTRAL,
    REDUCED_SCALE,
    SPRINGS,
    STEP,
    TIMING,
    springStep,
} from './motion';
import type { Channel, Pose, SpringConfig } from './motion';
import {
    BodyTransform,
    POINTS,
    R,
    areaRatio,
    computeLocalContour,
    localRadiusAt,
} from './shape';
import type { BodyShape, Vec } from './shape';
import {
    MAX_SPRITES,
    createSprites,
    emitSprite,
    spriteFade,
    spritePosition,
    updateSprites,
} from './sprites';
import type { EmitOptions, Sprite, SpriteKind } from './sprites';
import { REACTIONS, STATES } from './states';
import type { Cue, Rig, RigContext, StateBehavior } from './states';
import type {
    KaiEmergeKind,
    KaiEmergePhase,
    KaiEmergeResult,
    KaiEngineEvents,
    KaiGaze,
    KaiReactOptions,
    KaiReaction,
    KaiReactionResult,
    KaiState,
} from './types';

/** Satélites: 0-7 para los rigs; 8-10 para agarrar y señalar. */
export const MAX_SATS = 11;
const GRAB_SLOTS = [8, 9, 10] as const;
const POINT_SLOT = 8;

export type EyeFrame = {
    d: string;
    width: number;
    transform: string;
    opacity: number;
};
export type GlyphFrame = { transform: string; opacity: number };
export type Blob = {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    opacity: number;
};
/** `dot`: demasiado pequeño para el campo; se dibuja como gotita aparte. */
export type SatFrame = {
    visible: boolean;
    dot: boolean;
    cx: number;
    cy: number;
    r: number;
    /** Cuánto asoma fuera del cuerpo (0-1): brillo de esfera propia. */
    lens: number;
    /** Tinte propio ('' = el de KAI). */
    color: string;
};
export type SpriteFrame = {
    visible: boolean;
    kind: SpriteKind;
    transform: string;
    opacity: number;
    tint: number;
};

export type KaiFrame = {
    /** Silueta del fluido (cuerpo + lóbulos + gotas). */
    shape: string;
    cx: number;
    cy: number;
    /** Manchas de color que fluyen dentro del cuerpo. */
    blobs: Blob[];
    sats: SatFrame[];
    highlight: Blob & { angle: number };
    specular: Blob & { angle: number };
    shadow: Blob;
    eyes: [EyeFrame, EyeFrame];
    spirals: [GlyphFrame, GlyphFrame];
    hearts: [GlyphFrame, GlyphFrame];
    blush: [Blob, Blob];
    /** Boca minimalista: un solo trazo blanco, como los ojos. */
    mouth: {
        d: string;
        transform: string;
        opacity: number;
        width: number;
    };
    /** Punto arriba a la derecha del cuerpo para el globito de avisos. */
    badge: Vec;
    /** Visibilidad global (la aparición empieza en 0). */
    presence: number;
    /** Radio del degradado base: acompaña al volumen visible. */
    baseR: number;
    sprites: SpriteFrame[];
    face: number;
    cool: number;
    glow: number;
    /** Área del cuerpo / área en reposo. */
    area: number;
};

type Owner = 'state' | 'reaction' | 'periodic';

type ScheduledCue = Cue & { time: number; owner: Owner };

type Sat = {
    active: boolean;
    wanted: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    vr: number;
    tx: number;
    ty: number;
    tr: number;
    spring: SpringConfig;
    /** Caída propia en el campo (más alta = cuello más marcado). */
    falloff?: number;
    /** Colocado por la aparición en este fotograma (sin muelle). */
    pinned: boolean;
    /** Alargamiento con área constante a lo largo de `angle`. */
    stretch: number;
    /** Alargamiento que pide el rig (las gotas de la aparición lo fijan). */
    tStretch: number;
    angle: number;
    /** Brillo de esfera propia (0 = integrado, sin borde interno). */
    glass: number;
    /** Tinte propio (gotas de la división). */
    color?: string;
};

type PendingReaction = {
    name: KaiReaction;
    options: KaiReactOptions;
    resolve: (result: KaiReactionResult) => void;
};

/** Aparición en curso. */
type Emergence = {
    kind: KaiEmergeKind;
    start: number;
    reduced: boolean;
    phase: KaiEmergePhase | null;
    /** Ondas, empujones y parpadeos ya lanzados (una vez cada uno). */
    fired: Set<string>;
    resolve: (result: KaiEmergeResult) => void;
    /** Última petición de estado y de gesto: se aplican al terminar. */
    pendingState: KaiState | null;
    pendingReaction: PendingReaction | null;
};

/** Onda que recorre el contorno desde un impacto. */
type Wave = { angle: number; born: number; amp: number };

type ActiveReaction = {
    name: KaiReaction;
    endAt: number;
    next?: KaiState;
    resolve: (result: KaiReactionResult) => void;
};

type Listener<K extends keyof KaiEngineEvents> = (
    payload: KaiEngineEvents[K],
) => void;

const ABSORB: SpringConfig = { w: 7, z: 0.85 };
const SAT_DEFAULT: SpringConfig = { w: 8, z: 0.6 };
/** Gelatina: rebote poco amortiguado tras un empujón externo. */
const JELLY: SpringConfig = { w: 9, z: 0.26 };
const TAU = Math.PI * 2;

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;

    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

function n2(v: number): number {
    return Math.round(v * 100) / 100;
}

function n4(v: number): number {
    return Math.round(v * 10000) / 10000;
}

function matrix(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
): string {
    return `matrix(${n4(a)} ${n4(b)} ${n4(c)} ${n4(d)} ${n2(e)} ${n2(f)})`;
}

/** Pulso de trabajo: ataque corto y liberación suave. */
function workPulse(phase: number): number {
    const attack = 0.16;

    return phase < attack
        ? Math.sin((phase / attack) * (Math.PI / 2))
        : Math.exp(-(phase - attack) * 6);
}

export type KaiEngineOptions = {
    state?: KaiState;
    reduced?: boolean;
    seed?: number;
};

export class KaiEngine {
    readonly frame: KaiFrame;

    private value: Pose = { ...NEUTRAL };
    private velocity: Pose = Object.fromEntries(
        CHANNELS.map((ch) => [ch, 0]),
    ) as Pose;
    private target: Pose = { ...NEUTRAL };
    private spring: Record<Channel, SpringConfig> = { ...CHANNEL_SPRING };
    private effective: Pose = { ...NEUTRAL };
    private overrides: Partial<Pose> = {};

    private time = 0;
    private acc = 0;
    private lastStep = 1 / 60;
    private stateName: KaiState;
    private stateStart = 0;
    private reaction: ActiveReaction | null = null;
    private reactionStart = 0;
    private cues: ScheduledCue[] = [];
    private entryUntil = 0;
    private rigTimers = new Map<number, number>();
    private rigOnce = new Set<number>();

    private blinkStart = -1;
    private nextBlink = 0;
    private saccade: KaiGaze = { x: 0, y: 0 };
    private saccadeUntil = 0;
    private nextSaccade = 0;
    private nextPeriodic = Infinity;
    private breathPhase = 0;
    private pulsePhase = 0;
    private floatPhase = 0;
    private flowPhase = 0;
    private spiralSpin = 0;

    private look: KaiGaze | null = null;
    /** Desplazamiento elástico por empujones externos (en radios). */
    private jelly = { x: 0, y: 0, vx: 0, vy: 0 };
    /** Carga de mareo (0-1) mientras el cursor gira, y su ángulo. */
    private spinCharge = 0;
    private spinAngle = 0;
    /** Punto agarrado (en radios desde el centro) o null. */
    private grabPoint: KaiGaze | null = null;
    /** Dirección a la que señala con una manita, o null. */
    private pointDir: KaiGaze | null = null;
    /** Aparición en curso, o null. */
    private emergence: Emergence | null = null;
    /** Tras la división no queda nadie: oculto hasta otra aparición. */
    private vanished = false;
    /** Dirección de viaje (radianes, pantalla) y la que lleva ahora. */
    private heading = -0.72;
    private headingNow = -0.72;
    /** Volumen del cuerpo (radio relativo): la aparición lo va llenando. */
    private mass = 1;
    /** Corrección de volumen de la aparición (1 = ninguna). */
    private massCorr = 1;
    /** Área trazada del último fotograma, como fracción del reposo. */
    private lastArea = 1;
    private presence = 1;
    private waves: Wave[] = [];
    private intensity = 1;
    private intensityNow = 1;
    private sizeFactor = 1;
    private timeScale = 1;
    private reduced: boolean;
    private ambient = true;
    private cell = 3;
    private decimals: 1 | 2 = 2;
    private random: () => number;

    private sats: Sat[];
    private sprites: Sprite[] = createSprites();
    private transform = new BodyTransform();
    private local = new Float64Array(POINTS * 2);
    private world = new Float64Array(POINTS * 2);
    private radii = new Float64Array(BINS);
    private balls: Ball[] = [];
    private tmp: Vec = { x: 0, y: 0 };
    private center: Vec = { x: 0, y: 0 };
    private listeners: { [K in keyof KaiEngineEvents]: Set<Listener<K>> } = {
        stateChange: new Set(),
        reactionStart: new Set(),
        reactionEnd: new Set(),
        emergeStart: new Set(),
        emergePhase: new Set(),
        emergeEnd: new Set(),
    };
    private rigContext: RigContext;
    private emergeContext: EmergeContext;

    constructor({
        state = 'idle',
        reduced = false,
        seed = Math.floor(Math.random() * 2 ** 31),
    }: KaiEngineOptions = {}) {
        this.stateName = state;
        this.reduced = reduced;
        this.random = mulberry32(seed);
        this.breathPhase = this.random();
        this.floatPhase = this.random();
        this.flowPhase = this.random() * 10;
        this.sats = Array.from({ length: MAX_SATS }, () => ({
            active: false,
            wanted: false,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            r: 0,
            vr: 0,
            tx: 0,
            ty: 0,
            tr: 0,
            spring: SAT_DEFAULT,
            pinned: false,
            stretch: 1,
            tStretch: 1,
            angle: 0,
            glass: 1,
        }));

        const blob = (): Blob => ({ cx: 0, cy: 0, rx: 0, ry: 0, opacity: 0 });
        const eye = (): EyeFrame => ({
            d: '',
            width: 0,
            transform: '',
            opacity: 1,
        });
        const glyph = (): GlyphFrame => ({ transform: '', opacity: 0 });
        this.frame = {
            shape: '',
            cx: 0,
            cy: 0,
            blobs: [blob(), blob(), blob(), blob()],
            sats: this.sats.map(() => ({
                visible: false,
                dot: false,
                cx: 0,
                cy: 0,
                r: 0,
                lens: 0,
                color: '',
            })),
            highlight: { ...blob(), angle: 0 },
            specular: { ...blob(), angle: 0 },
            shadow: blob(),
            eyes: [eye(), eye()],
            spirals: [glyph(), glyph()],
            hearts: [glyph(), glyph()],
            blush: [blob(), blob()],
            mouth: {
                d: '',
                transform: '',
                opacity: 1,
                width: 1,
            },
            badge: { x: 0, y: 0 },
            presence: 1,
            baseR: R * 1.25,
            sprites: Array.from({ length: MAX_SPRITES }, () => ({
                visible: false,
                kind: 'dot' as SpriteKind,
                transform: '',
                opacity: 0,
                tint: 0,
            })),
            face: 1,
            cool: 0,
            glow: 0,
            area: 1,
        };

        this.rigContext = this.createRigContext();
        this.emergeContext = this.createEmergeContext();
        this.enterState(false);
        this.snap();
        this.compose();
    }

    /* ── API ─────────────────────────────────────────────────────────── */

    get state(): KaiState {
        return this.stateName;
    }

    get activeReaction(): KaiReaction | null {
        return this.reaction?.name ?? null;
    }

    /** Fase de la aparición en curso, o null si no hay ninguna. */
    get emergePhase(): KaiEmergePhase | null {
        return this.emergence?.phase ?? null;
    }

    on<K extends keyof KaiEngineEvents>(
        event: K,
        listener: Listener<K>,
    ): () => void {
        const set = this.listeners[event] as Set<Listener<K>>;
        set.add(listener);

        return () => set.delete(listener);
    }

    /**
     * Cambia el estado persistente. Por defecto corta con suavidad cualquier
     * gesto en curso: el estado refleja la interacción real y tiene prioridad.
     */
    setState(next: KaiState, { interrupt = true } = {}): void {
        // Durante la aparición no compite por el contorno: se guarda.
        if (this.emergence) {
            this.emergence.pendingState = next;

            return;
        }

        // Pedir el estado al que el gesto ya iba a volver no lo corta.
        const destination = this.reaction?.next ?? this.stateName;

        if (this.reaction && (!interrupt || next === destination)) {
            this.reaction.next = next;

            return;
        }

        if (next === this.stateName && !this.reaction) {
            return;
        }

        const from = this.stateName;
        this.stateName = next;

        if (this.reaction) {
            this.endReaction(true);
        }

        this.enterState(true);

        if (from !== next) {
            this.emit('stateChange', { from, to: next });
        }
    }

    /** Lanza un gesto temporal. Se resuelve al terminar o al ser cortado. */
    react(
        name: KaiReaction,
        options: KaiReactOptions = {},
    ): Promise<KaiReactionResult> {
        // Durante la aparición se guarda la última petición y se ejecuta al
        // terminar; la que queda sustituida se resuelve como cortada.
        if (this.emergence) {
            const run = this.emergence;
            const replaced = run.pendingReaction;

            if (replaced) {
                replaced.resolve({ name: replaced.name, interrupted: true });
            }

            return new Promise((resolve) => {
                run.pendingReaction = { name, options, resolve };
            });
        }

        if (this.reaction) {
            this.endReaction(true);
        }

        const def = REACTIONS[name];
        const cues = this.reduced ? def.reduced : def.cues;
        const duration = this.reduced ? def.reducedDuration : def.duration;

        this.cues = [];
        this.blinkStart = -1;
        this.saccade = { x: 0, y: 0 };

        // Parte de la pose actual (velocidades incluidas) hacia una base neutra.
        for (const ch of CHANNELS) {
            if (ch !== 'pull') {
                this.target[ch] = NEUTRAL[ch];
                this.spring[ch] = CHANNEL_SPRING[ch];
            }
        }

        this.reactionStart = this.time;
        this.resetRig();
        this.schedule(cues, 'reaction');

        return new Promise((resolve) => {
            this.reaction = {
                name,
                endAt: this.time + duration,
                next: options.next,
                resolve,
            };
            this.emit('reactionStart', { name });
        });
    }

    /** Dirige la mirada hacia un punto (-1…1) o la libera con `null`. */
    lookAt(gaze: KaiGaze | null): void {
        if (!gaze) {
            this.look = null;

            return;
        }

        const m = Math.hypot(gaze.x, gaze.y);
        const k = m > 1 ? 1 / m : 1;
        this.look = { x: gaze.x * k, y: gaze.y * k };
    }

    blink(): void {
        if (!this.reduced) {
            this.blinkStart = this.time;
        }
    }

    /**
     * Carga de mareo mientras el cursor da vueltas (0-1) y ángulo del cursor:
     * el fluido chapotea hacia él y el cuerpo se tambalea. Se apaga sola.
     */
    setSpin(charge: number, angle: number): void {
        this.spinCharge =
            this.reduced || this.emergence ? 0 : clamp(charge, 0, 1);
        this.spinAngle = angle;
    }

    /**
     * Agarrar y estirar: `point` en radios desde el centro (null = soltar).
     * Le sale una mano que sigue al puntero unida por un hilo de fluido; al
     * soltar, la masa corre hacia allí y vuelve con rebote.
     */
    grab(point: KaiGaze | null): void {
        if (this.emergence) {
            this.grabPoint = null;

            return;
        }

        if (this.reduced || !point) {
            if (this.grabPoint && !this.reduced) {
                const { x, y } = this.grabPoint;
                this.nudge(x * 1.6, y * 1.6);
                this.blinkStart = this.time + 0.05;
            }

            this.grabPoint = null;

            return;
        }

        const d = Math.hypot(point.x, point.y);
        const k = d > 2.3 ? 2.3 / d : 1;
        this.grabPoint = { x: point.x * k, y: point.y * k };
    }

    /** Señala con una manita hacia una dirección (pantalla), o deja de hacerlo. */
    point(dir: KaiGaze | null): void {
        if (!dir) {
            this.pointDir = null;

            return;
        }

        const d = Math.hypot(dir.x, dir.y) || 1;
        this.pointDir = { x: dir.x / d, y: dir.y / d };
    }

    /**
     * Apariciones: «Convergencia: KAI cobra vida» (por defecto), «Una
     * corriente que cobra vida» (`'stream'`, inicio de sesión) y la
     * «División» en cuatro gotas de color (`'split'`, hacia el navbar).
     *
     * - Inicio: el escenario se vacía al instante (sin cuerpo ni ojos) y
     *   empieza la coreografía en el reloj del motor (pausa y velocidad
     *   incluidas). Corta cualquier gesto en curso.
     * - Durante: la aparición es dueña del contorno. `setState` y `react` no
     *   interrumpen: se guarda la última petición de cada tipo.
     * - Finalización: a los `EMERGE.duration` s la pose ya es la de reposo;
     *   el motor habitual continúa desde ella, sin salto. Luego se aplican el
     *   estado y el gesto pendientes.
     * - Reinicio: volver a llamarla cancela la anterior (sin aplicar lo
     *   pendiente) y empieza una sola secuencia limpia.
     * - Cancelación: `cancelEmerge()` entrega el control desde la pose actual;
     *   las gotas que queden se funden con muelle y se aplica lo pendiente.
     * - División: no empieza desde vacío sino desde la pose actual, y al
     *   terminar KAI queda oculto (las gotas ya son de otro) hasta que otra
     *   aparición o `cancelEmerge()` lo devuelven.
     */
    emerge(kind: KaiEmergeKind = 'converge'): Promise<KaiEmergeResult> {
        if (this.emergence) {
            this.endEmergence(true, false);
        }

        if (this.reaction) {
            this.endReaction(true);
        }

        this.cues = [];
        this.blinkStart = -1;
        this.saccade = { x: 0, y: 0 };
        this.grabPoint = null;
        this.pointDir = null;
        this.spinCharge = 0;
        this.jelly = { x: 0, y: 0, vx: 0, vy: 0 };
        this.waves = [];

        for (const s of this.sprites) {
            s.active = false;
        }

        const split = kind === 'split';
        this.vanished = false;

        for (const sat of this.sats) {
            Object.assign(sat, {
                // La división parte del cuerpo tal como está.
                active: split ? sat.active : false,
                wanted: false,
                pinned: false,
                stretch: 1,
                tStretch: 1,
                glass: 1,
                color: undefined,
            });
        }

        for (const ch of CHANNELS) {
            if (ch !== 'pull') {
                this.target[ch] = NEUTRAL[ch];
                this.spring[ch] = CHANNEL_SPRING[ch];
            }
        }

        if (!this.reduced && !split) {
            Object.assign(this.spring, emergeSprings());
        }

        if (!split) {
            this.mass = this.reduced ? 1 : 0;
            this.presence = 0;
        }

        this.massCorr = 1;

        return new Promise((resolve) => {
            this.emergence = {
                kind,
                start: this.time,
                reduced: this.reduced,
                phase: null,
                fired: new Set(),
                resolve,
                pendingState: null,
                pendingReaction: null,
            };
            this.emit('emergeStart', { reduced: this.reduced, kind });

            if (split) {
                // Sigue desde la pose actual, con su inercia.
                return;
            }

            // Pose inicial sin transición: el escenario empieza vacío.
            this.runRig();
            this.computeEffectiveTargets();
            Object.assign(this.value, this.effective);

            for (const ch of CHANNELS) {
                this.velocity[ch] = 0;
            }

            this.acc = 0;
            this.compose();
        });
    }

    /** Termina la aparición ya: el motor sigue desde la pose actual. */
    cancelEmerge(): void {
        this.vanished = false;

        if (this.emergence) {
            this.endEmergence(true, true);
        }
    }

    /**
     * Dirección del viaje en pantalla (radianes; 0 = derecha, -π/2 = arriba).
     * La estela sale en sentido contrario; el cambio se hace con suavidad.
     */
    setHeading(angle: number): void {
        this.heading = angle;
    }

    /**
     * Empujón externo (p. ej. el scroll de la página), en radios/s: la masa
     * se desplaza un poco, se deforma por inercia y vuelve con rebote.
     */
    nudge(vx: number, vy: number): void {
        if (this.reduced) {
            return;
        }

        const j = this.jelly;
        j.vx = clamp(j.vx + vx, -4, 4);
        j.vy = clamp(j.vy + vy, -4, 4);
    }

    /** Estiramiento externo (final del scroll), 0-1. Al soltar, rebota. */
    setPull(value: number): void {
        const v = clamp(value, 0, 1);

        if (v === 0 && this.target.pull > 0.02) {
            this.spring.pull = { w: 11, z: 0.22 };
        } else if (v > 0) {
            this.spring.pull = { w: 18, z: 0.9 };
        }

        this.target.pull = v;
    }

    setIntensity(value: number): void {
        this.intensity = clamp(value, 0, 2);
    }

    /** Reduce la amplitud en tamaños pequeños, donde el gesto se lee mejor contenido. */
    setSizeFactor(value: number): void {
        this.sizeFactor = clamp(value, 0.2, 1);
    }

    /** Resolución del contorno según el tamaño en pantalla (px). */
    setResolution(px: number): void {
        this.cell = clamp(5.6 / Math.max(0.1, px / 144), 2.4, 7.5);
        // Por debajo de 200 px, una décima de unidad ya es menos de 0,15 px.
        this.decimals = px < 200 ? 1 : 2;
    }

    /** Lóbulos y motas de ambiente (se apagan en tamaño mínimo). */
    setAmbient(value: boolean): void {
        this.ambient = value;
    }

    setTimeScale(value: number): void {
        this.timeScale = clamp(value, 0.1, 3);
    }

    setReduced(value: boolean): void {
        if (value === this.reduced) {
            return;
        }

        // Cambiar de modo a mitad de la aparición la completa desde aquí.
        if (this.emergence) {
            this.endEmergence(true, true);
        }

        this.reduced = value;
        this.blinkStart = -1;
        this.saccade = { x: 0, y: 0 };

        for (const s of this.sprites) {
            s.active = false;
        }

        if (this.reaction) {
            const { name, next } = this.reaction;
            void this.react(name, { next });
        } else {
            this.enterState(false);
        }
    }

    /** En movimiento reducido el motor se detiene cuando todo está quieto. */
    isSettled(): boolean {
        if (
            !this.reduced ||
            this.reaction ||
            this.emergence ||
            this.cues.length
        ) {
            return false;
        }

        if (
            this.sats.some((s) => s.active) ||
            this.sprites.some((s) => s.active)
        ) {
            return false;
        }

        for (const ch of CHANNELS) {
            if (
                Math.abs(this.velocity[ch]) > 1e-3 ||
                Math.abs(this.value[ch] - this.effective[ch]) > 1e-3
            ) {
                return false;
            }
        }

        return true;
    }

    destroy(): void {
        if (this.emergence) {
            this.endEmergence(true, false);
        }

        if (this.reaction) {
            this.endReaction(true);
        }

        this.cues = [];

        for (const set of Object.values(this.listeners)) {
            set.clear();
        }
    }

    /** Avanza la simulación. `dt` en segundos reales. */
    update(dt: number): void {
        const step = Math.min(dt, 0.05) * this.timeScale;

        if (step <= 0) {
            return;
        }

        this.time += step;
        this.lastStep = step;
        this.runCues();

        if (this.reaction && this.time >= this.reaction.endAt) {
            this.finishReaction();
        }

        if (this.emergence) {
            const run = this.emergence;

            if (this.time - run.start >= this.emergeLength(run)) {
                this.endEmergence(false, true);
            }
        }

        if (this.vanished) {
            this.presence = 0;
        } else if (!this.emergence) {
            // Tras una cancelación, volumen y visibilidad vuelven sin saltos.
            this.mass = 1 - (1 - this.mass) * Math.exp(-step * 5);
            this.presence = 1 - (1 - this.presence) * Math.exp(-step * 8);
        }

        // La dirección de viaje gira con suavidad (por el camino corto).
        const turn = Math.atan2(
            Math.sin(this.heading - this.headingNow),
            Math.cos(this.heading - this.headingNow),
        );
        this.headingNow += turn * Math.min(1, step * 5);

        if (this.waves.length) {
            this.waves = this.waves.filter((w) => this.time - w.born < 1.6);
        }

        this.spinCharge = Math.max(0, this.spinCharge - step * 0.4);
        this.runBehavior(step);
        this.runRig();
        this.computeEffectiveTargets();
        this.integrate(step);
        this.updateSats(step);
        updateSprites(this.sprites, step);
        this.compose();
    }

    /* ── Estados y gestos ───────────────────────────────────────────── */

    private get behavior(): StateBehavior {
        return STATES[this.stateName].behavior;
    }

    private enterState(animated: boolean): void {
        const def = STATES[this.stateName];
        const enter = animated ? (def.enter ?? []) : [];
        const delayed = new Set<Channel>();

        this.cues = this.cues.filter((cue) => cue.owner === 'reaction');

        for (const cue of enter) {
            if (cue.at > 0 && cue.set) {
                for (const ch of Object.keys(cue.set) as Channel[]) {
                    delayed.add(ch);
                }
            }
        }

        for (const ch of CHANNELS) {
            if (!delayed.has(ch) && ch !== 'pull') {
                this.target[ch] = def.pose[ch] ?? NEUTRAL[ch];
                this.spring[ch] = CHANNEL_SPRING[ch];
            }
        }

        this.schedule(enter, 'state');

        const last = enter.reduce((max, cue) => Math.max(max, cue.at), 0);
        this.entryUntil = this.time + last + 0.6;

        if (enter.length) {
            const pose = { ...def.pose };
            this.schedule([{ at: last + 0.6, set: pose }], 'state');
        }

        const { blink, saccade, periodic } = def.behavior;
        this.nextBlink = blink
            ? this.time + this.between(blink[0] * 0.4, blink[1] * 0.6)
            : Infinity;
        this.nextSaccade = saccade
            ? this.time + this.between(...saccade.every)
            : Infinity;
        this.nextPeriodic = periodic
            ? this.entryUntil + this.between(...periodic.every)
            : Infinity;
        this.saccade = { x: 0, y: 0 };
        this.stateStart = this.time;
        this.resetRig();

        // Un parpadeo al cambiar el foco hace el cambio más natural.
        if (
            animated &&
            !this.reduced &&
            def.behavior.blink &&
            this.random() < 0.45
        ) {
            this.blinkStart = this.time + 0.04;
        }
    }

    private finishReaction(): void {
        const active = this.reaction;

        if (!active) {
            return;
        }

        this.reaction = null;
        this.cues = this.cues.filter((cue) => cue.owner !== 'reaction');

        const next = active.next ?? this.stateName;
        const from = this.stateName;
        this.stateName = next;
        this.enterState(true);

        if (from !== next) {
            this.emit('stateChange', { from, to: next });
        }

        const result = { name: active.name, interrupted: false };
        this.emit('reactionEnd', result);
        active.resolve(result);
    }

    private endReaction(interrupted: boolean): void {
        const active = this.reaction;

        if (!active) {
            return;
        }

        this.reaction = null;
        this.cues = this.cues.filter((cue) => cue.owner !== 'reaction');

        const result = { name: active.name, interrupted };
        this.emit('reactionEnd', result);
        active.resolve(result);
    }

    private schedule(cues: Cue[], owner: Owner): void {
        for (const cue of cues) {
            this.cues.push({ ...cue, time: this.time + cue.at, owner });
        }

        this.cues.sort((a, b) => a.time - b.time);
    }

    private runCues(): void {
        while (this.cues.length && this.cues[0].time <= this.time) {
            const cue = this.cues.shift() as ScheduledCue;
            this.applyCue(cue);
        }
    }

    private applyCue(cue: Cue): void {
        if (cue.set) {
            for (const [key, value] of Object.entries(cue.set)) {
                const ch = key as Channel;
                this.target[ch] = value;
                this.spring[ch] = this.cueSpring(cue, ch);
            }
        }

        if (cue.blink && !this.reduced) {
            this.blinkStart = this.time;
        }
    }

    private cueSpring(cue: Cue, ch: Channel): SpringConfig {
        if (this.reduced) {
            return SPRINGS.reduced;
        }

        const spring = cue.spring;

        if (!spring) {
            return CHANNEL_SPRING[ch];
        }

        if ('w' in spring && 'z' in spring) {
            return spring as SpringConfig;
        }

        return (
            (spring as Partial<Record<Channel, SpringConfig>>)[ch] ??
            CHANNEL_SPRING[ch]
        );
    }

    /* ── Aparición ───────────────────────────────────────────────────── */

    /**
     * Relevo al motor habitual. `apply`: aplicar el estado y el gesto
     * pedidos durante la aparición (no al reiniciar ni al destruir).
     */
    private endEmergence(cancelled: boolean, apply: boolean): void {
        const run = this.emergence;

        if (!run) {
            return;
        }

        this.emergence = null;

        // Las gotas que queden se sueltan: el motor las funde con muelle.
        for (const sat of this.sats) {
            sat.pinned = false;
        }

        // Objetivos del estado vigente desde la pose real. Al terminar ya
        // coinciden con la pose final de la coreografía: no hay salto.
        this.enterState(false);

        // El reposo entra en la ventana tranquila de su ciclo: los lóbulos
        // brotan después, despacio, en lugar de salir todos a la vez.
        if (!cancelled && this.stateName === 'idle' && run.kind !== 'split') {
            this.stateStart -= EMERGE.idleOffset;
        }

        // Tras dividirse, las gotas ya pertenecen al navbar.
        if (!cancelled && run.kind === 'split') {
            this.vanished = true;
            this.presence = 0;

            for (const sat of this.sats) {
                sat.active = false;
            }
        }

        const { pendingState, pendingReaction } = run;
        const result = { cancelled };
        this.emit('emergeEnd', result);
        run.resolve(result);

        if (!apply) {
            pendingReaction?.resolve({
                name: pendingReaction.name,
                interrupted: true,
            });

            return;
        }

        if (pendingState && pendingState !== this.stateName) {
            this.setState(pendingState);
        }

        if (pendingReaction) {
            void this.react(pendingReaction.name, pendingReaction.options).then(
                pendingReaction.resolve,
            );
        }
    }

    private emergeLength(run: Emergence): number {
        if (run.kind === 'split') {
            return run.reduced ? SPLIT.reducedDuration : SPLIT.duration;
        }

        if (run.reduced) {
            return EMERGE.reducedDuration;
        }

        return run.kind === 'stream' ? STREAM.duration : EMERGE.duration;
    }

    private runEmergence(): void {
        const run = this.emergence as Emergence;
        const elapsed = this.time - run.start;
        const ctx = this.emergeContext;
        const center = this.visualCenter(this.tmp);
        ctx.amp = this.intensityNow * this.sizeFactor;
        ctx.body.x = center.x / R;
        ctx.body.y = center.y / R;

        let phase: KaiEmergePhase;

        if (run.kind === 'split') {
            phase = run.reduced
                ? splitReducedFrame(elapsed, ctx)
                : splitFrame(elapsed, ctx);
        } else if (run.reduced) {
            phase = emergeReducedFrame(elapsed, ctx);
        } else if (run.kind === 'stream') {
            phase = streamFrame(streamNominal(elapsed), ctx);
        } else {
            phase = emergeFrame(nominalTime(elapsed), ctx);
        }

        if (phase !== run.phase) {
            run.phase = phase;
            this.emit('emergePhase', { phase });
        }
    }

    /** `true` la primera vez que se pide `key` en esta aparición. */
    private fire(key: string): boolean {
        const run = this.emergence;

        if (!run || run.fired.has(key)) {
            return false;
        }

        run.fired.add(key);

        return true;
    }

    private createEmergeContext(): EmergeContext {
        return {
            amp: 1,
            body: { x: 0, y: 0 },
            set: (ch, value) => {
                this.overrides[ch] = value;
            },
            spring: (ch, config) => {
                this.spring[ch] = config;
            },
            mass: (value) => {
                this.mass = clamp(value * this.massCorr, 0, 1.3);
            },
            volume: (target, weight) => {
                // Realimentación suave: si se ve más (o menos) líquido del que
                // existe, el cuerpo cede (o recupera) radio poco a poco.
                if (weight > 0 && target > 0.05 && this.lastArea > 0.02) {
                    const ratio = target / this.lastArea;
                    this.massCorr = clamp(
                        this.massCorr * Math.pow(ratio, 0.25),
                        0.75,
                        1.3,
                    );
                }

                this.massCorr = 1 + (this.massCorr - 1) * clamp(weight, 0, 1);
            },
            presence: (value) => {
                this.presence = clamp(value, 0, 1);
            },
            drop: (slot, drop) => this.pinDrop(slot, drop),
            wave: (id, angle, amp) => {
                if (this.fire(`wave-${id}`) && amp > 0) {
                    this.waves.push({ angle, born: this.time, amp });
                }
            },
            nudge: (id, vx, vy) => {
                if (this.fire(`nudge-${id}`)) {
                    this.nudge(vx, vy);
                }
            },
            blink: (id) => {
                if (this.fire(`blink-${id}`) && !this.reduced) {
                    this.blinkStart = this.time;
                }
            },
        };
    }

    /**
     * Gota de la aparición: posición exacta (sin muelle) en este fotograma.
     * Guarda su velocidad para que, si se suelta, siga con inercia.
     */
    private pinDrop(slot: number, drop: EmergeDrop | null): void {
        const sat = this.sats[slot];

        if (!sat) {
            return;
        }

        if (!drop) {
            sat.active = false;

            return;
        }

        const x = drop.x * R;
        const y = drop.y * R;
        // La corrección de volumen afecta a todo el líquido, no solo al cuerpo.
        const r = drop.r * R * this.massCorr;
        const h = Math.max(this.lastStep, 1e-3);

        if (sat.active) {
            sat.vx = (x - sat.x) / h;
            sat.vy = (y - sat.y) / h;
            sat.vr = (r - sat.r) / h;
        } else {
            sat.vx = 0;
            sat.vy = 0;
            sat.vr = 0;
        }

        Object.assign(sat, {
            active: true,
            wanted: true,
            pinned: true,
            x,
            y,
            r,
            tx: x,
            ty: y,
            tr: r,
            spring: ABSORB,
            falloff: undefined,
            stretch: drop.stretch,
            tStretch: drop.stretch,
            angle: drop.angle,
            glass: drop.glass,
            color: drop.color,
        });
    }

    /* ── Rigs: lóbulos, manos, gotas y partículas ───────────────────── */

    private resetRig(): void {
        this.rigTimers.clear();
        this.rigOnce.clear();
        this.rigContext.mem = {};
    }

    private createRigContext(): RigContext {
        const polar = (
            slot: number,
            angle: number,
            dist: number,
            r: number,
            spring?: SpringConfig,
            falloff?: number,
        ): void => {
            const a = angle + this.value.rot;
            this.wantSat(
                slot,
                Math.cos(a) * dist,
                Math.sin(a) * dist,
                r,
                spring,
                falloff,
            );
        };

        const cartesian = (
            slot: number,
            x: number,
            y: number,
            r: number,
            spring?: SpringConfig,
            falloff?: number,
        ): void => {
            const c = Math.cos(this.value.rot);
            const s = Math.sin(this.value.rot);
            this.wantSat(
                slot,
                x * c - y * s,
                x * s + y * c,
                r,
                spring,
                falloff,
            );
        };

        const ctx: RigContext = {
            t: 0,
            ambient: true,
            gx: 0,
            gy: 0,
            heading: this.headingNow,
            sat: polar,
            satXY: cartesian,
            trail: (slot, x, y, r, stretch, angle, spring) => {
                this.wantSat(slot, x, y, r, spring, undefined, stretch, angle);
            },
            set: (ch, value) => {
                this.overrides[ch] = value;
            },
            emit: (kind, o) => this.emitRelative(kind, o),
            every: (id, interval) => {
                const now = ctx.t;
                const next = this.rigTimers.get(id) ?? interval * 0.3;

                if (now >= next) {
                    this.rigTimers.set(
                        id,
                        now + interval * (0.8 + 0.4 * this.random()),
                    );

                    return true;
                }

                return false;
            },
            once: (id, at) => {
                if (ctx.t >= at && !this.rigOnce.has(id)) {
                    this.rigOnce.add(id);

                    return true;
                }

                return false;
            },
            rand: () => this.random(),
            engaged: false,
            mem: {},
        };

        return ctx;
    }

    private wantSat(
        slot: number,
        x: number,
        y: number,
        r: number,
        spring?: SpringConfig,
        falloff?: number,
        stretch = 1,
        angle = 0,
    ): void {
        const sat = this.sats[slot];

        if (!sat) {
            return;
        }

        const c = this.visualCenter(this.tmp);
        const k = this.out('scale');
        const tx = c.x + x * R * k;
        const ty = c.y + y * R * k;

        if (!sat.active) {
            // Brota desde dentro del cuerpo, en la dirección donde aparecerá.
            const len = Math.hypot(x, y) || 1;
            sat.active = true;
            sat.x = c.x + (x / len) * 0.5 * R;
            sat.y = c.y + (y / len) * 0.5 * R;
            sat.vx = 0;
            sat.vy = 0;
            sat.r = 0.04 * R;
            sat.vr = 0;
        }

        sat.wanted = true;
        sat.tx = tx;
        sat.ty = ty;
        // Los satélites encogen con el cuerpo.
        sat.tr = Math.max(0, r) * R * k;
        sat.spring = spring ?? SAT_DEFAULT;
        sat.falloff = falloff;
        sat.tStretch = stretch;
        sat.color = undefined;

        if (stretch !== 1) {
            sat.angle = angle;
        }
    }

    private emitRelative(kind: SpriteKind, o: EmitOptions): void {
        if (this.reduced) {
            return;
        }

        const c = this.visualCenter(this.tmp);
        const orbit = o.orbit ?? 0;

        emitSprite(
            this.sprites,
            kind,
            {
                ...o,
                // Las que orbitan guardan su centro relativo al cuerpo.
                x: orbit ? o.x * R : c.x + o.x * R,
                y: orbit ? o.y * R : c.y + o.y * R,
                vx: (o.vx ?? 0) * R,
                vy: (o.vy ?? -0.3) * R,
                ay: (o.ay ?? 0) * R,
                size: (o.size ?? 0.1) * R,
                sway: (o.sway ?? 0) * R,
                orbit: orbit * R,
            },
            this.random,
        );
    }

    private runRig(): void {
        this.overrides = {};

        for (const sat of this.sats) {
            sat.wanted = false;
            sat.pinned = false;
        }

        // La aparición es dueña del contorno: ni estado ni gestos compiten.
        if (this.emergence) {
            this.runEmergence();

            return;
        }

        if (this.reduced) {
            return;
        }

        const rig: Rig | undefined = this.reaction
            ? REACTIONS[this.reaction.name].rig
            : STATES[this.stateName].rig;

        if (rig) {
            const ctx = this.rigContext;
            ctx.t =
                this.time -
                (this.reaction ? this.reactionStart : this.stateStart);
            ctx.ambient = this.ambient;
            ctx.engaged = this.look !== null || this.grabPoint !== null;
            ctx.gx = this.value.gx;
            ctx.gy = this.value.gy;
            ctx.heading = this.headingNow;
            rig(ctx);
        }

        // Las interacciones directas van después: mandan sobre el rig.
        if (this.grabPoint) {
            this.applyGrab(this.grabPoint);
        } else if (this.pointDir) {
            this.applyPoint(this.pointDir);
        }
    }

    private applyGrab(p: KaiGaze): void {
        const d = Math.hypot(p.x, p.y);
        const ux = d > 1e-3 ? p.x / d : 0;
        const uy = d > 1e-3 ? p.y / d : 0;
        // Cuanto más se estira, más fino el hilo (sobre todo en el medio).
        const thin = clamp((d - 0.9) / 1.2, 0, 1);
        const hand: SpringConfig = { w: 24, z: 0.72 };
        const [a, b, c] = GRAB_SLOTS;
        this.wantSat(a, p.x * 0.36, p.y * 0.36, 0.27 - 0.08 * thin, hand, 3);
        this.wantSat(b, p.x * 0.7, p.y * 0.7, 0.2 - 0.09 * thin, hand, 3);
        this.wantSat(c, p.x, p.y, 0.23 - 0.02 * thin, hand, 3);

        const o = this.overrides;
        const reach = Math.min(d, 1.4);
        // Todo el cuerpo cede un poco hacia el tirón.
        o.x = (o.x ?? this.target.x) + 0.12 * ux * reach;
        o.y = (o.y ?? this.target.y) + 0.08 * uy * reach;
        o.lean = (o.lean ?? this.target.lean) + 0.07 * ux * reach;
        o.bx = (o.bx ?? this.target.bx) + 0.2 * ux * reach;
        o.by = (o.by ?? this.target.by) + 0.16 * uy * reach;
        o.gx = ux * 0.85;
        o.gy = uy * 0.85;
        o.open = 1.18;
        o.eyeH = 1.08;
        o.mOpen = 0.35;
        o.mSmile = 0.3;
        o.blush = Math.max(o.blush ?? 0, 0.35);
        o.wob = 1.8;
    }

    private applyPoint(dir: KaiGaze): void {
        const t = this.time;
        // Señala con un pequeño vaivén, como diciendo «ahí».
        const tap = 1.24 + 0.06 * Math.sin(t * 7);
        this.wantSat(
            POINT_SLOT,
            dir.x * tap,
            dir.y * tap,
            0.17,
            { w: 14, z: 0.6 },
            4.5,
        );
        const o = this.overrides;
        o.gx = dir.x * 0.9;
        o.gy = dir.y * 0.9;
        o.lean = (o.lean ?? this.target.lean) + dir.x * 0.06;
        o.bx = (o.bx ?? this.target.bx) + dir.x * 0.08;
        o.by = (o.by ?? this.target.by) + dir.y * 0.06;
    }

    private updateSats(dt: number): void {
        const c = this.visualCenter({ x: 0, y: 0 });

        for (const sat of this.sats) {
            if (!sat.active || sat.pinned) {
                continue;
            }

            // Fuera de la aparición vuelve a ser una gota de vidrio, redonda
            // salvo que el rig la alargue (estelas).
            const relax = Math.min(1, dt * 8);
            const stretch = sat.wanted ? sat.tStretch : 1;
            sat.stretch += (stretch - sat.stretch) * relax;
            sat.glass += (1 - sat.glass) * relax;

            if (!sat.wanted) {
                // Sin uso: vuelve al cuerpo y se funde.
                const dx = sat.x - c.x;
                const dy = sat.y - c.y;
                const len = Math.hypot(dx, dy) || 1;
                sat.tx = c.x + (dx / len) * 0.35 * R;
                sat.ty = c.y + (dy / len) * 0.35 * R;
                sat.tr = 0;
                sat.spring = ABSORB;
            }

            let t = dt;

            while (t > 0) {
                const h = Math.min(STEP, t);
                [sat.x, sat.vx] = springStep(
                    sat.x,
                    sat.vx,
                    sat.tx,
                    sat.spring,
                    h,
                );
                [sat.y, sat.vy] = springStep(
                    sat.y,
                    sat.vy,
                    sat.ty,
                    sat.spring,
                    h,
                );
                [sat.r, sat.vr] = springStep(
                    sat.r,
                    sat.vr,
                    sat.tr,
                    sat.spring,
                    h,
                );
                t -= h;
            }

            if (!sat.wanted && sat.r < 0.012 * R) {
                sat.active = false;
            }
        }
    }

    /* ── Comportamientos vivos ──────────────────────────────────────── */

    private between(min: number, max: number): number {
        return min + (max - min) * this.random();
    }

    private runBehavior(dt: number): void {
        const behavior = this.behavior;
        const free = !this.reaction && !this.reduced && !this.emergence;

        this.breathPhase = (this.breathPhase + dt / behavior.breath) % 1;
        this.pulsePhase = (this.pulsePhase + dt / TIMING.workPeriod) % 1;
        this.floatPhase = (this.floatPhase + dt / TIMING.floatPeriod) % 1;
        this.flowPhase += dt * this.value.flow;
        this.spiralSpin += dt * 7 * this.value.spiral;

        if (free && behavior.blink && this.time >= this.nextBlink) {
            if (this.value.closeL < 0.3 && this.value.closeR < 0.3) {
                this.blinkStart = this.time;
            }

            const double = this.random() < TIMING.doubleBlink;
            this.nextBlink = double
                ? this.time + 0.3
                : this.time + this.between(...behavior.blink);
        }

        if (free && behavior.saccade) {
            if (this.time >= this.nextSaccade) {
                const angle = this.random() * TAU;
                const amount = behavior.saccade.amount * this.between(0.5, 1);

                // Un cambio de mirada grande suele ir con un parpadeo.
                if (
                    amount > behavior.saccade.amount * 0.8 &&
                    this.blinkStart < 0 &&
                    this.value.closeL < 0.3 &&
                    this.value.closeR < 0.3 &&
                    this.random() < 0.4
                ) {
                    this.blinkStart = this.time;
                }

                this.saccade = {
                    x: Math.cos(angle) * amount,
                    y: Math.sin(angle) * amount * 0.6,
                };
                this.saccadeUntil =
                    this.time + this.between(...behavior.saccade.hold);
                this.nextSaccade =
                    this.saccadeUntil + this.between(...behavior.saccade.every);
            } else if (this.time >= this.saccadeUntil) {
                this.saccade = { x: 0, y: 0 };
            }
        }

        if (free && behavior.periodic && this.time >= this.nextPeriodic) {
            const { cues, every } = behavior.periodic;
            const last = cues.reduce((max, cue) => Math.max(max, cue.at), 0);
            this.schedule(cues, 'periodic');
            this.nextPeriodic = this.time + last + this.between(...every);
        }
    }

    private blinkAmount(): number {
        if (this.blinkStart < 0 || this.time < this.blinkStart) {
            return 0;
        }

        const t = this.time - this.blinkStart;
        const { blinkClose, blinkHold, blinkOpen } = TIMING;

        if (t < blinkClose) {
            const u = t / blinkClose;

            return u * u;
        }

        if (t < blinkClose + blinkHold) {
            return 1;
        }

        if (t < blinkClose + blinkHold + blinkOpen) {
            const u = (t - blinkClose - blinkHold) / blinkOpen;

            return (1 - u) * (1 - u);
        }

        this.blinkStart = -1;

        return 0;
    }

    /** Objetivos efectivos: estado + rig + mirada externa + seguimiento del cuerpo. */
    private computeEffectiveTargets(): void {
        const behavior = this.behavior;
        const e = this.effective;
        Object.assign(e, this.target);

        if (!this.reaction && !this.emergence) {
            let gx = this.target.gx + this.saccade.x;
            let gy = this.target.gy + this.saccade.y;

            if (behavior.drift && !this.reduced) {
                const { x, y, speed } = behavior.drift;
                gx += x * Math.sin(this.time * speed * Math.PI);
                gy += y * Math.sin(this.time * speed * 2.1 + 1);
            }

            if (this.look) {
                const w = behavior.lookWeight;
                gx += (this.look.x - gx) * w;
                gy += (this.look.y - gy) * w;
            }

            const m = Math.hypot(gx, gy);
            const k = m > 1 ? 1 / m : 1;
            e.gx = gx * k;
            e.gy = gy * k;

            // El cuerpo sigue a los ojos (a su posición actual), así la masa
            // llega siempre después de la mirada.
            const follow = behavior.bodyFollow;
            e.lean += this.value.gx * follow;
            e.rot += this.value.gx * follow * 0.35;
            e.bx += this.value.gx * follow * 0.45;
            e.by += this.value.gy * follow * 0.3;
        }

        Object.assign(e, this.overrides);

        // Antes de marearse: el fluido chapotea hacia el cursor que gira y el
        // cuerpo se tambalea cada vez más (así se nota que «algo pasa»).
        const spin =
            this.reaction || this.reduced || this.emergence
                ? 0
                : this.spinCharge;

        if (spin > 0.01) {
            const a = this.spinAngle;
            e.bx += 0.18 * spin * Math.cos(a);
            e.by += 0.12 * spin * Math.sin(a);
            e.rot += 0.2 * spin * Math.sin(a);
            e.lean += 0.08 * spin * Math.cos(a);
            e.wob += 1.6 * spin;
            e.eyeH -= 0.16 * spin;
            e.mWave = Math.max(e.mWave, spin * 0.6);
        }

        // Estirado (final del scroll): mira hacia arriba y abre la boca.
        const pull = Math.max(0, this.value.pull);

        if (pull > 0.01) {
            e.gy += (-0.8 - e.gy) * Math.min(1, pull * 1.6);
            e.mOpen = Math.max(e.mOpen, 0.45 * pull);
            e.mWide = Math.min(e.mWide, 1 - 0.4 * pull);
            e.eyeH += 0.15 * pull;
        }
    }

    private integrate(dt: number): void {
        this.acc += dt;
        const value = this.value;
        const velocity = this.velocity;

        while (this.acc >= STEP) {
            for (const ch of CHANNELS) {
                const spring = this.reduced ? SPRINGS.reduced : this.spring[ch];
                [value[ch], velocity[ch]] = springStep(
                    value[ch],
                    velocity[ch],
                    this.effective[ch],
                    spring,
                    STEP,
                );
            }

            const j = this.jelly;
            [j.x, j.vx] = springStep(j.x, j.vx, 0, JELLY, STEP);
            [j.y, j.vy] = springStep(j.y, j.vy, 0, JELLY, STEP);

            this.intensityNow +=
                (this.intensity - this.intensityNow) * Math.min(1, STEP * 6);
            this.acc -= STEP;
        }
    }

    private snap(): void {
        this.computeEffectiveTargets();
        Object.assign(this.value, this.effective);
    }

    /* ── Composición del fotograma ──────────────────────────────────── */

    private out(ch: Channel): number {
        // Extrapola el resto del paso fijo: sin tirones a 90/120/144 Hz.
        const v = this.value[ch] + this.velocity[ch] * this.acc;

        if (!AMPLITUDE_CHANNELS.has(ch) && !this.reduced) {
            return v;
        }

        let k = AMPLITUDE_CHANNELS.has(ch)
            ? this.intensityNow * this.sizeFactor
            : 1;

        if (this.reduced) {
            k *= REDUCED_SCALE[ch] ?? 1;
        }

        return NEUTRAL[ch] + (v - NEUTRAL[ch]) * k;
    }

    /** Centro dibujado del cuerpo (tras compresión y escala) del último fotograma. */
    private visualCenter(out: Vec): Vec {
        return this.transform.apply(0, 0, out);
    }

    /** Centro del cuerpo en el viewBox: posición + flotación + deriva. */
    private bodyCenter(out: Vec): Vec {
        const amp = this.reduced ? 0 : this.intensityNow * this.sizeFactor;
        const float = this.out('float') * amp;
        const drift = this.out('drift') * amp;
        out.x =
            this.out('x') * R +
            drift * 0.045 * R * Math.sin(this.time * 0.23 * TAU * 0.5);
        // Dos armónicos no múltiplos: la flotación no se siente mecánica.
        const phase = this.floatPhase * TAU;
        out.y =
            this.out('y') * R -
            float *
                R *
                (0.05 * Math.sin(phase) + 0.012 * Math.sin(phase * 2 + 1.1)) +
            drift * 0.02 * R * Math.sin(this.time * 0.37);
        out.x += this.jelly.x * R * amp;
        out.y += this.jelly.y * R * amp;

        return out;
    }

    private compose(): void {
        const f = this.frame;
        const t = this.transform;
        const v = this.value;
        const amp = this.reduced ? 0 : this.intensityNow * this.sizeFactor;

        const breath =
            0.012 * v.breath * amp * Math.sin(this.breathPhase * TAU);
        const pulse = workPulse(this.pulsePhase) * v.pulse * amp;
        const c = this.bodyCenter(this.center);

        // Inercia: la masa se queda atrás respecto al movimiento.
        const velX = this.reduced ? 0 : this.velocity.x + this.jelly.vx;
        const velY = this.reduced ? 0 : this.velocity.y + this.jelly.vy;
        const lagX = clamp(-velX * 0.05, -0.14, 0.14) * amp;
        const lagY = clamp(-velY * 0.05, -0.14, 0.14) * amp;

        // Al subir se estira un poco y al bajar se ensancha (acción secundaria).
        const rise = this.reduced
            ? 0
            : 0.012 * this.out('float') * amp * Math.cos(this.floatPhase * TAU);
        const sx = this.out('sx') + breath + pulse * 0.03 - rise;

        const shape: BodyShape = {
            x: c.x / R,
            y: c.y / R,
            sx,
            lean: this.out('lean'),
            rot: this.out('rot'),
            bx: this.out('bx') + lagX,
            by: this.out('by') + lagY,
            flat: clamp(this.out('flat'), 0, 1.4),
            scale: (this.out('scale') - pulse * 0.018) * this.mass,
            wob: Math.max(0, this.reduced ? 0 : this.out('wob')),
            ripple: this.out('ripple'),
            boil: Math.max(0, this.out('boil')),
            pull: clamp(this.out('pull'), -0.6, 1.2),
            t: this.time,
            waves: this.waves.length
                ? this.waves.map((w) => ({
                      // El contorno se calcula sin el giro del cuerpo.
                      angle: w.angle - this.out('rot'),
                      age: this.time - w.born,
                      amp: w.amp,
                  }))
                : undefined,
        };

        computeLocalContour(shape, this.local);
        t.set(shape);

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (let i = 0; i < POINTS; i++) {
            t.apply(this.local[i * 2], this.local[i * 2 + 1], this.tmp);
            this.world[i * 2] = this.tmp.x;
            this.world[i * 2 + 1] = this.tmp.y;
            minX = Math.min(minX, this.tmp.x);
            maxX = Math.max(maxX, this.tmp.x);
            minY = Math.min(minY, this.tmp.y);
            maxY = Math.max(maxY, this.tmp.y);
        }

        f.area = areaRatio(this.world);

        // Campo de metabolas: cuerpo + satélites.
        const origin = t.apply(0, 0, { x: 0, y: 0 });
        radiiFromContour(this.world, POINTS, origin.x, origin.y, this.radii);
        this.balls.length = 0;

        const tiny = Math.max(3.2, this.cell * 0.9);
        const tight = !this.reaction && STATES[this.stateName].tight === true;

        this.sats.forEach((sat, i) => {
            const out = f.sats[i];
            out.visible = sat.active && sat.r > 0.4;
            // Las gotas de la aparición siempre son campo: al vaciarse se
            // funden, nunca quedan como una gotita suelta junto al borde.
            out.dot = out.visible && sat.r < tiny && !sat.pinned;

            if (!out.visible) {
                return;
            }

            out.cx = n2(sat.x);
            out.cy = n2(sat.y);
            out.color = sat.color ?? '';

            if (out.dot) {
                // Más pequeño que la rejilla: gotita aparte, siempre redonda.
                out.r = n2(sat.r);

                return;
            }

            out.r = n2(sat.r * 1.25);

            // Un lóbulo que asoma se lee como otra esfera de vidrio.
            const dx = sat.x - origin.x;
            const dy = sat.y - origin.y;
            const bin =
                Math.floor(((Math.atan2(dy, dx) + Math.PI) / TAU) * BINS) %
                BINS;
            const edge = this.radii[bin];
            out.lens = n2(
                clamp((Math.hypot(dx, dy) + sat.r * 0.3 - edge) / sat.r, 0, 1) *
                    sat.glass,
            );

            const stretched = Math.abs(sat.stretch - 1) > 0.005;
            this.balls.push({
                x: sat.x,
                y: sat.y,
                r: sat.r,
                k: tight ? 6 : sat.falloff,
                stretch: stretched ? sat.stretch : undefined,
                c: Math.cos(sat.angle),
                s: Math.sin(sat.angle),
            });
            const span = sat.r * 1.6 * Math.max(1, sat.stretch);
            minX = Math.min(minX, sat.x - span);
            maxX = Math.max(maxX, sat.x + span);
            minY = Math.min(minY, sat.y - span);
            maxY = Math.max(maxY, sat.y + span);
        });

        // Gotas que se solapan suman campo: la silueta conjunta puede salirse
        // del contorno del cuerpo. Caja con el radio del volumen sumado.
        let volume = 0;

        for (let i = 0; i < BINS; i++) {
            volume = Math.max(volume, this.radii[i]);
        }

        volume = volume ** 3;

        for (const ball of this.balls) {
            volume += (ball.r * Math.max(1, ball.stretch ?? 1)) ** 3;
        }

        const reach = Math.cbrt(volume) * 1.08;
        minX = Math.min(minX, origin.x - reach);
        maxX = Math.max(maxX, origin.x + reach);
        minY = Math.min(minY, origin.y - reach);
        maxY = Math.max(maxY, origin.y + reach);

        const pad = this.cell * 2 + 2;
        const traced = traceField(
            { cx: origin.x, cy: origin.y, radii: this.radii },
            this.balls,
            [
                clamp(minX - pad, -260, 260),
                clamp(minY - pad, -260, 260),
                clamp(maxX + pad, -260, 260),
                clamp(maxY + pad, -260, 260),
            ],
            { cell: this.cell, anchor: origin, decimals: this.decimals },
        );
        f.shape = traced.path;
        // Área del círculo de reposo trazado (el polígono base es un 99,5 %).
        this.lastArea = traced.area / (Math.PI * R * R * 0.995);

        f.cx = n2(origin.x);
        f.cy = n2(origin.y);
        f.presence = n2(this.presence);
        // El degradado acompaña al volumen: una gota pequeña no es un recorte
        // del cuerpo grande.
        f.baseR = n2(R * 1.25 * clamp(this.mass, 0.3, 1));

        this.composeMaterial(origin, sx);
        // El globito va sobre el «hombro» derecho y viaja con la gelatina.
        t.apply(0.74, -0.74, f.badge);
        f.badge.x = n2(f.badge.x);
        f.badge.y = n2(f.badge.y);
        this.composeShadow(origin, maxY, sx);
        this.composeFace(lagX, lagY);
        this.composeSprites(origin);

        f.cool = n2(clamp(v.cool, 0, 1));
        f.glow = n2(pulse * 0.4);
    }

    /** Manchas de color que orbitan dentro del cuerpo: el degradado «fluye». */
    private composeMaterial(o: Vec, sx: number): void {
        const f = this.frame;
        const p = this.flowPhase;
        const s = this.out('scale') * this.mass;
        const yaw = this.value.gx * 0.14 * R;
        const blobs: [number, number, number, number, number][] = [
            // radio de órbita, velocidad, fase, rx, ry (en R)
            [0.42, 0.22, 0, 0.74, 0.6],
            [0.46, -0.17, 2.4, 0.42, 0.36],
            [0.36, 0.13, 4.2, 0.56, 0.48],
            [0.44, -0.27, 1.1, 0.5, 0.42],
        ];

        blobs.forEach(([orbit, speed, phase, rx, ry], i) => {
            const a = phase + p * speed * TAU * 0.35;
            const b = f.blobs[i];
            b.cx = n2(o.x - yaw + Math.cos(a) * orbit * R * sx * s);
            b.cy = n2(o.y + Math.sin(a * 1.13) * orbit * R * 0.85 * s);
            b.rx = n2(rx * R * sx * s);
            b.ry = n2((ry * R * s) / sx);
            b.opacity = 1;
        });

        const t = this.transform;
        const hi = t.apply(-0.36, -0.5, { x: 0, y: 0 });
        Object.assign(f.highlight, {
            cx: n2(hi.x - yaw * 0.5),
            cy: n2(hi.y),
            rx: n2(R * 0.3 * sx * s),
            ry: n2((R * 0.17 * s) / sx),
            angle: n2(-30 + this.out('rot') * 57.3),
            opacity: 1,
        });

        // Destello nítido: lo que hace que parezca una gota y no una nube.
        const sp = t.apply(-0.42, -0.58, { x: 0, y: 0 });
        Object.assign(f.specular, {
            cx: n2(sp.x - yaw * 0.6),
            cy: n2(sp.y),
            rx: n2(R * 0.17 * sx * s),
            ry: n2((R * 0.09 * s) / sx),
            angle: n2(-35 + this.out('rot') * 57.3),
            opacity: 1,
        });
    }

    private composeShadow(o: Vec, bottom: number, sx: number): void {
        const ground = R + 16;
        const gap = clamp((ground - bottom) / R, 0, 1.5);
        // La sombra acompaña al volumen visible y a la altura.
        const m = this.mass;
        Object.assign(this.frame.shadow, {
            cx: n2(o.x),
            cy: ground,
            rx: n2(R * 0.66 * sx * m * (1 - 0.3 * gap)),
            ry: n2(R * 0.075 * Math.sqrt(m) * (1 - 0.25 * gap)),
            opacity: n2(clamp(0.95 - 0.45 * gap, 0.2, 1) * Math.pow(m, 0.7)),
        });
    }

    private composeFace(lagX: number, lagY: number): void {
        const f = this.frame;
        const v = this.value;
        const blink = this.blinkAmount();
        const [a, b, c, d] = this.transform.faceMatrix(0.5);
        const face = clamp(v.face, 0, 1);
        const yaw = clamp(v.gx, -1.2, 1.2) * 0.72;
        const pitch = clamp(v.gy, -1.2, 1.2) * 0.5;
        const glyph = Math.max(clamp(v.spiral, 0, 1), clamp(v.heart, 0, 1));
        f.face = n2(face);

        for (const side of [-1, 1] as const) {
            const i = side < 0 ? 0 : 1;
            // Los ojos viven sobre una esfera: al girar se acercan y se estrechan.
            const angle = yaw + side * EYE.spread * v.sep;
            const fore = clamp(Math.cos(angle), 0.3, 1);
            const asym = 1 + side * v.asym * 0.14;
            const size = asym * (1 + side * v.gx * 0.05);

            let ex = FACE_RADIUS * Math.sin(angle) + lagX * 0.25;
            let ey =
                EYE.y +
                FACE_RADIUS * Math.sin(pitch) * 0.62 -
                side * v.asym * 0.025 +
                lagY * 0.25;

            const dir = Math.atan2(ey, ex);
            const limit = localRadiusAt(this.local, dir) - 0.22 * v.eyeH;
            const dist = Math.hypot(ex, ey);

            if (dist > limit && dist > 0) {
                ex *= limit / dist;
                ey *= limit / dist;
            }

            const center = this.transform.apply(ex, ey, { x: 0, y: 0 });
            const close = side < 0 ? v.closeL : v.closeR;
            const bend = side < 0 ? v.bendL : v.bendR;
            const squint =
                side < 0 ? Math.max(0, v.squint) : Math.max(0, -v.squint);
            const blinkK = close > 0.5 ? 0 : blink;
            const open =
                clamp(
                    v.open * (1 - 0.92 * blinkK) * (1 - squint * 0.45),
                    0.07,
                    1.6,
                ) * Math.max(0.001, 1 - glyph);
            const tilt = v.tilt * (side < 0 ? 1 : 0.6);
            const cos = Math.cos(tilt);
            const sin = Math.sin(tilt);
            const wx = fore * Math.max(0.001, 1 - glyph);
            // Cuerpo · giro · escorzo · apertura.
            const ra = (a * cos + c * sin) * wx;
            const rb = (b * cos + d * sin) * wx;
            const rc = (-a * sin + c * cos) * open;
            const rd = (-b * sin + d * cos) * open;
            const stroke = eyeStroke(close, bend, v.eyeH * size, v.eyeW * size);
            const eye = f.eyes[i];
            eye.d = stroke.d;
            eye.width = n2(stroke.width);
            eye.transform = matrix(ra, rb, rc, rd, center.x, center.y);
            eye.opacity = n2(face);

            const spin = this.spiralSpin * side;
            const gs = R * EYE.height * 0.55;
            const spiral = clamp(v.spiral, 0, 1);
            f.spirals[i].transform =
                `${matrix(a * fore, b * fore, c, d, center.x, center.y)} rotate(${n2((spin * 180) / Math.PI)}) scale(${n4(spiral * gs)})`;
            f.spirals[i].opacity = n2(spiral * face);

            const heart = clamp(v.heart, 0, 1.3);
            const beat = 1 + 0.08 * Math.sin(this.time * 9);
            f.hearts[i].transform =
                `${matrix(a * fore, b * fore, c, d, center.x, center.y)} scale(${n4(heart * beat * gs * 0.95)})`;
            f.hearts[i].opacity = n2(Math.min(1, heart) * face);

            // Rubor bajo cada ojo, algo hacia fuera.
            const cheek = this.transform.apply(
                ex + side * 0.07 * fore,
                ey + 0.2,
                { x: 0, y: 0 },
            );
            Object.assign(f.blush[i], {
                cx: n2(cheek.x),
                cy: n2(cheek.y),
                rx: n2(R * 0.16 * fore),
                ry: n2(R * 0.09),
                opacity: n2(clamp(v.blush, 0, 1) * face * 0.7),
            });
        }

        // Boca: centrada bajo los ojos sobre la misma esfera.
        const mx = FACE_RADIUS * Math.sin(yaw) * 0.95 + lagX * 0.25;
        const my =
            EYE.y + 0.25 + FACE_RADIUS * Math.sin(pitch) * 0.55 + lagY * 0.25;
        const mouthCenter = this.transform.apply(mx, my, { x: 0, y: 0 });
        const fore = clamp(Math.cos(yaw), 0.35, 1);
        const mouth = mouthPath({
            smile: v.mSmile,
            open: clamp(v.mOpen, 0, 1.1),
            wide: v.mWide,
            wave: v.mWave,
            cat: v.mCat,
        });
        f.mouth.d = mouth.d;
        f.mouth.transform = matrix(
            a * fore,
            b * fore,
            c,
            d,
            mouthCenter.x,
            mouthCenter.y,
        );
        f.mouth.opacity = n2(face);
        f.mouth.width = n2(mouth.stroke);
    }

    private composeSprites(o: Vec): void {
        this.sprites.forEach((s, i) => {
            const out = this.frame.sprites[i];
            out.visible = s.active;

            if (!s.active) {
                return;
            }

            const pos = spritePosition(s, o.x, o.y);
            const fade = spriteFade(s);
            out.kind = s.kind;
            out.tint = s.tint;
            out.opacity = n2(fade.opacity);
            out.transform = `translate(${n2(pos.x)} ${n2(pos.y)}) rotate(${n2((s.rot * 180) / Math.PI)}) scale(${n4(s.size * fade.scale)})`;
        });
    }

    private emit<K extends keyof KaiEngineEvents>(
        event: K,
        payload: KaiEngineEvents[K],
    ): void {
        for (const listener of this.listeners[event] as Set<Listener<K>>) {
            listener(payload);
        }
    }
}
