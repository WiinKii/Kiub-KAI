<script setup lang="ts">
/**
 * Demostración contextual: KAI como acceso de ayuda dentro de un módulo.
 * Todo es simulado; los textos lo dicen explícitamente y KAI nunca afirma
 * haber enviado o consultado algo.
 */
import { nextTick, onBeforeUnmount, ref, useId } from 'vue';
import KaiCharacter from '@/components/kai/KaiCharacter.vue';
import type { KaiController, KaiState } from '@/lib/kai/types';
import type { LabSettings } from './settings';

defineProps<{ settings: LabSettings }>();

const uid = useId();
const kai = ref<KaiController | null>(null);
const kaiState = ref<KaiState>('idle');
const trigger = ref<HTMLButtonElement | null>(null);
const panelTitle = ref<HTMLElement | null>(null);
const fields = ref<(HTMLElement | null)[]>([]);

const steps = [
    'Indica la fecha de inicio y la de fin de tus vacaciones.',
    'Si quieres, añade un comentario para tu responsable.',
    'Revisa los datos y pulsa «Enviar solicitud». Te mostraré el resultado cuando el sistema responda.',
];

const open = ref(false);
const step = ref(0);
const finished = ref(false);
const simulateFailure = ref(false);
const sending = ref(false);
const status = ref<{ tone: 'info' | 'ok' | 'error'; text: string } | null>(
    null,
);
let simulation: number | undefined;

function setField(index: number) {
    return (el: unknown) => {
        fields.value[index] = el instanceof HTMLElement ? el : null;
    };
}

/** KAI mira hacia el campo del paso actual. */
function lookAtStep() {
    const from = trigger.value?.getBoundingClientRect();
    const to = fields.value[step.value]?.getBoundingClientRect();

    if (!from || !to) {
        return;
    }

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const length = Math.hypot(dx, dy) || 1;
    kai.value?.lookAt({ x: (dx / length) * 0.9, y: (dy / length) * 0.9 });
}

async function openPanel() {
    open.value = true;
    finished.value = false;
    step.value = 0;
    await nextTick();
    panelTitle.value?.focus();
    await kai.value?.react('welcome', { next: 'attentive' });

    if (open.value) {
        lookAtStep();
    }
}

function closePanel() {
    open.value = false;
    kai.value?.lookAt(null);
    kai.value?.setState('idle');
    trigger.value?.focus();
}

function toggle() {
    if (open.value) {
        closePanel();
    } else {
        void openPanel();
    }
}

function go(delta: number) {
    const next = step.value + delta;

    if (next >= steps.length) {
        finished.value = true;
        kai.value?.lookAt(null);
        void kai.value?.react('success', { next: 'idle' });

        return;
    }

    step.value = Math.max(0, next);
    kai.value?.setState('attentive');
    lookAtStep();
}

async function submit() {
    if (sending.value) {
        return;
    }

    sending.value = true;
    status.value = { tone: 'info', text: 'Enviando… (simulación)' };
    kai.value?.lookAt(null);

    const fail = simulateFailure.value;
    const simulated = new Promise<void>((resolve, reject) => {
        simulation = window.setTimeout(
            () => (fail ? reject(new Error('Fallo simulado')) : resolve()),
            1800,
        );
    });

    try {
        await kai.value?.track(simulated, { next: 'idle' });
        status.value = {
            tone: 'ok',
            text: 'Simulación completada. No se ha enviado ninguna solicitud real.',
        };
    } catch {
        status.value = {
            tone: 'error',
            text: 'No se pudo completar el envío (simulación). Puedes intentarlo de nuevo.',
        };
    } finally {
        sending.value = false;
    }
}

function retry() {
    simulateFailure.value = false;
    void submit();
}

function onHover(active: boolean) {
    if (!open.value && !sending.value && kaiState.value !== 'error') {
        kai.value?.setState(active ? 'attentive' : 'idle');
    }
}

onBeforeUnmount(() => window.clearTimeout(simulation));
</script>

<template>
    <section class="khd" :aria-labelledby="`${uid}-title`">
        <h2 :id="`${uid}-title`" class="khd-title">
            Demostración contextual: acceso de ayuda
        </h2>
        <p class="khd-hint">
            Un módulo de ejemplo con KAI como acceso de ayuda. Es una
            simulación: no se consulta ni se envía ningún dato.
        </p>

        <div class="khd-card">
            <div class="khd-head">
                <div>
                    <span class="khd-eyebrow">Recursos Humanos · ejemplo</span>
                    <h3 class="khd-card-title">Solicitud de vacaciones</h3>
                </div>
                <button
                    ref="trigger"
                    type="button"
                    class="khd-help"
                    data-help
                    :aria-expanded="open ? 'true' : 'false'"
                    :aria-controls="`${uid}-panel`"
                    @click="toggle"
                    @pointerenter="onHover(true)"
                    @pointerleave="onHover(false)"
                    @focus="onHover(true)"
                    @blur="onHover(false)"
                >
                    <KaiCharacter
                        ref="kai"
                        v-model:state="kaiState"
                        :size="44"
                        :paused="settings.paused"
                        :reduced-motion="settings.motion"
                        :intensity="settings.intensity"
                        :time-scale="settings.timeScale"
                        :colors="settings.colors"
                        :mouth="settings.mouth"
                        :blush="settings.blush"
                        :ambient="settings.ambient"
                    />
                    <span class="khd-help-text">Ayuda</span>
                </button>
            </div>

            <div
                v-if="open"
                :id="`${uid}-panel`"
                class="khd-panel"
                role="region"
                :aria-labelledby="`${uid}-panel-title`"
                @keydown.esc="closePanel"
            >
                <h4
                    :id="`${uid}-panel-title`"
                    ref="panelTitle"
                    class="khd-panel-title"
                    tabindex="-1"
                >
                    KAI · Guía rápida
                </h4>
                <template v-if="!finished">
                    <p class="khd-step-count">
                        Paso {{ step + 1 }} de {{ steps.length }}
                    </p>
                    <p class="khd-step">{{ steps[step] }}</p>
                    <div class="khd-panel-actions">
                        <button
                            type="button"
                            class="khd-btn"
                            :disabled="step === 0"
                            @click="go(-1)"
                        >
                            Anterior
                        </button>
                        <button
                            type="button"
                            class="khd-btn khd-btn--primary"
                            @click="go(1)"
                        >
                            {{
                                step === steps.length - 1
                                    ? 'Entendido'
                                    : 'Siguiente'
                            }}
                        </button>
                    </div>
                </template>
                <template v-else>
                    <p class="khd-step">
                        ¡Listo! Ya conoces el recorrido. Puedes volver a abrir
                        esta guía cuando quieras.
                    </p>
                    <div class="khd-panel-actions">
                        <button
                            type="button"
                            class="khd-btn"
                            @click="closePanel"
                        >
                            Cerrar guía
                        </button>
                    </div>
                </template>
            </div>

            <form class="khd-form" @submit.prevent="submit">
                <div
                    :ref="setField(0)"
                    class="khd-field khd-field--dates"
                    :class="{ 'is-guided': open && !finished && step === 0 }"
                >
                    <label class="khd-label">
                        Desde
                        <input type="date" class="khd-input" />
                    </label>
                    <label class="khd-label">
                        Hasta
                        <input type="date" class="khd-input" />
                    </label>
                </div>
                <div
                    :ref="setField(1)"
                    class="khd-field"
                    :class="{ 'is-guided': open && !finished && step === 1 }"
                >
                    <label class="khd-label">
                        Comentario (opcional)
                        <textarea class="khd-input" rows="2" />
                    </label>
                </div>
                <div
                    :ref="setField(2)"
                    class="khd-field khd-actions"
                    :class="{ 'is-guided': open && !finished && step === 2 }"
                >
                    <label class="khd-check">
                        <input
                            v-model="simulateFailure"
                            type="checkbox"
                            data-fail
                        />
                        Simular un fallo de envío
                    </label>
                    <button
                        type="submit"
                        class="khd-btn khd-btn--primary"
                        data-submit
                        :disabled="sending"
                    >
                        Enviar solicitud (demo)
                    </button>
                </div>

                <div class="khd-status" role="status">
                    <p v-if="status" :class="`is-${status.tone}`">
                        {{ status.text }}
                        <button
                            v-if="status.tone === 'error'"
                            type="button"
                            class="khd-link"
                            @click="retry"
                        >
                            Reintentar
                        </button>
                    </p>
                </div>
            </form>
        </div>
    </section>
</template>

<style scoped>
.khd {
    display: grid;
    gap: 12px;
}

.khd-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--kl-ink);
}

.khd-hint {
    margin: -6px 0 0;
    max-width: 60ch;
    font-size: 14px;
    color: var(--kl-ink-3);
}

.khd-card {
    position: relative;
    display: grid;
    gap: 18px;
    max-width: 640px;
    padding: 22px;
    border: 1px solid var(--kl-line);
    border-radius: 22px;
    background: var(--kl-surface);
    box-shadow: 0 14px 34px -22px rgba(21, 25, 36, 0.35);
}

.khd-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.khd-eyebrow {
    font-size: 12px;
    font-weight: 600;
    color: var(--kl-ink-3);
}

.khd-card-title {
    margin: 2px 0 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--kl-ink);
}

.khd-help {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 14px 4px 6px;
    border: 1px solid var(--kl-line);
    border-radius: 999px;
    background: var(--kl-surface-2);
    color: var(--kl-ink);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
        border-color 0.2s,
        box-shadow 0.3s;
}

.khd-help:hover,
.khd-help[aria-expanded='true'] {
    border-color: var(--kl-blue);
    box-shadow: 0 6px 18px -10px rgba(92, 157, 255, 0.8);
}

.khd-help:focus-visible,
.khd-btn:focus-visible,
.khd-link:focus-visible,
.khd-panel-title:focus-visible,
.khd-input:focus-visible,
.khd-check input:focus-visible {
    outline: 3px solid var(--kl-focus);
    outline-offset: 2px;
}

/* Se despliega en el flujo: nunca tapa el campo que está explicando. */
.khd-panel {
    justify-self: end;
    width: min(360px, 100%);
    padding: 16px;
    border: 1px solid var(--kl-line);
    border-radius: 18px;
    background: var(--kl-surface);
    box-shadow: 0 22px 44px -18px rgba(21, 25, 36, 0.4);
    animation: khd-in 0.35s cubic-bezier(0.22, 1, 0.36, 1);
    transform-origin: top right;
}

.khd-panel-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--kl-blue-text);
}

.khd-step-count {
    margin: 8px 0 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--kl-ink-3);
}

.khd-step {
    margin: 4px 0 0;
    font-size: 15px;
    line-height: 1.45;
    color: var(--kl-ink);
}

.khd-panel-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
}

.khd-form {
    display: grid;
    gap: 14px;
}

.khd-field {
    padding: 8px;
    margin: -8px;
    border-radius: 14px;
    transition:
        background-color 0.3s,
        box-shadow 0.3s;
}

.khd-field.is-guided {
    background: rgba(92, 157, 255, 0.1);
    box-shadow: 0 0 0 2px var(--kl-blue);
}

.khd-field--dates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

.khd-label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--kl-ink-2);
}

.khd-input {
    width: 100%;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid var(--kl-line);
    border-radius: 12px;
    background: var(--kl-surface-2);
    color: var(--kl-ink);
    font: inherit;
    font-size: 14px;
    resize: vertical;
}

.khd-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.khd-check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--kl-ink-2);
}

.khd-check input {
    width: 18px;
    height: 18px;
    accent-color: var(--kl-blue-strong);
}

.khd-btn {
    min-height: 38px;
    padding: 0 16px;
    border: 1px solid var(--kl-line);
    border-radius: 12px;
    background: var(--kl-surface);
    color: var(--kl-ink);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
}

.khd-btn:disabled {
    opacity: 0.5;
    cursor: default;
}

.khd-btn--primary {
    border-color: var(--kl-blue-strong);
    background: var(--kl-blue-strong);
    color: #ffffff;
}

.khd-status {
    min-height: 22px;
}

.khd-status p {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
}

.khd-status .is-info {
    color: var(--kl-ink-2);
}

.khd-status .is-ok {
    color: var(--kl-blue-text);
}

.khd-status .is-error {
    color: var(--kl-ink);
}

.khd-link {
    margin-left: 6px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--kl-blue-text);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
}

@media (max-width: 560px) {
    .khd-panel {
        width: auto;
    }

    .khd-field--dates {
        grid-template-columns: 1fr;
    }
}

@media (prefers-reduced-motion: reduce) {
    .khd-panel {
        animation: none;
    }
}

@keyframes khd-in {
    from {
        opacity: 0;
        transform: translateY(-6px) scale(0.97);
    }
}
</style>
