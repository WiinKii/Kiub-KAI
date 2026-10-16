<script setup lang="ts">
/**
 * KAI flotante, abajo a la derecha de la intranet.
 *
 * Tres tamaños (mínimo, normal, grande): en mínimo los gestos se contienen y
 * se apagan los lóbulos y motas de ambiente. Opcionalmente se estira cuando
 * la página llega al final del scroll.
 */
import { usePreferredReducedMotion } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
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
};

const props = withDefaults(defineProps<Props>(), {
    colors: () => ({}),
    mouth: false,
    intensity: 1,
    paused: false,
    reducedMotion: 'auto',
    overscroll: true,
    stretchTarget: () => document.querySelector<HTMLElement>('main'),
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

/** `dock.value?.kai?.react('welcome')`, `track(...)`, etc. */
defineExpose({ kai });
</script>

<template>
    <div class="kai-dock" :data-size="size">
        <div class="kai-dock-body">
            <KaiCharacter
                ref="kai"
                v-model:state="state"
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
