<script setup lang="ts">
/**
 * KAI flotante, abajo a la derecha de la intranet.
 *
 * Tres tamaños (mínimo, normal, grande): en mínimo los gestos se contienen y
 * se apagan los lóbulos y motas de ambiente. Opcionalmente se estira cuando
 * la página llega al final del scroll.
 *
 * Presencia: saluda una vez por sesión, se mece como gelatina cuando la
 * página se desplaza (y mira el contenido), y se duerme tras un rato sin
 * actividad; al volver el usuario, despierta con un bostezo.
 */
import {
    useEventListener,
    useIntervalFn,
    usePreferredReducedMotion,
} from '@vueuse/core';
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
} from 'vue';
import type { KaiColors } from '@/lib/kai/palette';
import type { KaiDockSize, KaiReducedMotion, KaiState } from '@/lib/kai/types';
import KaiCharacter from './KaiCharacter.vue';
import { useKaiOverscroll } from './useKaiOverscroll';

type Props = {
    colors?: Partial<KaiColors>;
    mouth?: boolean;
    intensity?: number;
    paused?: boolean;
    reducedMotion?: KaiReducedMotion;
    /** Estirarse al llegar al final del scroll. */
    overscroll?: boolean;
    /** Contenido que sube con el estiramiento. */
    stretchTarget?: () => HTMLElement | null;
    /** Segundos sin actividad hasta que se duerme (0 = nunca). */
    sleepAfter?: number;
    /** Saluda una vez por sesión al aparecer. */
    greet?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    colors: () => ({}),
    mouth: false,
    intensity: 1,
    paused: false,
    reducedMotion: 'auto',
    overscroll: true,
    stretchTarget: () => document.querySelector<HTMLElement>('main'),
    sleepAfter: 90,
    greet: true,
});

const state = defineModel<KaiState>('state', { default: 'idle' });
const size = defineModel<KaiDockSize>('size', { default: 'normal' });

const SIZES: Record<KaiDockSize, number> = {
    mini: 56,
    normal: 96,
    grande: 144,
};
const ORDER: KaiDockSize[] = ['mini', 'normal', 'grande'];

const kai = ref<InstanceType<typeof KaiCharacter> | null>(null);
const px = computed(() => SIZES[size.value]);
const index = computed(() => ORDER.indexOf(size.value));

const prefersReduced = usePreferredReducedMotion();
const reduced = computed(() =>
    props.reducedMotion === 'auto'
        ? prefersReduced.value === 'reduce'
        : props.reducedMotion === 'reduce',
);

const { pull } = useKaiOverscroll({
    enabled: computed(
        () => props.overscroll && !reduced.value && !props.paused,
    ),
    target: () => props.stretchTarget(),
});

function resize(step: number) {
    const next =
        ORDER[Math.min(ORDER.length - 1, Math.max(0, index.value + step))];

    if (next !== size.value) {
        size.value = next;
    }
}

// Cada cambio de tamaño se acompaña con un pequeño rebote.
watch(size, () => {
    void kai.value?.react('boing');
});

/* ── Sueño por inactividad ───────────────────────────────────────────── */
const asleep = ref(false);
let lastActivity = Date.now();

// Dormido solo «tapa» el reposo: cualquier estado real lo despierta.
const shown = computed<KaiState>(() =>
    asleep.value && state.value === 'idle' ? 'sleeping' : state.value,
);

function onState(next: KaiState) {
    if (asleep.value && next === 'sleeping') {
        return;
    }

    asleep.value = false;
    state.value = next;
}

function activity() {
    lastActivity = Date.now();

    if (asleep.value) {
        asleep.value = false;
        // Tras volver al reposo: si no, el cambio de estado cortaría el bostezo.
        void nextTick(() => kai.value?.react('yawn'));
    }
}

// Sin objetivo explícito, VueUse escucha en `window` (y nada en SSR).
useEventListener(
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'],
    activity,
    { passive: true },
);

useIntervalFn(() => {
    if (
        props.sleepAfter > 0 &&
        !asleep.value &&
        !props.paused &&
        state.value === 'idle' &&
        Date.now() - lastActivity > props.sleepAfter * 1000
    ) {
        asleep.value = true;
    }
}, 2000);

/* ── La página se desplaza: gelatina y mirada al contenido ───────────── */
let lastScroll = 0;
let lookTimer = 0;

useEventListener(
    'scroll',
    () => {
        const y = window.scrollY;
        const dy = y - lastScroll;
        lastScroll = y;
        activity();

        if (!dy || reduced.value || props.paused || !kai.value) {
            return;
        }

        // El contenido arrastra un poco la masa, que vuelve con rebote.
        kai.value.nudge(0, Math.max(-1.2, Math.min(1.2, -dy * 0.012)));
        kai.value.lookAt({ x: -0.55, y: dy > 0 ? 0.15 : -0.5 });
        window.clearTimeout(lookTimer);
        lookTimer = window.setTimeout(() => kai.value?.lookAt(null), 800);
    },
    { passive: true },
);

/* ── Saludo: una vez por sesión ──────────────────────────────────────── */
const GREETED_KEY = 'kiub.kai.greeted';
let greetTimer = 0;

onMounted(() => {
    lastScroll = window.scrollY;

    if (!props.greet) {
        return;
    }

    try {
        if (window.sessionStorage.getItem(GREETED_KEY)) {
            return;
        }

        window.sessionStorage.setItem(GREETED_KEY, '1');
    } catch {
        // Sin almacenamiento: saluda en cada carga, sin más consecuencias.
    }

    greetTimer = window.setTimeout(() => {
        if (state.value === 'idle') {
            void kai.value?.react('welcome');
        }
    }, 900);
});

onBeforeUnmount(() => {
    window.clearTimeout(lookTimer);
    window.clearTimeout(greetTimer);
});

/** `dock.value?.kai?.react('welcome')`, `track(...)`, etc. */
defineExpose({ kai, asleep });
</script>

<template>
    <div class="kai-dock" :data-size="size">
        <div class="kai-dock-body">
            <KaiCharacter
                ref="kai"
                :state="shown"
                :size="px"
                animate-size
                playful
                :colors="colors"
                :mouth="mouth"
                :ambient="size !== 'mini'"
                :intensity="size === 'mini' ? intensity * 0.5 : intensity"
                :paused="paused"
                :reduced-motion="reducedMotion"
                :pull="pull"
                @update:state="onState"
            />
        </div>
        <div class="kai-dock-controls" role="group" aria-label="Tamaño de KAI">
            <button
                type="button"
                class="kai-dock-button"
                data-dock-shrink
                :disabled="index === 0"
                aria-label="Hacer KAI más pequeño"
                @click="resize(-1)"
            >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 8h8" />
                </svg>
            </button>
            <button
                type="button"
                class="kai-dock-button"
                data-dock-grow
                :disabled="index === ORDER.length - 1"
                aria-label="Hacer KAI más grande"
                @click="resize(1)"
            >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 8h8M8 4v8" />
                </svg>
            </button>
        </div>
    </div>
</template>

<style scoped>
.kai-dock {
    position: fixed;
    right: 28px;
    bottom: 22px;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
}

.kai-dock-body {
    pointer-events: auto;
}

.kai-dock-controls {
    display: flex;
    gap: 4px;
    padding: 3px;
    border: 1px solid rgba(169, 193, 211, 0.5);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.86);
    box-shadow: 0 6px 18px -10px rgba(21, 25, 36, 0.4);
    opacity: 0;
    transform: translateY(4px);
    transition:
        opacity 0.25s,
        transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: auto;
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
}

.kai-dock:hover .kai-dock-controls,
.kai-dock:focus-within .kai-dock-controls {
    opacity: 1;
    transform: none;
}

:root.dark .kai-dock-controls {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(18, 23, 34, 0.86);
}

.kai-dock-button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #151924;
    cursor: pointer;
}

:root.dark .kai-dock-button {
    color: #e8edf5;
}

.kai-dock-button:hover:not(:disabled) {
    background: rgba(92, 157, 255, 0.16);
}

.kai-dock-button:disabled {
    opacity: 0.35;
    cursor: default;
}

.kai-dock-button:focus-visible {
    outline: 3px solid #5c9dff;
    outline-offset: 1px;
}

.kai-dock-button svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
}

@media (prefers-reduced-motion: reduce) {
    .kai-dock-controls {
        transition: none;
    }
}
</style>
