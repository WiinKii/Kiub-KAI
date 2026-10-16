<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';
import KaiCharacter from '@/components/kai/KaiCharacter.vue';
import {
    KAI_REACTIONS,
    KAI_STATES,
    REACTION_CATALOG,
    STATE_CATALOG,
} from '@/lib/kai/catalog';
import type {
    KaiController,
    KaiReaction,
    KaiReactionResult,
} from '@/lib/kai/types';
import type { LabSettings } from './settings';

defineProps<{ settings: LabSettings }>();

const uid = useId();
const replay = ref(true);
const controllers: Partial<Record<KaiReaction, KaiController | null>> = {};
const timers = new Map<KaiReaction, number>();

function bind(name: KaiReaction) {
    return (el: unknown) => {
        controllers[name] = (el as KaiController | null) ?? null;
    };
}

function play(name: KaiReaction) {
    window.clearTimeout(timers.get(name));
    void controllers[name]?.react(name);
}

function schedule(name: KaiReaction, delay: number) {
    window.clearTimeout(timers.get(name));
    timers.set(
        name,
        window.setTimeout(() => {
            if (replay.value) {
                play(name);
            }
        }, delay),
    );
}

function onReactionEnd(name: KaiReaction, result: KaiReactionResult) {
    if (replay.value && !result.interrupted) {
        schedule(name, 1600);
    }
}

function toggleReplay() {
    replay.value = !replay.value;

    if (replay.value) {
        KAI_REACTIONS.forEach((name, i) => schedule(name, 300 + i * 450));
    } else {
        timers.forEach((timer) => window.clearTimeout(timer));
    }
}

onMounted(() => {
    KAI_REACTIONS.forEach((name, i) => schedule(name, 700 + i * 450));
});

onBeforeUnmount(() => {
    timers.forEach((timer) => window.clearTimeout(timer));
});
</script>

<template>
    <section class="klg" :aria-labelledby="`${uid}-title`">
        <header class="klg-head">
            <div>
                <h2 :id="`${uid}-title`" class="klg-title">
                    Comparativa de expresiones
                </h2>
                <p class="klg-hint">
                    Todos los estados a la vez, para comprobar que se distinguen
                    y que KAI no pierde identidad al deformarse.
                </p>
            </div>
            <button
                type="button"
                class="klg-toggle"
                :aria-pressed="replay ? 'true' : 'false'"
                @click="toggleReplay"
            >
                {{ replay ? 'Repetir gestos: sí' : 'Repetir gestos: no' }}
            </button>
        </header>

        <ul class="klg-grid" :data-surface="settings.surface">
            <li v-for="key in KAI_STATES" :key="key" class="klg-cell">
                <KaiCharacter
                    :state="key"
                    :size="112"
                    :surface="settings.surface"
                    :paused="settings.paused"
                    :reduced-motion="settings.motion"
                    :intensity="settings.intensity"
                    :time-scale="settings.timeScale"
                    :colors="settings.colors"
                    :mouth="settings.mouth"
                    :blush="settings.blush"
                    :ambient="settings.ambient"
                    :debug="settings.debug"
                />
                <strong class="klg-name">{{ STATE_CATALOG[key].label }}</strong>
                <span class="klg-desc">{{
                    STATE_CATALOG[key].description
                }}</span>
            </li>
            <li
                v-for="key in KAI_REACTIONS"
                :key="key"
                class="klg-cell klg-cell--reaction"
            >
                <KaiCharacter
                    :ref="bind(key)"
                    :size="112"
                    :surface="settings.surface"
                    :paused="settings.paused"
                    :reduced-motion="settings.motion"
                    :intensity="settings.intensity"
                    :time-scale="settings.timeScale"
                    :colors="settings.colors"
                    :mouth="settings.mouth"
                    :blush="settings.blush"
                    :ambient="settings.ambient"
                    :debug="settings.debug"
                    @reaction-end="onReactionEnd(key, $event)"
                />
                <strong class="klg-name">{{
                    REACTION_CATALOG[key].label
                }}</strong>
                <span class="klg-desc">{{
                    REACTION_CATALOG[key].description
                }}</span>
                <button type="button" class="klg-play" @click="play(key)">
                    Repetir
                    <span class="sr-only">{{
                        REACTION_CATALOG[key].label
                    }}</span>
                </button>
            </li>
        </ul>
    </section>
</template>

<style scoped>
.klg {
    display: grid;
    gap: 16px;
}

.klg-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
}

.klg-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--kl-ink);
}

.klg-hint {
    margin: 4px 0 0;
    max-width: 60ch;
    font-size: 14px;
    color: var(--kl-ink-3);
}

.klg-toggle,
.klg-play {
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid var(--kl-line);
    border-radius: 999px;
    background: var(--kl-surface);
    color: var(--kl-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}

.klg-toggle:focus-visible,
.klg-play:focus-visible {
    outline: 3px solid var(--kl-focus);
    outline-offset: 2px;
}

.klg-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
    gap: 10px;
    margin: 0;
    padding: 14px;
    border-radius: 22px;
    background: var(--kl-stage-light);
    list-style: none;
    --kl-cell-ink: #151924;
    --kl-cell-ink-2: #5d6779;
}

.klg-grid[data-surface='dark'] {
    background: var(--kl-stage-dark);
    --kl-cell-ink: #e8edf5;
    --kl-cell-ink-2: #a9b4c4;
}

.klg-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 18px 10px 14px;
    border-radius: 16px;
    text-align: center;
}

.klg-cell--reaction {
    outline: 1px dashed var(--kl-line);
    outline-offset: -1px;
}

.klg-name {
    margin-top: 6px;
    font-size: 14px;
    color: var(--kl-cell-ink, var(--kl-ink));
}

.klg-desc {
    font-size: 12px;
    line-height: 1.35;
    color: var(--kl-cell-ink-2, var(--kl-ink-3));
}

.klg-play {
    margin-top: 6px;
    min-height: 28px;
    font-size: 12px;
}
</style>
