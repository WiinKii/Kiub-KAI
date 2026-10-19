<script setup lang="ts">
import { useId } from 'vue';
import {
    EMERGE_PHASE_LABELS,
    EMERGE_STEPS,
    KAI_REACTIONS,
    REACTION_CATALOG,
    STATE_CATALOG,
    STATE_GROUPS,
} from '@/lib/kai/catalog';
import { KAI_DEFAULT_COLORS, KAI_PRESETS, isHexColor } from '@/lib/kai/palette';
import type { KaiColors } from '@/lib/kai/palette';
import type {
    KaiDockSize,
    KaiEmergePhase,
    KaiReaction,
    KaiReducedMotion,
    KaiState,
} from '@/lib/kai/types';
import type { LabSettings } from './settings';
import { SEQUENCES } from './useKaiSequence';

const props = defineProps<{
    state: KaiState;
    reaction: KaiReaction | null;
    settings: LabSettings;
    sequence: string | null;
    caption: string;
    progress: { index: number; total: number };
    /** Fase de la aparición del protagonista, o null. */
    emergePhase: KaiEmergePhase | null;
}>();

const emit = defineEmits<{
    setState: [state: KaiState];
    react: [reaction: KaiReaction];
    blink: [];
    runSequence: [id: string];
    stopSequence: [];
    update: [patch: Partial<LabSettings>];
    emerge: [mode: 'play' | 'restart'];
}>();

/** Estado de cada paso del indicador: hecho, en curso o pendiente. */
function stepState(step: KaiEmergePhase): 'done' | 'active' | 'pending' {
    const current = props.emergePhase;

    if (!current || current === 'gentle') {
        return 'pending';
    }

    const at = EMERGE_STEPS.indexOf(current);
    const index = EMERGE_STEPS.indexOf(step);

    return index < at ? 'done' : index === at ? 'active' : 'pending';
}

const uid = useId();

const motionOptions: { value: KaiReducedMotion; label: string }[] = [
    { value: 'auto', label: 'Según el sistema' },
    { value: 'reduce', label: 'Reducido' },
    { value: 'no-preference', label: 'Completo' },
];

const sleepOptions: { value: number; label: string }[] = [
    { value: 0, label: 'Nunca' },
    { value: 30, label: '30 s' },
    { value: 120, label: '2 min' },
];

const dockSizes: { value: KaiDockSize; label: string }[] = [
    { value: 'mini', label: 'Mínimo' },
    { value: 'normal', label: 'Normal' },
    { value: 'grande', label: 'Grande' },
];

const colorFields: { key: keyof KaiColors; label: string }[] = [
    { key: 'primary', label: 'Principal' },
    { key: 'secondary', label: 'Secundario' },
    { key: 'accent', label: 'Acento' },
    { key: 'blush', label: 'Rubor' },
];

function onRange(key: 'intensity' | 'timeScale', event: Event) {
    emit('update', { [key]: Number((event.target as HTMLInputElement).value) });
}

function setColor(key: keyof KaiColors, value: string) {
    if (isHexColor(value)) {
        emit('update', { colors: { ...props.settings.colors, [key]: value } });
    }
}

function isDefaultColors(): boolean {
    return (Object.keys(KAI_DEFAULT_COLORS) as (keyof KaiColors)[]).every(
        (key) =>
            props.settings.colors[key].toLowerCase() ===
            KAI_DEFAULT_COLORS[key].toLowerCase(),
    );
}
</script>

<template>
    <div class="klc">
        <section
            class="klc-group"
            :aria-labelledby="`${uid}-emerge`"
            data-emerge-section
        >
            <h2 :id="`${uid}-emerge`" class="klc-title">Aparición</h2>
            <p class="klc-hint">
                «Convergencia: KAI cobra vida». Solo en el protagonista; usa la
                pausa, la velocidad, la intensidad, el fondo y el movimiento de
                este panel.
            </p>
            <div class="klc-grid">
                <button
                    type="button"
                    class="klc-chip"
                    data-emerge-play
                    :disabled="emergePhase !== null"
                    @click="emit('emerge', 'play')"
                >
                    {{
                        emergePhase ? 'Reproduciendo…' : 'Reproducir aparición'
                    }}
                </button>
                <button
                    type="button"
                    class="klc-chip"
                    data-emerge-restart
                    @click="emit('emerge', 'restart')"
                >
                    Reiniciar
                </button>
            </div>
            <ol class="klc-phases" aria-hidden="true">
                <li
                    v-for="step in EMERGE_STEPS"
                    :key="step"
                    :data-step="stepState(step)"
                >
                    {{ EMERGE_PHASE_LABELS[step] }}
                </li>
            </ol>
            <p class="klc-progress" role="status" data-emerge-phase>
                {{
                    emergePhase
                        ? `Fase: ${EMERGE_PHASE_LABELS[emergePhase]}`
                        : 'Sin reproducir'
                }}
            </p>
            <label class="klc-check">
                <input
                    type="checkbox"
                    data-emerge-slow
                    :checked="settings.emergeSlow"
                    @change="
                        emit('update', { emergeSlow: !settings.emergeSlow })
                    "
                />
                <span>Reproducción lenta (×0,25) para revisar la fusión</span>
            </label>
        </section>

        <section class="klc-group" :aria-labelledby="`${uid}-states`">
            <h2 :id="`${uid}-states`" class="klc-title">
                Estados persistentes
            </h2>
            <p class="klc-hint">
                Se mantienen hasta que la interfaz los cambia.
            </p>
            <template v-for="group in STATE_GROUPS" :key="group.label">
                <p class="klc-subtitle">{{ group.label }}</p>
                <div class="klc-grid">
                    <button
                        v-for="key in group.states"
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
            </template>
        </section>

        <section class="klc-group" :aria-labelledby="`${uid}-reactions`">
            <h2 :id="`${uid}-reactions`" class="klc-title">
                Reacciones y animaciones
            </h2>
            <p class="klc-hint">
                Gestos temporales: vuelven solos al estado vigente.
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

        <section class="klc-group" :aria-labelledby="`${uid}-look`">
            <h2 :id="`${uid}-look`" class="klc-title">Apariencia</h2>
            <label class="klc-check">
                <input
                    type="checkbox"
                    data-mouth
                    :checked="settings.mouth"
                    @change="emit('update', { mouth: !settings.mouth })"
                />
                <span>Boca (prueba)</span>
            </label>
            <label class="klc-check">
                <input
                    type="checkbox"
                    :checked="settings.blush"
                    @change="emit('update', { blush: !settings.blush })"
                />
                <span>Rubor en las emociones</span>
            </label>
            <label class="klc-check">
                <input
                    type="checkbox"
                    :checked="settings.ambient"
                    @change="emit('update', { ambient: !settings.ambient })"
                />
                <span>Lóbulos y motas de ambiente</span>
            </label>

            <fieldset class="klc-fieldset">
                <legend class="klc-legend">Color de KAI</legend>
                <div class="klc-colors">
                    <label
                        v-for="field in colorFields"
                        :key="field.key"
                        class="klc-color"
                    >
                        <input
                            type="color"
                            :data-color="field.key"
                            :value="settings.colors[field.key]"
                            @input="
                                setColor(
                                    field.key,
                                    ($event.target as HTMLInputElement).value,
                                )
                            "
                        />
                        <span>{{ field.label }}</span>
                        <code>{{ settings.colors[field.key] }}</code>
                    </label>
                </div>
                <div class="klc-grid klc-presets">
                    <button
                        v-for="preset in KAI_PRESETS.slice(1)"
                        :key="preset.id"
                        type="button"
                        class="klc-chip klc-chip--small"
                        @click="
                            emit('update', { colors: { ...preset.colors } })
                        "
                    >
                        <span class="klc-swatch" aria-hidden="true">
                            <i :style="{ background: preset.colors.primary }" />
                            <i :style="{ background: preset.colors.accent }" />
                        </span>
                        {{ preset.label }}
                    </button>
                </div>
                <button
                    type="button"
                    class="klc-chip klc-reset"
                    data-reset-colors
                    :disabled="isDefaultColors()"
                    @click="
                        emit('update', { colors: { ...KAI_DEFAULT_COLORS } })
                    "
                >
                    Reiniciar color original
                </button>
            </fieldset>
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
                <output :for="`${uid}-intensity`"
                    >{{ Math.round(settings.intensity * 100) }} %</output
                >
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
                <output :for="`${uid}-speed`"
                    >{{ settings.timeScale.toFixed(2) }}×</output
                >
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

        <section class="klc-group" :aria-labelledby="`${uid}-dock`">
            <h2 :id="`${uid}-dock`" class="klc-title">KAI flotante</h2>
            <p class="klc-hint">
                Abajo a la derecha, como estará en la intranet.
            </p>
            <label class="klc-check">
                <input
                    type="checkbox"
                    data-dock
                    :checked="settings.dock"
                    @change="emit('update', { dock: !settings.dock })"
                />
                <span>Mostrar en esta página</span>
            </label>
            <fieldset class="klc-fieldset" :disabled="!settings.dock">
                <legend class="klc-legend">Tamaño</legend>
                <div class="klc-segment">
                    <label
                        v-for="option in dockSizes"
                        :key="option.value"
                        class="klc-segment-item"
                    >
                        <input
                            type="radio"
                            :name="`${uid}-dock-size`"
                            :value="option.value"
                            :data-dock-size="option.value"
                            :checked="settings.dockSize === option.value"
                            @change="emit('update', { dockSize: option.value })"
                        />
                        <span>{{ option.label }}</span>
                    </label>
                </div>
            </fieldset>
            <label class="klc-check">
                <input
                    type="checkbox"
                    :checked="settings.overscroll"
                    :disabled="!settings.dock"
                    @change="
                        emit('update', { overscroll: !settings.overscroll })
                    "
                />
                <span>Estirarse al final del scroll</span>
            </label>
            <fieldset class="klc-fieldset" :disabled="!settings.dock">
                <legend class="klc-legend">Dormir tras inactividad</legend>
                <div class="klc-segment">
                    <label
                        v-for="option in sleepOptions"
                        :key="option.value"
                        class="klc-segment-item"
                    >
                        <input
                            type="radio"
                            :name="`${uid}-dock-sleep`"
                            :value="option.value"
                            :data-dock-sleep="option.value"
                            :checked="settings.dockSleep === option.value"
                            @change="
                                emit('update', { dockSleep: option.value })
                            "
                        />
                        <span>{{ option.label }}</span>
                    </label>
                </div>
            </fieldset>
            <p class="klc-hint">
                Al volver a mover el ratón o desplazarte, despierta con un
                bostezo. Al hacer scroll se mece y mira el contenido.
            </p>
        </section>

        <section class="klc-group" :aria-labelledby="`${uid}-games`">
            <h2 :id="`${uid}-games`" class="klc-title">Juegos</h2>
            <label class="klc-check">
                <input
                    type="checkbox"
                    :checked="settings.playful"
                    @change="emit('update', { playful: !settings.playful })"
                />
                <span>Activar juegos</span>
            </label>
            <ul class="klc-tips">
                <li>
                    Da unas vueltas rápidas con el cursor alrededor de KAI: se
                    marea.
                </li>
                <li>Púlsalo para hacerle cosquillas.</li>
                <li>
                    Llega al final de la página y sigue desplazando: KAI se
                    estira.
                </li>
            </ul>
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

.klc-subtitle {
    margin: 4px 0 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--kl-ink-3);
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
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

.klc-chip--small {
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
}

.klc-chip:hover:not(:disabled) {
    border-color: var(--kl-blue);
}

.klc-chip:active:not(:disabled) {
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

.klc-chip:disabled {
    opacity: 0.45;
    cursor: default;
}

.klc-chip:focus-visible,
.klc-segment-item:focus-within,
.klc-check input:focus-visible,
.klc-range input:focus-visible,
.klc-color:focus-within {
    outline: 3px solid var(--kl-focus);
    outline-offset: 2px;
}

.klc-phases {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
}

.klc-phases li {
    position: relative;
    flex: 1 1 auto;
    padding: 4px 8px 4px 8px;
    border-radius: 999px;
    background: var(--kl-surface-2);
    color: var(--kl-ink-3);
    font-size: 11.5px;
    font-weight: 600;
    text-align: center;
    transition:
        background 0.25s,
        color 0.25s;
}

.klc-phases li[data-step='done'] {
    background: rgba(92, 157, 255, 0.16);
    color: var(--kl-blue-text);
}

.klc-phases li[data-step='active'] {
    background: var(--kl-blue);
    color: #ffffff;
}

.klc-progress {
    margin: 2px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--kl-blue-text);
}

.klc-fieldset {
    display: grid;
    gap: 8px;
    margin: 4px 0 0;
    padding: 0;
    border: 0;
}

.klc-fieldset:disabled {
    opacity: 0.5;
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
    justify-self: start;
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

.klc-colors {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.klc-color {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    align-items: center;
    gap: 0 10px;
    padding: 8px 10px;
    border: 1px solid var(--kl-line);
    border-radius: 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--kl-ink);
    cursor: pointer;
}

.klc-color input {
    grid-row: 1 / 3;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: none;
    cursor: pointer;
}

.klc-color code {
    font-size: 12px;
    font-weight: 500;
    color: var(--kl-ink-3);
}

.klc-presets {
    margin-top: 2px;
}

.klc-swatch {
    display: inline-flex;
}

.klc-swatch i {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    border: 1.5px solid var(--kl-surface);
}

.klc-swatch i + i {
    margin-left: -4px;
}

.klc-reset {
    justify-self: start;
}

.klc-tips {
    display: grid;
    gap: 4px;
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    color: var(--kl-ink-2);
}
</style>
