<script setup lang="ts">
/**
 * Laboratorio de KAI: pantalla de desarrollo para evaluar y ajustar el
 * personaje sin tocar la experiencia principal de Kiub.
 */
import { Head } from '@inertiajs/vue3';
import { useMediaQuery, usePreferredReducedMotion } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import KaiCharacter from '@/components/kai/KaiCharacter.vue';
import KaiHelpDemo from '@/components/kai/lab/KaiHelpDemo.vue';
import KaiLabControls from '@/components/kai/lab/KaiLabControls.vue';
import KaiLabGallery from '@/components/kai/lab/KaiLabGallery.vue';
import KaiLabSizes from '@/components/kai/lab/KaiLabSizes.vue';
import { DEFAULT_SETTINGS } from '@/components/kai/lab/settings';
import type { LabSettings } from '@/components/kai/lab/settings';
import {
    SEQUENCES,
    stressSequence,
    useKaiSequence,
} from '@/components/kai/lab/useKaiSequence';
import { REACTION_CATALOG, STATE_CATALOG } from '@/lib/kai/catalog';
import { activeTicks } from '@/lib/kai/ticker';
import type { KaiReaction, KaiReactionResult, KaiState } from '@/lib/kai/types';

defineOptions({
    layout: {
        // Ruta registrada solo en local (routes/dev.php).
        breadcrumbs: [{ title: 'Laboratorio KAI', href: '/dev/kai' }],
    },
});

const settings = reactive<LabSettings>({ ...DEFAULT_SETTINGS });
const state = ref<KaiState>('idle');
const reaction = ref<KaiReaction | null>(null);
const kai = ref<InstanceType<typeof KaiCharacter> | null>(null);
const sizes = ref<InstanceType<typeof KaiLabSizes> | null>(null);
const stage = ref<HTMLElement | null>(null);

const compact = useMediaQuery('(max-width: 640px)');
const systemMotion = usePreferredReducedMotion();
const reducedActive = computed(() =>
    settings.motion === 'auto'
        ? systemMotion.value === 'reduce'
        : settings.motion === 'reduce',
);

const sequence = useKaiSequence(() => kai.value);

function updateSettings(patch: Partial<LabSettings>) {
    Object.assign(settings, patch);

    if (patch.followPointer === false) {
        kai.value?.lookAt(null);
    }
}

/* ── Acciones manuales: detienen cualquier secuencia en curso ──────── */
function setState(next: KaiState) {
    sequence.stop();
    kai.value?.setState(next);
}

function react(name: KaiReaction) {
    sequence.stop();
    void kai.value?.react(name);
}

function blink() {
    kai.value?.blink();
    sizes.value?.blink();
}

function runSequence(id: string) {
    const found =
        id === 'stress' ? stressSequence() : SEQUENCES.find((s) => s.id === id);

    if (found) {
        void sequence.run(found);
    }
}

/* ── Registro de eventos del protagonista ──────────────────────────── */
type LogEntry = { id: number; time: string; text: string; tone: string };
const log = ref<LogEntry[]>([]);
const started = performance.now();
let logId = 0;

function addLog(text: string, tone = 'state') {
    const time = ((performance.now() - started) / 1000).toFixed(1);
    log.value = [{ id: ++logId, time, text, tone }, ...log.value].slice(0, 8);
}

function onStateChange({ from, to }: { from: KaiState; to: KaiState }) {
    addLog(`${STATE_CATALOG[from].label} → ${STATE_CATALOG[to].label}`);
}

function onReactionStart({ name }: { name: KaiReaction }) {
    reaction.value = name;
    sizes.value?.react(name);
    addLog(`Inicia: ${REACTION_CATALOG[name].label}`, 'reaction');
}

function onReactionEnd({ name, interrupted }: KaiReactionResult) {
    if (reaction.value === name) {
        reaction.value = null;
    }

    addLog(
        `${interrupted ? 'Interrumpida' : 'Termina'}: ${REACTION_CATALOG[name].label}`,
        interrupted ? 'interrupted' : 'reaction',
    );
}

/* ── Mirada: solo dentro del escenario ─────────────────────────────── */
let touchTimer: number | undefined;

function gazeFrom(event: PointerEvent) {
    const el = (kai.value?.$el as HTMLElement | undefined) ?? null;

    if (!el) {
        return null;
    }

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * (70 / 128);
    const reach = rect.width * 0.9;

    return { x: (event.clientX - cx) / reach, y: (event.clientY - cy) / reach };
}

function onStageMove(event: PointerEvent) {
    if (settings.followPointer && event.pointerType !== 'touch') {
        kai.value?.lookAt(gazeFrom(event));
    }
}

function onStageLeave() {
    if (settings.followPointer) {
        kai.value?.lookAt(null);
    }
}

function onStageDown(event: PointerEvent) {
    if (settings.followPointer && event.pointerType === 'touch') {
        kai.value?.lookAt(gazeFrom(event));
        window.clearTimeout(touchTimer);
        touchTimer = window.setTimeout(() => kai.value?.lookAt(null), 1200);
    }
}

/* ── Diagnóstico ───────────────────────────────────────────────────── */
const diagnostics = ref({ area: 1, ticks: 0, running: false });
const percent = new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});
const areaLabel = computed(() => percent.format(diagnostics.value.area));
let poll: number | undefined;

onMounted(() => {
    // El escenario empieza con el fondo del tema; luego se cambia a mano.
    if (document.documentElement.classList.contains('dark')) {
        settings.surface = 'dark';
    }

    poll = window.setInterval(() => {
        const info = kai.value?.inspect();
        diagnostics.value = {
            area: info?.area ?? 1,
            ticks: activeTicks(),
            running: info?.running ?? false,
        };
    }, 400);
});

onBeforeUnmount(() => {
    window.clearInterval(poll);
    window.clearTimeout(touchTimer);
});
</script>

<template>
    <Head title="Laboratorio KAI" />

    <div class="kl">
        <header class="kl-header">
            <div>
                <p class="kl-badge">
                    Solo desarrollo · no visible para colaboradores
                </p>
                <h1 class="kl-title">Laboratorio de KAI</h1>
                <p class="kl-lead">
                    La presencia viva de Kiub. Prueba estados, transiciones e
                    interrupciones antes de llevar a KAI a la experiencia
                    principal.
                </p>
            </div>
        </header>

        <div class="kl-main">
            <div class="kl-stage-col">
                <div
                    ref="stage"
                    class="kl-stage"
                    data-stage
                    :data-surface="settings.surface"
                    @pointermove="onStageMove"
                    @pointerleave="onStageLeave"
                    @pointerdown="onStageDown"
                >
                    <div class="kl-stage-label">
                        <span class="kl-stage-state">{{
                            STATE_CATALOG[state].label
                        }}</span>
                        <span v-if="reaction" class="kl-stage-reaction">
                            {{ REACTION_CATALOG[reaction].label }}
                        </span>
                    </div>
                    <p v-if="sequence.running.value" class="kl-stage-caption">
                        {{ sequence.caption.value }}
                    </p>
                    <span v-if="reducedActive" class="kl-stage-flag"
                        >Movimiento reducido</span
                    >
                    <span
                        v-if="settings.paused"
                        class="kl-stage-flag kl-stage-flag--pause"
                        >En pausa</span
                    >

                    <KaiCharacter
                        ref="kai"
                        v-model:state="state"
                        data-main
                        class="kl-hero"
                        :size="compact ? 200 : 260"
                        :surface="settings.surface"
                        :paused="settings.paused"
                        :reduced-motion="settings.motion"
                        :intensity="settings.intensity"
                        :time-scale="settings.timeScale"
                        :debug="settings.debug"
                        @state-change="onStateChange"
                        @reaction-start="onReactionStart"
                        @reaction-end="onReactionEnd"
                    />
                </div>

                <dl class="kl-diag">
                    <div>
                        <dt>Área frente al reposo</dt>
                        <dd data-area>
                            {{ areaLabel }}
                        </dd>
                    </div>
                    <div>
                        <dt>Instancias animándose</dt>
                        <dd data-ticks>{{ diagnostics.ticks }}</dd>
                    </div>
                    <div>
                        <dt>Protagonista</dt>
                        <dd>
                            {{
                                diagnostics.running
                                    ? 'En movimiento'
                                    : 'Detenido'
                            }}
                        </dd>
                    </div>
                </dl>

                <section class="kl-log" aria-labelledby="kl-log-title">
                    <h2 id="kl-log-title" class="kl-log-title">Eventos</h2>
                    <ol v-if="log.length" class="kl-log-list">
                        <li
                            v-for="entry in log"
                            :key="entry.id"
                            :class="`is-${entry.tone}`"
                        >
                            <span class="kl-log-time">{{ entry.time }} s</span>
                            {{ entry.text }}
                        </li>
                    </ol>
                    <p v-else class="kl-log-empty">
                        Aquí aparecen los cambios de estado y los gestos con su
                        final (completado o interrumpido).
                    </p>
                </section>
            </div>

            <aside class="kl-panel" aria-label="Controles del laboratorio">
                <KaiLabControls
                    :state="state"
                    :reaction="reaction"
                    :settings="settings"
                    :sequence="sequence.running.value"
                    :caption="sequence.caption.value"
                    :progress="sequence.progress.value"
                    @set-state="setState"
                    @react="react"
                    @blink="blink"
                    @run-sequence="runSequence"
                    @stop-sequence="sequence.stop"
                    @update="updateSettings"
                />
            </aside>
        </div>

        <KaiLabGallery class="kl-section" :settings="settings" />
        <KaiLabSizes
            ref="sizes"
            class="kl-section"
            :state="state"
            :settings="settings"
        />
        <KaiHelpDemo class="kl-section" :settings="settings" />

        <section class="kl-section kl-notes" aria-labelledby="kl-notes-title">
            <h2 id="kl-notes-title" class="kl-notes-title">
                Uso en una pantalla
            </h2>
            <pre
                class="kl-code"
            ><code>&lt;KaiCharacter ref="kai" v-model:state="estado" size="sm" /&gt;

// Persistente: se mantiene hasta que lo cambies.
estado.value = 'waiting';
// Gesto temporal: vuelve solo al estado vigente.
await kai.value.react('success', { next: 'idle' });
// Operación real: trabaja mientras la promesa está pendiente.
await kai.value.track(guardarSolicitud(datos), { failure: 'error' });</code></pre>
        </section>
    </div>
</template>

<style scoped>
.kl {
    --kl-ink: #151924;
    --kl-ink-2: #3f4859;
    --kl-ink-3: #5d6779;
    --kl-blue: #5c9dff;
    --kl-blue-strong: #2f6ee0;
    --kl-blue-text: #2559c2;
    --kl-mist: #a9c1d3;
    --kl-surface: #ffffff;
    --kl-surface-2: #f2f5f9;
    --kl-line: #dde4ec;
    --kl-stage-light: #f4f7fb;
    --kl-stage-dark: #151924;
    --kl-focus: #5c9dff;
    --kl-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 40px;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 28px 24px 64px;
    font-family:
        Raleway, 'Raleway Variable', var(--font-sans, ui-sans-serif), sans-serif;
    color: var(--kl-ink);
}

:root.dark .kl {
    --kl-ink: #e8edf5;
    --kl-ink-2: #c1c9d6;
    --kl-ink-3: #9aa5b6;
    --kl-blue-strong: #3d7be6;
    --kl-blue-text: #8db8ff;
    --kl-surface: #121722;
    --kl-surface-2: #0c1018;
    --kl-line: #252e3d;
    --kl-stage-light: #e9eef5;
    --kl-stage-dark: #0c1018;
}

.kl > *,
.kl-main > * {
    min-width: 0;
}

.kl-badge {
    display: inline-block;
    margin: 0 0 10px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--kl-surface-2);
    color: var(--kl-ink-2);
    font-size: 12px;
    font-weight: 700;
}

.kl-title {
    margin: 0;
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 700;
    letter-spacing: -0.01em;
}

.kl-lead {
    margin: 8px 0 0;
    max-width: 62ch;
    font-size: 16px;
    line-height: 1.5;
    color: var(--kl-ink-3);
}

.kl-main {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(300px, 1fr);
    gap: 28px;
    align-items: start;
}

.kl-stage-col {
    display: grid;
    gap: 14px;
}

.kl-stage {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    min-height: 460px;
    padding: 150px 24px 48px;
    border-radius: 28px;
    background:
        radial-gradient(
            120% 80% at 50% 100%,
            rgba(92, 157, 255, 0.12),
            transparent 60%
        ),
        var(--kl-stage-light);
    color: #151924;
    overflow: hidden;
    touch-action: pan-y;
}

.kl-stage[data-surface='dark'] {
    background:
        radial-gradient(
            120% 80% at 50% 100%,
            rgba(92, 157, 255, 0.16),
            transparent 60%
        ),
        var(--kl-stage-dark);
    color: #e8edf5;
}

.kl-stage-label {
    position: absolute;
    top: 20px;
    left: 22px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.kl-stage-state {
    font-size: 20px;
    font-weight: 700;
}

.kl-stage-reaction {
    padding: 3px 10px;
    border: 1px dashed currentColor;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
}

.kl-stage-caption {
    position: absolute;
    top: 54px;
    left: 22px;
    margin: 0;
    font-size: 14px;
    opacity: 0.8;
}

.kl-stage-flag {
    position: absolute;
    top: 20px;
    right: 20px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(169, 193, 211, 0.3);
    font-size: 12px;
    font-weight: 700;
}

.kl-stage-flag--pause {
    top: 52px;
}

.kl-diag {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 0;
}

.kl-diag div {
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--kl-surface-2);
}

.kl-diag dt {
    font-size: 12px;
    color: var(--kl-ink-3);
}

.kl-diag dd {
    margin: 2px 0 0;
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.kl-log {
    padding: 14px 16px;
    border: 1px solid var(--kl-line);
    border-radius: 18px;
}

.kl-log-title {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
}

.kl-log-list {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
}

.kl-log-list li.is-reaction {
    color: var(--kl-blue-text);
}

.kl-log-list li.is-interrupted {
    color: var(--kl-ink-3);
    font-style: italic;
}

.kl-log-time {
    display: inline-block;
    min-width: 54px;
    color: var(--kl-ink-3);
    font-variant-numeric: tabular-nums;
}

.kl-log-empty {
    margin: 0;
    font-size: 13px;
    color: var(--kl-ink-3);
}

.kl-panel {
    position: sticky;
    top: 96px;
    padding: 22px;
    border: 1px solid var(--kl-line);
    border-radius: 24px;
    background: var(--kl-surface);
}

.kl-notes-title {
    margin: 0 0 10px;
    font-size: 18px;
    font-weight: 700;
}

.kl-code {
    margin: 0;
    padding: 16px 18px;
    border-radius: 16px;
    background: var(--kl-stage-dark);
    color: #dce6f5;
    font-size: 13px;
    line-height: 1.6;
    overflow-x: auto;
}

@media (max-width: 1023.98px) {
    .kl-main {
        grid-template-columns: 1fr;
    }

    .kl-panel {
        position: static;
    }
}

@media (max-width: 640px) {
    .kl {
        padding: 20px 16px 48px;
    }

    .kl-stage {
        min-height: 380px;
        padding-top: 130px;
    }

    .kl-diag {
        grid-template-columns: 1fr 1fr;
    }
}
</style>
