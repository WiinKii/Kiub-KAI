<script setup lang="ts">
import { useId } from 'vue';
import {
    KAI_REACTIONS,
    KAI_STATES,
    REACTION_CATALOG,
    STATE_CATALOG,
} from '@/lib/kai/catalog';
import type { KaiReaction, KaiReducedMotion, KaiState } from '@/lib/kai/types';
import type { LabSettings } from './settings';
import { SEQUENCES } from './useKaiSequence';

defineProps<{
    state: KaiState;
    reaction: KaiReaction | null;
    settings: LabSettings;
    sequence: string | null;
    caption: string;
    progress: { index: number; total: number };
}>();

const emit = defineEmits<{
    setState: [state: KaiState];
    react: [reaction: KaiReaction];
    blink: [];
    runSequence: [id: string];
    stopSequence: [];
    update: [patch: Partial<LabSettings>];
}>();

const uid = useId();

const motionOptions: { value: KaiReducedMotion; label: string }[] = [
    { value: 'auto', label: 'Según el sistema' },
    { value: 'reduce', label: 'Reducido' },
    { value: 'no-preference', label: 'Completo' },
];

function onRange(key: 'intensity' | 'timeScale', event: Event) {
    emit('update', { [key]: Number((event.target as HTMLInputElement).value) });
}
</script>

<template>
    <div class="klc">
        <section class="klc-group" :aria-labelledby="`${uid}-states`">
            <h2 :id="`${uid}-states`" class="klc-title">
                Estados persistentes
            </h2>
            <p class="klc-hint">
                Se mantienen hasta que la interfaz los cambia.
            </p>
            <div class="klc-grid">
                <button
                    v-for="key in KAI_STATES"
                    :key="key"
                    type="button"
                    class="klc-chip"
                    :data-state="key"
                    :aria-pressed="state === key ? 'true' : 'false'"
                    @click="emit('setState', key)"
                >
                    {{ STATE_CATALOG[key].label }}
                </button>
            </div>
        </section>

        <section class="klc-group" :aria-labelledby="`${uid}-reactions`">
            <h2 :id="`${uid}-reactions`" class="klc-title">
                Reacciones temporales
            </h2>
            <p class="klc-hint">
                Gestos breves: vuelven solos al estado vigente.
            </p>
            <div class="klc-grid">
                <button
                    v-for="key in KAI_REACTIONS"
                    :key="key"
                    type="button"
                    class="klc-chip klc-chip--reaction"
                    :data-reaction="key"
                    :class="{ 'is-playing': reaction === key }"
                    @click="emit('react', key)"
                >
                    {{ REACTION_CATALOG[key].label }}
                </button>
                <button
                    type="button"
                    class="klc-chip klc-chip--reaction"
                    data-blink
                    @click="emit('blink')"
                >
                    Parpadear
                </button>
            </div>
        </section>

        <section class="klc-group" :aria-labelledby="`${uid}-sequences`">
            <h2 :id="`${uid}-sequences`" class="klc-title">Secuencias</h2>
            <p class="klc-hint">
                Los procesos son simulados: KAI no consulta ni envía nada.
            </p>
            <div class="klc-grid">
                <button
                    v-for="item in SEQUENCES"
                    :key="item.id"
                    type="button"
                    class="klc-chip"
                    :data-sequence="item.id"
                    :aria-pressed="sequence === item.id ? 'true' : 'false'"
                    @click="emit('runSequence', item.id)"
                >
                    {{ item.label }}
                </button>
                <button
                    type="button"
                    class="klc-chip"
                    data-sequence="stress"
                    :aria-pressed="sequence === 'stress' ? 'true' : 'false'"
                    @click="emit('runSequence', 'stress')"
                >
                    Prueba de interrupciones
                </button>
                <button
                    type="button"
                    class="klc-chip klc-chip--stop"
                    :disabled="!sequence"
                    @click="emit('stopSequence')"
                >
                    Detener
                </button>
            </div>
            <p v-if="sequence" class="klc-progress">
                Paso {{ progress.index }}/{{ progress.total }} · {{ caption }}
            </p>
        </section>

        <section class="klc-group" :aria-labelledby="`${uid}-motion`">
            <h2 :id="`${uid}-motion`" class="klc-title">Movimiento</h2>

            <div class="klc-row">
                <button
                    type="button"
                    class="klc-chip klc-chip--toggle"
                    data-pause
                    :aria-pressed="settings.paused ? 'true' : 'false'"
                    @click="emit('update', { paused: !settings.paused })"
                >
                    {{ settings.paused ? 'Reanudar' : 'Pausar' }}
                </button>
            </div>

            <fieldset class="klc-fieldset">
                <legend class="klc-legend">Movimiento reducido</legend>
                <div class="klc-segment">
                    <label
                        v-for="option in motionOptions"
                        :key="option.value"
                        class="klc-segment-item"
                    >
                        <input
                            type="radio"
                            :name="`${uid}-motion`"
                            :value="option.value"
                            :checked="settings.motion === option.value"
                            :data-motion="option.value"
                            @change="emit('update', { motion: option.value })"
                        />
                        <span>{{ option.label }}</span>
                    </label>
                </div>
            </fieldset>

            <div class="klc-range">
                <label :for="`${uid}-intensity`">Intensidad</label>
                <output :for="`${uid}-intensity`">
                    {{ Math.round(settings.intensity * 100) }} %
                </output>
                <input
                    :id="`${uid}-intensity`"
                    type="range"
                    min="0.2"
                    max="1.5"
                    step="0.05"
                    :value="settings.intensity"
                    @input="onRange('intensity', $event)"
                />
            </div>

            <div class="klc-range">
                <label :for="`${uid}-speed`">Velocidad</label>
                <output :for="`${uid}-speed`">
                    {{ settings.timeScale.toFixed(2) }}×
                </output>
                <input
                    :id="`${uid}-speed`"
                    type="range"
                    min="0.1"
                    max="2"
                    step="0.05"
                    :value="settings.timeScale"
                    @input="onRange('timeScale', $event)"
                />
            </div>

            <fieldset class="klc-fieldset">
                <legend class="klc-legend">Fondo del escenario</legend>
                <div class="klc-segment">
                    <label class="klc-segment-item">
                        <input
                            type="radio"
                            :name="`${uid}-surface`"
                            value="light"
                            :checked="settings.surface === 'light'"
                            @change="emit('update', { surface: 'light' })"
                        />
                        <span>Claro</span>
                    </label>
                    <label class="klc-segment-item">
                        <input
                            type="radio"
                            :name="`${uid}-surface`"
                            value="dark"
                            data-surface-dark
                            :checked="settings.surface === 'dark'"
                            @change="emit('update', { surface: 'dark' })"
                        />
                        <span>Oscuro</span>
                    </label>
                </div>
            </fieldset>

            <label class="klc-check">
                <input
                    type="checkbox"
                    :checked="settings.followPointer"
                    @change="
                        emit('update', {
                            followPointer: !settings.followPointer,
                        })
                    "
                />
                <span>Seguir el puntero dentro del escenario</span>
            </label>
            <label class="klc-check">
                <input
                    type="checkbox"
                    :checked="settings.debug"
                    data-debug
                    @change="emit('update', { debug: !settings.debug })"
                />
                <span>Guía de contorno (círculo en reposo y suelo)</span>
            </label>
        </section>
    </div>
</template>

<style scoped>
.klc {
    display: grid;
    gap: 22px;
}

.klc-group {
    display: grid;
    gap: 8px;
}

.klc-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--kl-ink);
}

.klc-hint {
    margin: -4px 0 4px;
    font-size: 13px;
    color: var(--kl-ink-3);
}

.klc-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.klc-row {
    display: flex;
    gap: 8px;
}

.klc-chip {
    min-height: 36px;
    padding: 0 14px;
    border: 1px solid var(--kl-line);
    border-radius: 999px;
    background: var(--kl-surface);
    color: var(--kl-ink);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
        background-color 0.2s,
        border-color 0.2s,
        color 0.2s,
        transform 0.2s var(--kl-spring);
}

.klc-chip:hover {
    border-color: var(--kl-blue);
}

.klc-chip:active {
    transform: scale(0.97);
}

.klc-chip[aria-pressed='true'],
.klc-chip.is-playing {
    border-color: var(--kl-blue-strong);
    background: var(--kl-blue-strong);
    color: #ffffff;
}

.klc-chip--reaction {
    border-style: dashed;
}

.klc-chip--stop:disabled {
    opacity: 0.45;
    cursor: default;
}

.klc-chip:focus-visible,
.klc-segment-item:focus-within,
.klc-check input:focus-visible,
.klc-range input:focus-visible {
    outline: 3px solid var(--kl-focus);
    outline-offset: 2px;
}

.klc-progress {
    margin: 2px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--kl-blue-text);
}

.klc-fieldset {
    margin: 4px 0 0;
    padding: 0;
    border: 0;
}

.klc-legend {
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--kl-ink-2);
}

.klc-segment {
    display: inline-flex;
    flex-wrap: wrap;
    padding: 3px;
    border-radius: 12px;
    background: var(--kl-surface-2);
    gap: 2px;
}

.klc-segment-item {
    position: relative;
    border-radius: 9px;
    cursor: pointer;
}

.klc-segment-item input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
}

.klc-segment-item span {
    display: block;
    padding: 6px 12px;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 600;
    color: var(--kl-ink-2);
    transition:
        background-color 0.2s,
        color 0.2s;
}

.klc-segment-item input:checked + span {
    background: var(--kl-surface);
    color: var(--kl-ink);
    box-shadow: 0 1px 3px rgba(21, 25, 36, 0.12);
}

.klc-range {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--kl-ink-2);
}

.klc-range output {
    font-variant-numeric: tabular-nums;
    color: var(--kl-ink);
}

.klc-range input {
    grid-column: 1 / -1;
    width: 100%;
    accent-color: var(--kl-blue-strong);
}

.klc-check {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: var(--kl-ink);
    cursor: pointer;
}

.klc-check input {
    width: 18px;
    height: 18px;
    accent-color: var(--kl-blue-strong);
}
</style>
