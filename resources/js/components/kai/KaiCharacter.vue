<script setup lang="ts">
/**
 * KAI, la presencia viva de Kiub.
 *
 * Este componente solo dibuja: la forma, los estados y el movimiento viven en
 * `@/lib/kai`. Cada fotograma escribe directamente unos pocos atributos SVG,
 * sin pasar por el render de Vue.
 */
import {
    useDocumentVisibility,
    useEventListener,
    useIntersectionObserver,
    usePreferredReducedMotion,
} from '@vueuse/core';
import type { ComponentPublicInstance } from 'vue';
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { KaiEngine, MAX_SATS } from '@/lib/kai/engine';
import { heartPath, spiralPath } from '@/lib/kai/face';
import { KAI_DEFAULT_COLORS, paletteVars } from '@/lib/kai/palette';
import type { KaiColors } from '@/lib/kai/palette';
import { R, VIEWBOX } from '@/lib/kai/shape';
import { MAX_SPRITES, SPRITE_PATHS, STROKED } from '@/lib/kai/sprites';
import { activeTicks, subscribeTick } from '@/lib/kai/ticker';
import type {
    KaiGaze,
    KaiReactOptions,
    KaiReaction,
    KaiReactionResult,
    KaiReducedMotion,
    KaiState,
    KaiSurface,
    KaiTrackOptions,
} from '@/lib/kai/types';

type Props = {
    /** Lado de la caja en px, o un tamaño predefinido. */
    size?: number | 'sm' | 'md' | 'lg';
    /** Amplitud de los gestos (0-1.5). */
    intensity?: number;
    /** Velocidad global; pensado para ajustar en el laboratorio. */
    timeScale?: number;
    paused?: boolean;
    /** `auto` respeta `prefers-reduced-motion`. */
    reducedMotion?: KaiReducedMotion;
    /** Fondo sobre el que se dibuja; `auto` sigue el tema (`.dark`). */
    surface?: KaiSurface;
    /** Colores (se mezclan con los de Kiub). */
    colors?: Partial<KaiColors>;
    /** Boquita: apagada por defecto. */
    mouth?: boolean;
    /** Rubor bajo los ojos en las emociones que lo usan. */
    blush?: boolean;
    /** Lóbulos y motas de ambiente (apagar en tamaño mínimo). */
    ambient?: boolean;
    /** Mirar al puntero mientras está sobre el propio componente. */
    followPointer?: boolean;
    /** Juegos: se marea si das vueltas con el cursor y ríe si lo pulsas. */
    playful?: boolean;
    /** Estiramiento hacia arriba (0-1), p. ej. al final del scroll. */
    pull?: number;
    /** Anima los cambios de tamaño. */
    animateSize?: boolean;
    /** Nombre accesible. Vacío = decorativo (oculto a lectores de pantalla). */
    label?: string;
    /** Guía de contorno para el laboratorio. */
    debug?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    size: 'md',
    intensity: 1,
    timeScale: 1,
    paused: false,
    reducedMotion: 'auto',
    surface: 'auto',
    colors: () => ({}),
    mouth: false,
    blush: true,
    ambient: true,
    followPointer: false,
    playful: false,
    pull: 0,
    animateSize: false,
    label: '',
    debug: false,
});

const state = defineModel<KaiState>('state', { default: 'idle' });

const emit = defineEmits<{
    stateChange: [payload: { from: KaiState; to: KaiState }];
    reactionStart: [payload: { name: KaiReaction }];
    reactionEnd: [payload: KaiReactionResult];
}>();

const SIZES = { sm: 48, md: 120, lg: 240 } as const;

const px = computed(() =>
    typeof props.size === 'number' ? props.size : SIZES[props.size],
);

const palette = computed(() =>
    paletteVars({ ...KAI_DEFAULT_COLORS, ...props.colors }),
);

const uid = useId().replace(/[^\w-]/g, '');
const ids = {
    shape: `kai-${uid}-shape`,
    clip: `kai-${uid}-clip`,
    base: `kai-${uid}-base`,
    rim: `kai-${uid}-rim`,
    shadow: `kai-${uid}-shadow`,
    specular: `kai-${uid}-specular`,
    dots: [`kai-${uid}-dot-a`, `kai-${uid}-dot-b`, `kai-${uid}-dot-c`],
    soft: `kai-${uid}-soft`,
    halo: `kai-${uid}-halo`,
    blush: `kai-${uid}-blush`,
    mouth: `kai-${uid}-mouth`,
    mouthClip: `kai-${uid}-mouth-clip`,
};
const url = (id: string) => `url(#${id})`;
const shapeHref = `#${ids.shape}`;
const SPIRAL = spiralPath(1);
const HEART = heartPath(1);

const prefersReduced = usePreferredReducedMotion();
const reduced = computed(() =>
    props.reducedMotion === 'auto'
        ? prefersReduced.value === 'reduce'
        : props.reducedMotion === 'reduce',
);

const engine = new KaiEngine({ state: state.value, reduced: reduced.value });

/* ── Elementos que cambian en cada fotograma ─────────────────────────── */
const root = ref<HTMLElement | null>(null);
const shapeEl = ref<SVGPathElement | null>(null);
const baseEl = ref<SVGRadialGradientElement | null>(null);
const shadowEl = ref<SVGEllipseElement | null>(null);
const coolEl = ref<SVGUseElement | null>(null);
const glowEl = ref<SVGUseElement | null>(null);
const highlightEl = ref<SVGEllipseElement | null>(null);
const mouthEl = ref<SVGPathElement | null>(null);
const mouthLineEl = ref<SVGPathElement | null>(null);
const tongueEl = ref<SVGPathElement | null>(null);
const mouthGroupEl = ref<SVGGElement | null>(null);
const faceEl = ref<SVGGElement | null>(null);

type Slots = (Element | null)[];
const blobEls: Slots = [];
const satEls: Slots = [];
const dotEls: Slots = [];
const specularEl = ref<SVGEllipseElement | null>(null);
const blushEls: Slots = [];
const eyeEls: Slots = [];
const haloEls: Slots = [];
const spiralEls: Slots = [];
const heartEls: Slots = [];
const spriteEls: Slots = [];

// El orden importa: el elemento i dibuja el dato i del fotograma.
function slot(list: Slots, index: number) {
    return (el: Element | ComponentPublicInstance | null) => {
        list[index] = el instanceof Element ? el : null;
    };
}

const written = new WeakMap<Element, Record<string, string>>();

function attr(
    el: Element | null | undefined,
    name: string,
    value: number | string,
) {
    if (!el) {
        return;
    }

    const next = String(value);
    let cache = written.get(el);

    if (!cache) {
        cache = {};
        written.set(el, cache);
    }

    if (cache[name] !== next) {
        cache[name] = next;
        el.setAttribute(name, next);
    }
}

function ellipse(
    el: Element | null | undefined,
    e: { cx: number; cy: number; rx: number; ry: number },
) {
    attr(el, 'cx', e.cx);
    attr(el, 'cy', e.cy);
    attr(el, 'rx', e.rx);
    attr(el, 'ry', e.ry);
}

function render() {
    const f = engine.frame;

    attr(shapeEl.value, 'd', f.shape || 'M0 0');
    attr(baseEl.value, 'cx', f.cx);
    attr(baseEl.value, 'cy', f.cy - R * 0.15);
    attr(baseEl.value, 'fx', f.cx - R * 0.2);
    attr(baseEl.value, 'fy', f.cy - R * 0.35);
    attr(coolEl.value, 'opacity', f.cool * 0.5);
    attr(glowEl.value, 'opacity', f.glow);

    f.blobs.forEach((b, i) => ellipse(blobEls[i], b));
    f.sats.forEach((s, i) => {
        // Satélites del fluido: tinte dentro del cuerpo. Gotitas: esferas aparte.
        const tint = satEls[i];
        const dot = dotEls[i];
        attr(tint, 'visibility', s.visible && !s.dot ? 'visible' : 'hidden');
        attr(dot, 'visibility', s.visible && s.dot ? 'visible' : 'hidden');

        if (s.visible) {
            const el = s.dot ? dot : tint;
            attr(el, 'cx', s.cx);
            attr(el, 'cy', s.cy);
            attr(el, 'r', s.r);
        }
    });

    const h = f.highlight;
    ellipse(highlightEl.value, h);
    attr(highlightEl.value, 'transform', `rotate(${h.angle} ${h.cx} ${h.cy})`);
    const sp = f.specular;
    ellipse(specularEl.value, sp);
    attr(
        specularEl.value,
        'transform',
        `rotate(${sp.angle} ${sp.cx} ${sp.cy})`,
    );
    ellipse(shadowEl.value, f.shadow);
    attr(shadowEl.value, 'opacity', f.shadow.opacity);

    f.blush.forEach((b, i) => {
        ellipse(blushEls[i], b);
        attr(blushEls[i], 'opacity', props.blush ? b.opacity : 0);
    });

    attr(faceEl.value, 'opacity', f.face);

    f.eyes.forEach((eye, i) => {
        for (const el of [eyeEls[i], haloEls[i]]) {
            attr(el, 'd', eye.d);
            attr(el, 'transform', eye.transform);
        }

        attr(eyeEls[i], 'stroke-width', eye.width);
        attr(haloEls[i], 'stroke-width', Math.round(eye.width * 260) / 100);
        attr(spiralEls[i], 'transform', f.spirals[i].transform);
        attr(spiralEls[i], 'opacity', f.spirals[i].opacity);
        attr(heartEls[i], 'transform', f.hearts[i].transform);
        attr(heartEls[i], 'opacity', f.hearts[i].opacity);
    });

    if (props.mouth) {
        const m = f.mouth;
        attr(mouthEl.value, 'd', m.d);
        attr(mouthLineEl.value, 'd', m.d);
        attr(tongueEl.value, 'd', m.tongue);
        attr(mouthGroupEl.value, 'transform', m.transform);
        attr(mouthEl.value, 'opacity', m.fill);
        attr(tongueEl.value, 'opacity', m.fill);
        attr(mouthLineEl.value, 'opacity', m.line);
        attr(mouthLineEl.value, 'stroke-width', m.width);
    }

    f.sprites.forEach((s, i) => {
        const el = spriteEls[i];
        attr(el, 'visibility', s.visible ? 'visible' : 'hidden');

        if (s.visible) {
            attr(el, 'd', SPRITE_PATHS[s.kind]);
            attr(el, 'data-kind', STROKED[s.kind] ? 'stroke' : 'fill');
            attr(el, 'data-tint', s.tint);
            attr(el, 'transform', s.transform);
            attr(el, 'opacity', s.opacity);
        }
    });
}

/* ── Bucle: solo corre visible, con la pestaña activa y sin pausa ────── */
const mounted = ref(false);
const inView = ref(true);
const manualPause = ref(false);
const pageVisibility = useDocumentVisibility();

useIntersectionObserver(
    root,
    ([entry]) => {
        inView.value = entry?.isIntersecting ?? true;
    },
    { rootMargin: '80px' },
);

const running = computed(
    () =>
        mounted.value &&
        inView.value &&
        pageVisibility.value !== 'hidden' &&
        !props.paused &&
        !manualPause.value,
);

let unsubscribe: (() => void) | null = null;

let skipped = 0;
let odd = false;

function tick(dt: number) {
    // Con muchas instancias a la vez (galería), las pequeñas van a 30 fps.
    if (px.value < 140 && activeTicks() > 4) {
        skipped += dt;
        odd = !odd;

        if (odd) {
            return;
        }

        dt = skipped;
        skipped = 0;
    }

    engine.update(dt);
    render();

    // En movimiento reducido no hay capas vivas: se detiene al quedar quieto.
    if (engine.isSettled()) {
        stop();
    }
}

function start() {
    if (!unsubscribe) {
        unsubscribe = subscribeTick(tick);
    }
}

function stop() {
    unsubscribe?.();
    unsubscribe = null;
}

/** Reanuda el bucle si estaba detenido por reposo (no por pausa). */
function wake() {
    if (running.value) {
        start();
    }
}

watch(running, (value) => (value ? start() : stop()));

/* ── Sincronización con las props ────────────────────────────────────── */
watch(state, (value) => {
    if (value !== engine.state) {
        engine.setState(value);
        wake();
    }
});

watch(
    () => props.intensity,
    (value) => engine.setIntensity(value),
    { immediate: true },
);
watch(
    () => props.timeScale,
    (value) => engine.setTimeScale(value),
    { immediate: true },
);
watch(
    () => props.ambient,
    (value) => engine.setAmbient(value),
    { immediate: true },
);
watch(
    () => props.pull,
    (value) => {
        engine.setPull(value);
        wake();
    },
    { immediate: true },
);
watch(
    px,
    (value) => {
        engine.setSizeFactor(value < 64 ? 0.6 : value < 140 ? 0.85 : 1);
        engine.setResolution(value);
    },
    { immediate: true },
);
watch(reduced, (value) => {
    engine.setReduced(value);
    wake();
});
watch(
    () => props.mouth,
    () => {
        // Al encender la boca, el primer fotograma ya la dibuja.
        requestAnimationFrame(() => render());
    },
);

const offEvents = [
    engine.on('stateChange', (payload) => {
        if (state.value !== payload.to) {
            state.value = payload.to;
        }

        emit('stateChange', payload);
    }),
    engine.on('reactionStart', (payload) => emit('reactionStart', payload)),
    engine.on('reactionEnd', (payload) => emit('reactionEnd', payload)),
];

/* ── Mirada ──────────────────────────────────────────────────────────── */
let externalGaze: KaiGaze | null = null;
let pointerGaze = false;
let touchTimer: number | undefined;

function bodyCenter() {
    const rect = root.value?.getBoundingClientRect();

    if (!rect) {
        return null;
    }

    // El centro del cuerpo está en y = 0 del viewBox (-80…64).
    return {
        rect,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height * (80 / 144),
    };
}

function gazeFromPointer(event: PointerEvent): KaiGaze | null {
    const c = bodyCenter();

    if (!c) {
        return null;
    }

    return {
        x: (event.clientX - c.cx) / (c.rect.width * 0.5),
        y: (event.clientY - c.cy) / (c.rect.height * 0.5),
    };
}

function releaseGaze() {
    if (pointerGaze) {
        pointerGaze = false;
        engine.lookAt(externalGaze);
        wake();
    }
}

function onPointerMove(event: PointerEvent) {
    if (!props.followPointer || event.pointerType === 'touch') {
        return;
    }

    engine.lookAt(gazeFromPointer(event));
    pointerGaze = true;
    wake();
}

// En pantallas táctiles mira el punto tocado un momento y vuelve.
function onPointerDown(event: PointerEvent) {
    if (!props.followPointer || event.pointerType !== 'touch') {
        return;
    }

    engine.lookAt(gazeFromPointer(event));
    pointerGaze = true;
    wake();
    window.clearTimeout(touchTimer);
    touchTimer = window.setTimeout(releaseGaze, 1200);
}

watch(
    () => props.followPointer,
    (value) => {
        if (!value) {
            releaseGaze();
        }
    },
);

/* ── Juegos: mareo y cosquillas ──────────────────────────────────────── */
const TAU = Math.PI * 2;
let spin = 0;
let lastAngle: number | null = null;
let lastMove = 0;
let dizzyUntil = 0;

// Solo escucha al puntero con los juegos activos y mientras KAI se ve; el
// cálculo se limita a una zona alrededor de KAI.
useEventListener(
    () => (props.playful && running.value ? window : null),
    'pointermove',
    (event: PointerEvent) => {
        const c = bodyCenter();

        if (!c || event.pointerType === 'touch') {
            return;
        }

        const now = performance.now();
        // El giro acumulado se olvida despacio: hay que dar vueltas con ganas.
        spin *= Math.exp(-((now - lastMove) / 1000) * 0.22);
        lastMove = now;

        const dx = event.clientX - c.cx;
        const dy = event.clientY - c.cy;
        const dist = Math.hypot(dx, dy);
        const zone = Math.max(170, c.rect.width * 1.9);

        if (dist < c.rect.width * 0.22 || dist > zone) {
            lastAngle = null;

            if (!props.followPointer) {
                releaseGaze();
            }

            return;
        }

        const angle = Math.atan2(dy, dx);

        if (lastAngle !== null) {
            spin += Math.atan2(
                Math.sin(angle - lastAngle),
                Math.cos(angle - lastAngle),
            );
        }

        lastAngle = angle;

        if (!props.followPointer) {
            engine.lookAt({ x: (dx / zone) * 2.2, y: (dy / zone) * 2.2 });
            pointerGaze = true;
            wake();
        }

        // Unas vueltas seguidas (2,5 netas): se marea.
        if (Math.abs(spin) > TAU * 2.5 && now > dizzyUntil) {
            spin = 0;
            dizzyUntil = now + 5000;
            void react('dizzy');
        }
    },
    { passive: true },
);

function onClick() {
    if (props.playful && engine.activeReaction !== 'dizzy') {
        void react('giggle');
    }
}

/* ── API pública ─────────────────────────────────────────────────────── */
let destroyed = false;
let trackToken = 0;

function setState(next: KaiState) {
    engine.setState(next);
    state.value = next;
    wake();
}

function react(
    name: KaiReaction,
    options?: KaiReactOptions,
): Promise<KaiReactionResult> {
    const result = engine.react(name, options);
    wake();

    return result;
}

/**
 * Acompaña una operación real: «trabajando» mientras dura y, al terminar,
 * éxito o error. Si llega otra operación, solo cuenta el último resultado.
 */
async function track<T>(
    task: Promise<T> | (() => Promise<T>),
    {
        success = 'success',
        next = 'idle',
        failure = 'error',
    }: KaiTrackOptions = {},
): Promise<T> {
    const token = ++trackToken;
    setState('working');

    try {
        const result = await (typeof task === 'function' ? task() : task);

        if (!destroyed && token === trackToken) {
            if (success) {
                void react(success, { next });
            } else {
                setState(next);
            }
        }

        return result;
    } catch (error) {
        if (!destroyed && token === trackToken) {
            setState(failure);
        }

        throw error;
    }
}

function lookAt(gaze: KaiGaze | null) {
    externalGaze = gaze;

    if (!pointerGaze) {
        engine.lookAt(gaze);
        wake();
    }
}

function blink() {
    engine.blink();
    wake();
}

function pause() {
    manualPause.value = true;
}

function resume() {
    manualPause.value = false;
}

/** Datos de diagnóstico para el laboratorio. */
function inspect() {
    return {
        state: engine.state,
        reaction: engine.activeReaction,
        area: engine.frame.area,
        running: unsubscribe !== null,
    };
}

defineExpose({ setState, react, track, lookAt, blink, pause, resume, inspect });

onMounted(() => {
    render();
    mounted.value = true;
});

onBeforeUnmount(() => {
    destroyed = true;
    trackToken++;
    stop();
    window.clearTimeout(touchTimer);
    offEvents.forEach((off) => off());
    engine.destroy();
});
</script>

<template>
    <div
        ref="root"
        class="kai"
        :class="{ 'kai--animate-size': animateSize, 'kai--playful': playful }"
        :data-surface="surface"
        :data-small="px < 64 || undefined"
        :style="{ width: `${px}px`, height: `${px}px`, ...palette }"
        :role="label ? 'img' : undefined"
        :aria-label="label || undefined"
        :aria-hidden="label ? undefined : 'true'"
        @pointermove="onPointerMove"
        @pointerleave="releaseGaze"
        @pointerdown="onPointerDown"
        @click="onClick"
    >
        <svg
            class="kai-svg"
            :viewBox="VIEWBOX"
            overflow="visible"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <path :id="ids.shape" ref="shapeEl" fill-rule="evenodd" />
                <clipPath :id="ids.clip">
                    <use :href="shapeHref" clip-rule="evenodd" />
                </clipPath>
                <radialGradient
                    ref="baseEl"
                    :id="ids.base"
                    gradientUnits="userSpaceOnUse"
                    :r="R * 1.25"
                >
                    <stop offset="0" class="kai-stop-mid" />
                    <stop offset="0.5" class="kai-stop-primary" />
                    <stop offset="1" class="kai-stop-deep" />
                </radialGradient>
                <linearGradient :id="ids.rim" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" class="kai-stop-rim-top" />
                    <stop offset="0.55" class="kai-stop-rim-mid" />
                    <stop offset="1" class="kai-stop-rim-bottom" />
                </linearGradient>
                <radialGradient :id="ids.specular">
                    <stop
                        offset="0"
                        class="kai-stop-white"
                        stop-opacity="0.9"
                    />
                    <stop offset="1" class="kai-stop-white" stop-opacity="0" />
                </radialGradient>
                <!-- Cada gota con su propio degradado, como en la referencia -->
                <radialGradient :id="ids.dots[0]" cx="0.38" cy="0.32" r="0.75">
                    <stop offset="0" class="kai-stop-accent-light" />
                    <stop offset="0.6" class="kai-stop-accent" />
                    <stop offset="1" class="kai-stop-deep" />
                </radialGradient>
                <radialGradient :id="ids.dots[1]" cx="0.38" cy="0.32" r="0.75">
                    <stop offset="0" class="kai-stop-light" />
                    <stop offset="0.6" class="kai-stop-primary" />
                    <stop offset="1" class="kai-stop-accent" />
                </radialGradient>
                <radialGradient :id="ids.dots[2]" cx="0.38" cy="0.32" r="0.75">
                    <stop offset="0" class="kai-stop-light" />
                    <stop offset="0.55" class="kai-stop-mid" />
                    <stop offset="1" class="kai-stop-primary" />
                </radialGradient>
                <radialGradient :id="ids.shadow">
                    <stop offset="0" class="kai-stop-shadow" />
                    <stop offset="1" class="kai-stop-shadow-out" />
                </radialGradient>
                <filter
                    :id="ids.soft"
                    x="-30%"
                    y="-30%"
                    width="160%"
                    height="160%"
                    color-interpolation-filters="sRGB"
                >
                    <feGaussianBlur stdDeviation="6" />
                </filter>
                <filter
                    :id="ids.blush"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                >
                    <feGaussianBlur stdDeviation="2.6" />
                </filter>
                <!-- Región fija: un arco muy plano recortaría el desenfoque. -->
                <filter
                    :id="ids.halo"
                    filterUnits="userSpaceOnUse"
                    x="-16"
                    y="-18"
                    width="32"
                    height="36"
                >
                    <feGaussianBlur stdDeviation="2.4" />
                </filter>
                <clipPath :id="ids.mouthClip">
                    <use :href="`#${ids.mouth}`" />
                </clipPath>
            </defs>

            <ellipse
                ref="shadowEl"
                class="kai-shadow"
                :fill="url(ids.shadow)"
            />

            <!-- Gotitas sueltas (detrás: dentro del cuerpo no se ven) -->
            <g>
                <circle
                    v-for="i in MAX_SATS"
                    :key="`dot-${i}`"
                    :ref="slot(dotEls, i - 1)"
                    :fill="url(ids.dots[(i - 1) % 3])"
                    visibility="hidden"
                />
            </g>

            <!-- Fluido: degradado base, manchas de color que giran y brillos -->
            <g :clip-path="url(ids.clip)">
                <use :href="shapeHref" :fill="url(ids.base)" />
                <g :filter="url(ids.soft)">
                    <ellipse
                        :ref="slot(blobEls, 0)"
                        class="kai-blob kai-blob--accent"
                    />
                    <ellipse
                        :ref="slot(blobEls, 1)"
                        class="kai-blob kai-blob--light"
                    />
                    <ellipse
                        :ref="slot(blobEls, 2)"
                        class="kai-blob kai-blob--deep"
                    />
                    <ellipse
                        :ref="slot(blobEls, 3)"
                        class="kai-blob kai-blob--accent-light"
                    />
                    <circle
                        v-for="i in MAX_SATS"
                        :key="`sat-${i}`"
                        :ref="slot(satEls, i - 1)"
                        class="kai-sat"
                        :fill="url(ids.dots[(i - 1) % 3])"
                        visibility="hidden"
                    />
                    <use ref="coolEl" :href="shapeHref" class="kai-cool" />
                    <use ref="glowEl" :href="shapeHref" class="kai-glow" />
                    <use :href="shapeHref" class="kai-inner-rim" />
                    <ellipse ref="highlightEl" class="kai-highlight" />
                </g>
                <!-- Rubor: capa propia con desenfoque suave para que se lea -->
                <g :filter="url(ids.blush)">
                    <ellipse
                        :ref="slot(blushEls, 0)"
                        class="kai-blush"
                        opacity="0"
                    />
                    <ellipse
                        :ref="slot(blushEls, 1)"
                        class="kai-blush"
                        opacity="0"
                    />
                </g>
                <use
                    :href="shapeHref"
                    class="kai-rim-line"
                    :stroke="url(ids.rim)"
                />
                <ellipse
                    ref="specularEl"
                    class="kai-specular"
                    :fill="url(ids.specular)"
                />
            </g>

            <!-- Rostro -->
            <g ref="faceEl">
                <path
                    :ref="slot(haloEls, 0)"
                    class="kai-eye-halo"
                    :filter="url(ids.halo)"
                />
                <path
                    :ref="slot(haloEls, 1)"
                    class="kai-eye-halo"
                    :filter="url(ids.halo)"
                />
                <path :ref="slot(eyeEls, 0)" class="kai-eye" />
                <path :ref="slot(eyeEls, 1)" class="kai-eye" />
                <path
                    :ref="slot(spiralEls, 0)"
                    class="kai-spiral"
                    :d="SPIRAL"
                    opacity="0"
                />
                <path
                    :ref="slot(spiralEls, 1)"
                    class="kai-spiral"
                    :d="SPIRAL"
                    opacity="0"
                />
                <path
                    :ref="slot(heartEls, 0)"
                    class="kai-heart"
                    :d="HEART"
                    opacity="0"
                />
                <path
                    :ref="slot(heartEls, 1)"
                    class="kai-heart"
                    :d="HEART"
                    opacity="0"
                />
                <g v-if="mouth" ref="mouthGroupEl">
                    <path :id="ids.mouth" ref="mouthEl" class="kai-mouth" />
                    <path
                        ref="tongueEl"
                        class="kai-tongue"
                        :clip-path="url(ids.mouthClip)"
                    />
                    <path ref="mouthLineEl" class="kai-mouth-line" />
                </g>
            </g>

            <!-- Partículas: notas, corazones, zetas, destellos -->
            <g class="kai-sprites">
                <path
                    v-for="i in MAX_SPRITES"
                    :key="`sprite-${i}`"
                    :ref="slot(spriteEls, i - 1)"
                    class="kai-sprite"
                    visibility="hidden"
                />
            </g>

            <g v-if="debug" class="kai-debug">
                <circle cx="0" cy="0" :r="R" />
                <line x1="-72" :y1="R + 16" x2="72" :y2="R + 16" />
            </g>
        </svg>
    </div>
</template>

<style scoped>
.kai {
    --kai-ink: #151924;
    --kai-edge: rgba(255, 255, 255, 0.85);
    --kai-rim-top: rgba(255, 255, 255, 0.2);
    --kai-rim-mid: rgba(255, 255, 255, 0.35);
    --kai-rim-bottom: rgba(255, 255, 255, 0.95);
    --kai-shadow-alpha: 0.32;

    position: relative;
    display: inline-block;
    flex: none;
    -webkit-tap-highlight-color: transparent;
}

.kai--animate-size {
    transition:
        width 0.55s cubic-bezier(0.34, 1.56, 0.64, 1),
        height 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.kai--playful {
    cursor: pointer;
}

.kai[data-surface='dark'],
:root.dark .kai[data-surface='auto'] {
    --kai-rim-top: rgba(255, 255, 255, 0.3);
    --kai-rim-mid: rgba(255, 255, 255, 0.45);
    --kai-shadow-alpha: 0.24;
}

.kai-svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
}

.kai-stop-light {
    stop-color: var(--kai-light);
}

.kai-stop-mid {
    stop-color: var(--kai-mid);
}

.kai-stop-accent {
    stop-color: var(--kai-accent);
}

.kai-stop-white {
    stop-color: #ffffff;
}

.kai-specular {
    pointer-events: none;
}

.kai-stop-primary {
    stop-color: var(--kai-primary);
}

.kai-stop-deep {
    stop-color: var(--kai-deep);
}

.kai-stop-rim-top {
    stop-color: #ffffff;
    stop-opacity: 0.25;
}

.kai-stop-rim-mid {
    stop-color: #ffffff;
    stop-opacity: 0.35;
}

.kai-stop-rim-bottom {
    stop-color: #ffffff;
    stop-opacity: 0.95;
}

.kai-stop-shadow {
    stop-color: var(--kai-shadow);
    stop-opacity: var(--kai-shadow-alpha);
}

.kai-stop-shadow-out {
    stop-color: var(--kai-shadow);
    stop-opacity: 0;
}

.kai-blob--accent {
    fill: var(--kai-accent);
    opacity: 0.92;
}

.kai-blob--light {
    fill: var(--kai-light);
    opacity: 0.55;
}

.kai-blob--deep {
    fill: var(--kai-deep);
    opacity: 0.55;
}

.kai-blob--accent-light {
    fill: var(--kai-accent-light);
    opacity: 0.7;
}

.kai-sat {
    opacity: 0.9;
}

.kai-stop-accent-light {
    stop-color: var(--kai-accent-light);
}

.kai-cool {
    fill: var(--kai-secondary);
}

.kai-glow {
    fill: var(--kai-light);
}

/* Brillo interior del borde: da volumen de gota translúcida. */
.kai-inner-rim {
    fill: none;
    stroke: var(--kai-rim);
    stroke-width: 6;
    opacity: 0.6;
}

.kai-highlight {
    fill: #ffffff;
    opacity: 0.22;
}

.kai-blush {
    fill: var(--kai-blush);
}

.kai-rim-line {
    fill: none;
    stroke-width: 2.2;
}

.kai-shadow {
    pointer-events: none;
}

.kai-eye {
    fill: none;
    stroke: #ffffff;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.kai-eye-halo {
    fill: none;
    stroke: var(--kai-halo);
    stroke-linecap: round;
    opacity: 0.26;
}

.kai-spiral {
    fill: none;
    stroke: #ffffff;
    stroke-width: 0.24;
    stroke-linecap: round;
}

.kai-heart {
    fill: #ffffff;
}

.kai-mouth {
    fill: var(--kai-ink);
}

.kai-tongue {
    fill: var(--kai-blush);
}

.kai-mouth-line {
    fill: none;
    stroke: #ffffff;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.kai-sprite[data-kind='fill'] {
    stroke: none;
}

.kai-sprite[data-kind='stroke'] {
    fill: none;
    stroke-width: 0.32;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.kai-sprite[data-tint='0'] {
    fill: var(--kai-primary);
}

.kai-sprite[data-tint='1'] {
    fill: var(--kai-accent);
}

.kai-sprite[data-tint='2'] {
    fill: var(--kai-blush);
}

.kai-sprite[data-tint='3'] {
    fill: var(--kai-light);
}

.kai-sprite[data-kind='stroke'][data-tint='3'] {
    fill: none;
    stroke: var(--kai-accent);
}

.kai-debug {
    fill: none;
    stroke: #ff3b6b;
    stroke-width: 0.6;
    stroke-dasharray: 2 2;
    pointer-events: none;
}
</style>
