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
    useIntersectionObserver,
    usePreferredReducedMotion,
} from '@vueuse/core';
import type { ComponentPublicInstance } from 'vue';
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { KaiEngine, MAX_DROPS } from '@/lib/kai/engine';
import { R, VIEWBOX } from '@/lib/kai/shape';
import { subscribeTick } from '@/lib/kai/ticker';
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
    /** Mirar al puntero mientras está sobre el propio componente. */
    followPointer?: boolean;
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
    followPointer: false,
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

const uid = useId().replace(/[^\w-]/g, '');
const ids = {
    body: `kai-${uid}-body`,
    clip: `kai-${uid}-clip`,
    rim: `kai-${uid}-rim`,
    core: `kai-${uid}-core`,
    drop: `kai-${uid}-drop`,
    shadow: `kai-${uid}-shadow`,
    soft: `kai-${uid}-soft`,
    halo: `kai-${uid}-halo`,
};
const url = (id: string) => `url(#${id})`;
const href = `#${ids.body}`;

const prefersReduced = usePreferredReducedMotion();
const reduced = computed(() =>
    props.reducedMotion === 'auto'
        ? prefersReduced.value === 'reduce'
        : props.reducedMotion === 'reduce',
);

const engine = new KaiEngine({ state: state.value, reduced: reduced.value });

/* ── Elementos que cambian en cada fotograma ─────────────────────────── */
const root = ref<HTMLElement | null>(null);
const bodyEl = ref<SVGPathElement | null>(null);
const shadowEl = ref<SVGEllipseElement | null>(null);
const coreEl = ref<SVGUseElement | null>(null);
const coolEl = ref<SVGUseElement | null>(null);
const glowEl = ref<SVGUseElement | null>(null);
const lobeEl = ref<SVGUseElement | null>(null);
const highlightEl = ref<SVGEllipseElement | null>(null);
const eyeL = ref<SVGPathElement | null>(null);
const eyeR = ref<SVGPathElement | null>(null);
const haloL = ref<SVGPathElement | null>(null);
const haloR = ref<SVGPathElement | null>(null);
const dropEls: (Element | null)[] = [];
const bridgeEls: (Element | null)[] = [];

// El orden importa: la gota i del fotograma se dibuja en el elemento i.
function slot(list: (Element | null)[], index: number) {
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

function render() {
    const f = engine.frame;

    attr(bodyEl.value, 'd', f.body);
    attr(coreEl.value, 'transform', f.core);
    attr(coolEl.value, 'transform', f.core);
    attr(coolEl.value, 'opacity', f.cool * 0.5);
    attr(glowEl.value, 'transform', f.core);
    attr(glowEl.value, 'opacity', f.glow);
    attr(lobeEl.value, 'transform', f.lobe);

    const h = f.highlight;
    attr(highlightEl.value, 'cx', h.cx);
    attr(highlightEl.value, 'cy', h.cy);
    attr(highlightEl.value, 'rx', h.rx);
    attr(highlightEl.value, 'ry', h.ry);
    attr(highlightEl.value, 'transform', `rotate(${h.angle} ${h.cx} ${h.cy})`);

    const s = f.shadow;
    attr(shadowEl.value, 'cx', s.cx);
    attr(shadowEl.value, 'cy', s.cy);
    attr(shadowEl.value, 'rx', s.rx);
    attr(shadowEl.value, 'ry', s.ry);
    attr(shadowEl.value, 'opacity', s.opacity);

    const eyes = [eyeL.value, eyeR.value];
    const halos = [haloL.value, haloR.value];

    f.eyes.forEach((eye, i) => {
        for (const el of [eyes[i], halos[i]]) {
            attr(el, 'd', eye.d);
            attr(el, 'transform', eye.transform);
        }

        attr(eyes[i], 'stroke-width', eye.width);
        attr(halos[i], 'stroke-width', Math.round(eye.width * 260) / 100);
    });

    f.drops.forEach((drop, i) => {
        const circle = dropEls[i];
        const bridge = bridgeEls[i];
        attr(circle, 'visibility', drop.visible ? 'visible' : 'hidden');
        attr(
            bridge,
            'visibility',
            drop.visible && drop.bridge ? 'visible' : 'hidden',
        );

        if (drop.visible) {
            attr(circle, 'cx', drop.cx);
            attr(circle, 'cy', drop.cy);
            attr(circle, 'r', drop.r);
            attr(bridge, 'd', drop.bridge || 'M0 0');
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

function tick(dt: number) {
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
    px,
    (value) => engine.setSizeFactor(value < 64 ? 0.6 : value < 140 ? 0.85 : 1),
    { immediate: true },
);

watch(reduced, (value) => {
    engine.setReduced(value);
    wake();
});

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

/* ── Mirada: limitada al propio componente ───────────────────────────── */
let externalGaze: KaiGaze | null = null;
let pointerGaze = false;
let touchTimer: number | undefined;

function gazeFromPointer(event: PointerEvent): KaiGaze | null {
    const el = root.value;

    if (!el) {
        return null;
    }

    const rect = el.getBoundingClientRect();
    // El centro del cuerpo está en y = 0 del viewBox (-70…58).
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * (70 / 128);

    return {
        x: (event.clientX - cx) / (rect.width * 0.5),
        y: (event.clientY - cy) / (rect.height * 0.5),
    };
}

function onPointerMove(event: PointerEvent) {
    if (!props.followPointer || event.pointerType === 'touch') {
        return;
    }

    engine.lookAt(gazeFromPointer(event));
    pointerGaze = true;
    wake();
}

function onPointerLeave() {
    if (pointerGaze) {
        pointerGaze = false;
        engine.lookAt(externalGaze);
        wake();
    }
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
    touchTimer = window.setTimeout(onPointerLeave, 1200);
}

watch(
    () => props.followPointer,
    (value) => {
        if (!value) {
            onPointerLeave();
        }
    },
);

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
        :data-surface="surface"
        :data-small="px < 64 || undefined"
        :style="{ width: `${px}px`, height: `${px}px` }"
        :role="label ? 'img' : undefined"
        :aria-label="label || undefined"
        :aria-hidden="label ? undefined : 'true'"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @pointerdown="onPointerDown"
    >
        <svg
            class="kai-svg"
            :viewBox="VIEWBOX"
            overflow="visible"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <path :id="ids.body" ref="bodyEl" />
                <clipPath :id="ids.clip">
                    <use :href="href" />
                </clipPath>
                <linearGradient :id="ids.rim" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" class="kai-stop-rim-top" />
                    <stop offset="0.55" class="kai-stop-rim-mid" />
                    <stop offset="1" class="kai-stop-rim-bottom" />
                </linearGradient>
                <radialGradient
                    :id="ids.core"
                    cx="0.5"
                    cy="0.62"
                    r="0.6"
                    fx="0.48"
                    fy="0.7"
                >
                    <stop offset="0" class="kai-stop-core-light" />
                    <stop offset="0.42" class="kai-stop-core" />
                    <stop offset="1" class="kai-stop-core-deep" />
                </radialGradient>
                <radialGradient :id="ids.drop" cx="0.4" cy="0.36" r="0.7">
                    <stop offset="0" class="kai-stop-core-light" />
                    <stop offset="0.6" class="kai-stop-core" />
                    <stop offset="1" class="kai-stop-rim-mid" />
                </radialGradient>
                <radialGradient :id="ids.shadow">
                    <stop offset="0" class="kai-stop-shadow" />
                    <stop offset="1" class="kai-stop-shadow-out" />
                </radialGradient>
                <filter
                    :id="ids.soft"
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                    color-interpolation-filters="sRGB"
                >
                    <feGaussianBlur stdDeviation="4.5" />
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
            </defs>

            <ellipse ref="shadowEl" :fill="url(ids.shadow)" />

            <!-- Borde translúcido -->
            <use :href="href" class="kai-rim" :fill="url(ids.rim)" />

            <!-- Masa interior, difuminada y recortada al contorno -->
            <g :clip-path="url(ids.clip)">
                <g :filter="url(ids.soft)">
                    <use ref="coreEl" :href="href" :fill="url(ids.core)" />
                    <use ref="coolEl" :href="href" class="kai-cool" />
                    <use ref="glowEl" :href="href" class="kai-glow" />
                    <use ref="lobeEl" :href="href" class="kai-lobe" />
                    <ellipse ref="highlightEl" class="kai-highlight" />
                </g>
                <use :href="href" class="kai-edge" />
            </g>

            <!-- Gotas que se separan y vuelven (encima del borde: sin costura) -->
            <g>
                <template v-for="i in MAX_DROPS" :key="i">
                    <path
                        :ref="slot(bridgeEls, i - 1)"
                        class="kai-bridge"
                        visibility="hidden"
                    />
                    <circle
                        :ref="slot(dropEls, i - 1)"
                        :fill="url(ids.drop)"
                        visibility="hidden"
                    />
                </template>
            </g>

            <g>
                <path
                    ref="haloL"
                    class="kai-eye-halo"
                    :filter="url(ids.halo)"
                />
                <path
                    ref="haloR"
                    class="kai-eye-halo"
                    :filter="url(ids.halo)"
                />
                <path ref="eyeL" class="kai-eye" />
                <path ref="eyeR" class="kai-eye" />
            </g>

            <g v-if="debug" class="kai-debug">
                <circle cx="0" cy="0" :r="R" />
                <line x1="-64" :y1="R" x2="64" :y2="R" />
            </g>
        </svg>
    </div>
</template>

<style scoped>
.kai {
    --kai-blue: #5c9dff;
    --kai-mist: #a9c1d3;
    --kai-ink: #151924;

    --kai-rim-top: #b3cdf6;
    --kai-rim-mid: #d2e1f4;
    --kai-rim-bottom: #f3f7fd;
    --kai-core-light: #a3c7ff;
    --kai-core: #649fff;
    --kai-core-deep: #4a86ec;
    --kai-lobe: #d4e4ff;
    --kai-eye: #ffffff;
    --kai-eye-halo: #234f9e;
    --kai-edge: rgba(255, 255, 255, 0.75);
    --kai-shadow: rgba(92, 157, 255, 0.34);

    position: relative;
    display: inline-block;
    flex: none;
    -webkit-tap-highlight-color: transparent;
}

.kai[data-surface='dark'] {
    --kai-rim-top: #8fb2ec;
    --kai-rim-mid: #b4cbec;
    --kai-rim-bottom: #dce8f8;
    --kai-edge: rgba(255, 255, 255, 0.5);
    --kai-shadow: rgba(92, 157, 255, 0.26);
}

:root.dark .kai[data-surface='auto'] {
    --kai-rim-top: #8fb2ec;
    --kai-rim-mid: #b4cbec;
    --kai-rim-bottom: #dce8f8;
    --kai-edge: rgba(255, 255, 255, 0.5);
    --kai-shadow: rgba(92, 157, 255, 0.26);
}

/* En tamaño pequeño el borde translúcido se pierde: se satura un poco. */
.kai[data-small] {
    --kai-rim-top: #94b9f2;
    --kai-rim-mid: #a9c6f0;
    --kai-rim-bottom: #cfe0f7;
}

.kai-svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
}

.kai-stop-rim-top {
    stop-color: var(--kai-rim-top);
}

.kai-stop-rim-mid {
    stop-color: var(--kai-rim-mid);
}

.kai-stop-rim-bottom {
    stop-color: var(--kai-rim-bottom);
}

.kai-stop-core-light {
    stop-color: var(--kai-core-light);
}

.kai-stop-core {
    stop-color: var(--kai-core);
}

.kai-stop-core-deep {
    stop-color: var(--kai-core-deep);
}

.kai-stop-shadow {
    stop-color: var(--kai-shadow);
}

.kai-stop-shadow-out {
    stop-color: var(--kai-shadow);
    stop-opacity: 0;
}

.kai-rim {
    opacity: 0.94;
}

.kai-cool {
    fill: var(--kai-mist);
}

.kai-glow {
    fill: var(--kai-core-light);
}

.kai-bridge {
    fill: var(--kai-core);
    opacity: 0.9;
}

.kai-lobe {
    fill: var(--kai-lobe);
    opacity: 0.55;
}

.kai-highlight {
    fill: #ffffff;
    opacity: 0.2;
}

.kai-edge {
    fill: none;
    stroke: var(--kai-edge);
    stroke-width: 1.6;
}

.kai-eye {
    fill: none;
    stroke: var(--kai-eye);
    stroke-linecap: round;
    stroke-linejoin: round;
}

.kai-eye-halo {
    fill: none;
    stroke: var(--kai-eye-halo);
    stroke-linecap: round;
    opacity: 0.3;
}

.kai-debug {
    fill: none;
    stroke: #ff3b6b;
    stroke-width: 0.6;
    stroke-dasharray: 2 2;
    pointer-events: none;
}
</style>
