/**
 * Motor de KAI: estados, transiciones, comportamientos y composición de cada
 * fotograma. No toca el DOM; el componente lee `frame` y lo dibuja.
 *
 * Todo el tiempo es tiempo del motor: los gestos programados avanzan solo
 * mientras el motor recibe `update()`, así pausar o perder visibilidad nunca
 * deja temporizadores compitiendo.
 */

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
    EYE,
    POINTS,
    R,
    areaRatio,
    bridgePath,
    computeLocalContour,
    eyeStroke,
    localRadiusAt,
    rayHit,
    smoothClosedPath,
} from './shape';
import type { BodyShape, Vec } from './shape';
import { REACTIONS, STATES } from './states';
import type { Cue, DropSpawn, StateBehavior } from './states';
import type {
    KaiEngineEvents,
    KaiGaze,
    KaiReactOptions,
    KaiReaction,
    KaiReactionResult,
    KaiState,
} from './types';

export const MAX_DROPS = 3;

export type EyeFrame = { d: string; width: number; transform: string };

export type DropFrame = {
    visible: boolean;
    cx: number;
    cy: number;
    r: number;
    bridge: string;
};

export type Ellipse = {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    opacity: number;
};

export type KaiFrame = {
    body: string;
    core: string;
    lobe: string;
    highlight: Ellipse & { angle: number };
    shadow: Ellipse;
    eyes: [EyeFrame, EyeFrame];
    drops: DropFrame[];
    /** Mezcla con azul grisáceo (0-1). */
    cool: number;
    /** Brillo interior adicional (pulso de trabajo). */
    glow: number;
    /** Área dibujada / área en reposo. */
    area: number;
};

type Owner = 'state' | 'reaction' | 'periodic';

type ScheduledCue = Cue & { time: number; owner: Owner };

type Drop = {
    active: boolean;
    angle: number;
    size: number;
    dist: number;
    distV: number;
    distTarget: number;
    releaseAt: number;
    released: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    placed: boolean;
};

type ActiveReaction = {
    name: KaiReaction;
    endAt: number;
    next?: KaiState;
    resolve: (result: KaiReactionResult) => void;
};

type Listener<K extends keyof KaiEngineEvents> = (
    payload: KaiEngineEvents[K],
) => void;

const DROP_OUT: SpringConfig = { w: 9, z: 0.5 };
const DROP_BACK: SpringConfig = { w: 6.5, z: 0.85 };
const DROP_FOLLOW: SpringConfig = { w: 14, z: 0.72 };

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

    private time = 0;
    private acc = 0;
    private lastStep = 1 / 60;
    private stateName: KaiState;
    private reaction: ActiveReaction | null = null;
    private cues: ScheduledCue[] = [];
    private entryUntil = 0;

    private blinkStart = -1;
    private nextBlink = 0;
    private saccade: KaiGaze = { x: 0, y: 0 };
    private saccadeUntil = 0;
    private nextSaccade = 0;
    private nextPeriodic = Infinity;
    private breathPhase = 0;
    private pulsePhase = 0;

    private look: KaiGaze | null = null;
    private intensity = 1;
    private intensityNow = 1;
    private sizeFactor = 1;
    private timeScale = 1;
    private reduced: boolean;
    private random: () => number;

    private drops: Drop[];
    private transform = new BodyTransform();
    private local = new Float64Array(POINTS * 2);
    private world = new Float64Array(POINTS * 2);
    private tmp: Vec = { x: 0, y: 0 };
    private tmp2: Vec = { x: 0, y: 0 };
    private listeners: {
        [K in keyof KaiEngineEvents]: Set<Listener<K>>;
    } = {
        stateChange: new Set(),
        reactionStart: new Set(),
        reactionEnd: new Set(),
    };

    constructor({
        state = 'idle',
        reduced = false,
        seed = Math.floor(Math.random() * 2 ** 31),
    }: KaiEngineOptions = {}) {
        this.stateName = state;
        this.reduced = reduced;
        this.random = mulberry32(seed);
        this.breathPhase = this.random();
        this.drops = Array.from({ length: MAX_DROPS }, () => ({
            active: false,
            angle: 0,
            size: 0,
            dist: 0,
            distV: 0,
            distTarget: 0,
            releaseAt: 0,
            released: false,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            placed: false,
        }));
        this.frame = {
            body: '',
            core: '',
            lobe: '',
            highlight: { cx: 0, cy: 0, rx: 0, ry: 0, opacity: 0, angle: 0 },
            shadow: { cx: 0, cy: 0, rx: 0, ry: 0, opacity: 0 },
            eyes: [
                { d: '', width: 0, transform: '' },
                { d: '', width: 0, transform: '' },
            ],
            drops: this.drops.map(() => ({
                visible: false,
                cx: 0,
                cy: 0,
                r: 0,
                bridge: '',
            })),
            cool: 0,
            glow: 0,
            area: 1,
        };

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
            this.target[ch] = NEUTRAL[ch];
            this.spring[ch] = CHANNEL_SPRING[ch];
        }

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

    setIntensity(value: number): void {
        this.intensity = clamp(value, 0, 2);
    }

    /** Reduce la amplitud en tamaños pequeños, donde el gesto se lee mejor contenido. */
    setSizeFactor(value: number): void {
        this.sizeFactor = clamp(value, 0.2, 1);
    }

    setTimeScale(value: number): void {
        this.timeScale = clamp(value, 0.1, 3);
    }

    setReduced(value: boolean): void {
        if (value === this.reduced) {
            return;
        }

        this.reduced = value;
        this.blinkStart = -1;
        this.saccade = { x: 0, y: 0 };

        for (const drop of this.drops) {
            drop.active = false;
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
        if (!this.reduced || this.reaction || this.cues.length) {
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

        this.runBehavior(step);
        this.computeEffectiveTargets();
        this.integrate(step);
        this.updateDrops(step);
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
            if (!delayed.has(ch)) {
                this.target[ch] = def.pose[ch] ?? NEUTRAL[ch];
                this.spring[ch] = CHANNEL_SPRING[ch];
            }
        }

        this.schedule(enter, 'state');

        const last = enter.reduce((max, cue) => Math.max(max, cue.at), 0);
        this.entryUntil = this.time + last + 0.6;

        // Al terminar la entrada, la pose final queda garantizada.
        if (enter.length) {
            this.schedule([{ at: last + 0.6, set: { ...def.pose } }], 'state');
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

        // Un parpadeo al cambiar el foco hace el cambio más natural.
        if (animated && !this.reduced && this.random() < 0.45) {
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

        if (cue.drops && !this.reduced) {
            for (const spawn of cue.drops) {
                this.spawnDrop(spawn);
            }
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

    /* ── Comportamientos vivos ──────────────────────────────────────── */

    private between(min: number, max: number): number {
        return min + (max - min) * this.random();
    }

    private runBehavior(dt: number): void {
        const behavior = this.behavior;
        const free = !this.reaction && !this.reduced;

        this.breathPhase = (this.breathPhase + dt / behavior.breath) % 1;
        this.pulsePhase = (this.pulsePhase + dt / TIMING.workPeriod) % 1;

        if (free && behavior.blink && this.time >= this.nextBlink) {
            if (this.value.smile < 0.3) {
                this.blinkStart = this.time;
            }

            const double = this.random() < TIMING.doubleBlink;
            this.nextBlink = double
                ? this.time + 0.3
                : this.time + this.between(...behavior.blink);
        }

        if (free && behavior.saccade) {
            if (this.time >= this.nextSaccade) {
                const angle = this.random() * Math.PI * 2;
                const amount = behavior.saccade.amount * this.between(0.5, 1);
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

            return 1 - (1 - (1 - u) * (1 - u));
        }

        this.blinkStart = -1;

        return 0;
    }

    /** Objetivos efectivos: estado + mirada externa + seguimiento del cuerpo. */
    private computeEffectiveTargets(): void {
        const behavior = this.behavior;
        const e = this.effective;
        Object.assign(e, this.target);

        if (!this.reaction) {
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

            // El cuerpo sigue a los ojos (a su posición actual, no al objetivo),
            // así la masa llega siempre después de la mirada.
            const follow = behavior.bodyFollow;
            e.lean += this.value.gx * follow;
            e.rot += this.value.gx * follow * 0.35;
            e.bx += this.value.gx * follow * 0.45;
            e.by += this.value.gy * follow * 0.3;
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

            this.intensityNow +=
                (this.intensity - this.intensityNow) * Math.min(1, STEP * 6);
            this.acc -= STEP;
        }
    }

    private snap(): void {
        this.computeEffectiveTargets();
        Object.assign(this.value, this.effective);
    }

    /* ── Gotas ──────────────────────────────────────────────────────── */

    private spawnDrop(spawn: DropSpawn): void {
        const drop = this.drops.find((d) => !d.active);

        if (!drop) {
            return;
        }

        Object.assign(drop, {
            active: true,
            angle: spawn.angle,
            size: spawn.size,
            dist: -spawn.size * 1.4,
            distV: 0,
            distTarget: spawn.distance,
            releaseAt: this.time + 0.3 + spawn.hold,
            released: false,
            placed: false,
        });
    }

    private updateDrops(dt: number): void {
        for (const drop of this.drops) {
            if (!drop.active) {
                continue;
            }

            if (!drop.released && this.time >= drop.releaseAt) {
                drop.released = true;
                drop.distTarget = -drop.size * 2.2;
            }

            const spring = drop.released ? DROP_BACK : DROP_OUT;
            let t = dt;

            while (t > 0) {
                const h = Math.min(STEP, t);
                [drop.dist, drop.distV] = springStep(
                    drop.dist,
                    drop.distV,
                    drop.distTarget,
                    spring,
                    h,
                );
                t -= h;
            }

            if (drop.released && drop.dist < -drop.size * 1.6) {
                drop.active = false;
            }
        }
    }

    /* ── Composición del fotograma ──────────────────────────────────── */

    private out(ch: Channel): number {
        const v = this.value[ch];

        if (!AMPLITUDE_CHANNELS.includes(ch)) {
            return v;
        }

        let k = this.intensityNow * this.sizeFactor;

        if (this.reduced) {
            k *= REDUCED_SCALE[ch] ?? 1;
        }

        return NEUTRAL[ch] + (v - NEUTRAL[ch]) * k;
    }

    private compose(): void {
        const f = this.frame;
        const t = this.transform;
        const amp = this.reduced ? 0 : this.intensityNow * this.sizeFactor;

        const breath =
            0.011 *
            this.value.breath *
            amp *
            Math.sin(this.breathPhase * Math.PI * 2);
        const pulse = workPulse(this.pulsePhase) * this.value.pulse * amp;

        let y = this.out('y');
        let squash = 0;

        // La base nunca atraviesa el suelo: lo que se hundiría se comprime.
        if (y > 0) {
            squash = y * 1.2;
            y = 0;
        }

        // El pulso comprime en vertical (casi sin perder área) y se contrae un poco.
        const sx = (this.out('sx') + breath + pulse * 0.03) * (1 + squash);

        const shape: BodyShape = {
            x: this.out('x'),
            y,
            sx,
            lean: this.out('lean'),
            rot: this.out('rot'),
            bx: this.out('bx'),
            by: this.out('by'),
            flat: clamp(this.out('flat'), 0, 1.4),
            scale: this.out('scale') - pulse * 0.018,
            wob: Math.max(0, this.reduced ? 0 : this.out('wob')),
            ripple: this.out('ripple'),
            t: this.time,
        };

        computeLocalContour(shape, this.local);
        t.set(shape);

        for (let i = 0; i < POINTS; i++) {
            t.apply(this.local[i * 2], this.local[i * 2 + 1], this.tmp);
            this.world[i * 2] = this.tmp.x;
            this.world[i * 2 + 1] = this.tmp.y;
        }

        f.body = smoothClosedPath(this.world, POINTS);
        f.area = areaRatio(this.world);

        // Masa interior: núcleo desplazado hacia abajo y lóbulo claro.
        const core = t.apply(0, 0.08, this.tmp);
        f.core = matrix(0.84, 0, 0, 0.84, core.x * 0.16, core.y * 0.16);
        const lobe = t.apply(-0.42, 0.4, this.tmp);
        f.lobe = matrix(0.4, 0, 0, 0.4, lobe.x * 0.6, lobe.y * 0.6);

        const hi = t.apply(-0.34, -0.5, this.tmp);
        Object.assign(f.highlight, {
            cx: n2(hi.x),
            cy: n2(hi.y),
            rx: n2(R * 0.34 * sx),
            ry: n2((R * 0.2) / sx),
            angle: n2(-30 + shape.rot * 57.3),
            opacity: 1,
        });

        const height = Math.min(1, Math.max(0, -y) * 1.8);
        Object.assign(f.shadow, {
            cx: n2(shape.x * R),
            cy: R + 2.5,
            rx: n2(R * 0.74 * sx * (1 - 0.4 * height)),
            ry: n2(R * 0.085 * (1 - 0.3 * height)),
            opacity: n2(1 - 0.6 * height),
        });

        f.cool = n2(clamp(this.value.cool, 0, 1));
        f.glow = n2(pulse * 0.4);

        this.composeEyes();
        this.composeDrops();
    }

    private composeEyes(): void {
        const v = this.value;
        const blink = this.blinkAmount();
        const [a, b, c, d] = this.transform.eyeMatrix(0.5);

        for (const side of [-1, 1] as const) {
            const index = side < 0 ? 0 : 1;
            const asym = 1 + side * v.asym * 0.14;
            // El ojo hacia el que mira se ve un poco mayor: da volumen.
            const depth = 1 + side * v.gx * 0.06;
            const size = asym * depth;

            let ex = side * (EYE.spacing / 2) * v.sep + v.gx * 0.3;
            let ey = EYE.y + v.gy * 0.26 - side * v.asym * 0.025;

            // Los ojos nunca salen del cuerpo.
            const angle = Math.atan2(ey, ex);
            const limit = localRadiusAt(this.local, angle) - 0.24 * v.eyeH;
            const dist = Math.hypot(ex, ey);

            if (dist > limit && dist > 0) {
                ex *= limit / dist;
                ey *= limit / dist;
            }

            const center = this.transform.apply(ex, ey, this.tmp2);
            const squint =
                side < 0 ? Math.max(0, v.squint) : Math.max(0, -v.squint);
            const open = clamp(
                v.open * (1 - 0.92 * blink) * (1 - squint * 0.45),
                0.07,
                1.6,
            );
            const tilt = v.tilt * (side < 0 ? 1 : 0.6);
            const cos = Math.cos(tilt);
            const sin = Math.sin(tilt);
            // Cuerpo · giro · apertura vertical.
            const ra = a * cos + c * sin;
            const rb = b * cos + d * sin;
            const rc = (-a * sin + c * cos) * open;
            const rd = (-b * sin + d * cos) * open;
            const stroke = eyeStroke(v.smile, v.eyeH * size, v.eyeW * size);
            const eye = this.frame.eyes[index];
            eye.d = stroke.d;
            eye.width = n2(stroke.width);
            eye.transform = matrix(ra, rb, rc, rd, center.x, center.y);
        }
    }

    private composeDrops(): void {
        const center = this.transform.apply(0, 0, { x: 0, y: 0 });

        this.drops.forEach((drop, i) => {
            const out = this.frame.drops[i];

            if (!drop.active) {
                out.visible = false;

                return;
            }

            const lr = localRadiusAt(this.local, drop.angle);
            const surface = this.transform.apply(
                Math.cos(drop.angle) * lr,
                Math.sin(drop.angle) * lr,
                this.tmp,
            );
            const dx = surface.x - center.x;
            const dy = surface.y - center.y;
            const r1 = Math.hypot(dx, dy);
            const tx = surface.x + (dx / r1) * drop.dist * R;
            const ty = surface.y + (dy / r1) * drop.dist * R;

            if (!drop.placed) {
                drop.x = tx;
                drop.y = ty;
                drop.placed = true;
            } else {
                // La gota sigue al cuerpo con algo de retraso (inercia).
                const h = this.lastStep;
                [drop.x, drop.vx] = springStep(
                    drop.x,
                    drop.vx,
                    tx,
                    DROP_FOLLOW,
                    h,
                );
                [drop.y, drop.vy] = springStep(
                    drop.y,
                    drop.vy,
                    ty,
                    DROP_FOLLOW,
                    h,
                );
            }

            const sink = clamp(
                (drop.dist + drop.size * 1.6) / (drop.size * 1.6),
                0,
                1,
            );
            const r2 = drop.size * R * (0.55 + 0.45 * sink);

            // Dentro del cuerpo no se dibuja: solo asoma al acercarse al borde.
            out.visible = drop.dist > -drop.size * 0.9;
            out.cx = n2(drop.x);
            out.cy = n2(drop.y);
            out.r = n2(r2);
            out.bridge = bridgePath(
                center,
                r1 * 0.97,
                { x: drop.x, y: drop.y },
                r2,
                (angle) => rayHit(this.world, POINTS, center, angle),
            );
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
