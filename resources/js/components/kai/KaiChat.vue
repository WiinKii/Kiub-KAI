<script setup lang="ts">
/**
 * Chat guiado de KAI (sin IA).
 *
 * Saluda según la sección de la intranet, ofrece temas como opciones,
 * responde con pasos y acciones (abrir otro tema, ir a una página, señalar un
 * elemento), busca por palabras clave y enseña los avisos pendientes. KAI no
 * hace gestiones por el usuario: le guía, y lo dice cuando no sabe algo.
 */
import { useEventListener } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { KIUB_GUIDE, searchGuide } from '@/lib/kai/guide';
import type {
    KaiGuide,
    KaiGuideAction,
    KaiGuideSection,
    KaiNotice,
} from '@/lib/kai/guide';
import type { KaiReaction } from '@/lib/kai/types';

type Props = {
    open: boolean;
    guide?: KaiGuide;
    /** Sección actual (id de la guía). */
    section: string;
    notices?: KaiNotice[];
    /** Sin animaciones de escritura ni de entrada. */
    reducedMotion?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    guide: () => KIUB_GUIDE,
    notices: () => [],
    reducedMotion: false,
});

const emit = defineEmits<{
    close: [];
    /** KAI «escribe» (para su expresión de pensar). */
    typing: [value: boolean];
    /** Gesto de KAI al responder. */
    gesture: [name: KaiReaction];
    /** Señalar un elemento de la página. */
    show: [target: HTMLElement];
    /** Enlace pulsado; el receptor puede impedir la navegación. */
    navigate: [href: string, event: MouseEvent];
    /** El usuario ha visto los avisos. */
    read: [ids: string[]];
}>();

type Message = {
    id: number;
    from: 'kai' | 'user';
    text: string;
    steps?: string[];
    actions?: KaiGuideAction[];
    notices?: KaiNotice[];
};

type Chip =
    | { kind: 'topic'; id: string; label: string }
    | { kind: 'section'; id: string; label: string }
    | { kind: 'tour'; label: string; step: number }
    | { kind: 'read'; label: string };

const uid = useId();
const panel = ref<HTMLElement | null>(null);
const log = ref<HTMLElement | null>(null);
const options = ref<HTMLElement | null>(null);
const messages = ref<Message[]>([]);
const chips = ref<Chip[]>([]);
const typing = ref(false);
const query = ref('');
const browsing = ref(props.section);
let greeted = '';
let shownNotices = new Set<string>();
let nextId = 1;
let token = 0;
const timers: number[] = [];

const sections = computed(() =>
    Object.fromEntries(props.guide.sections.map((s) => [s.id, s])),
);
const current = computed<KaiGuideSection | undefined>(
    () => sections.value[browsing.value] ?? props.guide.sections[0],
);

/* ── Conversación ────────────────────────────────────────────────────── */

function scrollDown() {
    void nextTick(() => {
        log.value?.scrollTo({
            top: log.value.scrollHeight,
            behavior: props.reducedMotion ? 'auto' : 'smooth',
        });
    });
}

function push(message: Omit<Message, 'id'>) {
    messages.value.push({ id: nextId++, ...message });
    scrollDown();
}

function clearTimers() {
    timers.splice(0).forEach((t) => window.clearTimeout(t));
}

/** Escribir lleva un momento, proporcional al texto (no un retraso fijo). */
function delayFor(text: string): number {
    if (props.reducedMotion) {
        return 200;
    }

    return Math.min(1300, Math.max(450, 320 + text.length * 13));
}

/**
 * KAI responde: «escribe», publica cada globo y deja las opciones.
 * Si el usuario elige otra cosa mientras tanto, la respuesta vieja se cancela.
 */
function say(
    bubbles: Omit<Message, 'id' | 'from'>[],
    next: Chip[],
    gesture: KaiReaction | null = 'nod',
) {
    const mine = ++token;
    clearTimers();
    chips.value = [];
    typing.value = true;
    emit('typing', true);
    scrollDown();
    let at = 0;

    bubbles.forEach((bubble, i) => {
        at += delayFor(bubble.text);
        timers.push(
            window.setTimeout(() => {
                if (mine !== token) {
                    return;
                }

                push({ from: 'kai', ...bubble });

                if (i === bubbles.length - 1) {
                    typing.value = false;
                    emit('typing', false);
                    chips.value = next;

                    if (gesture) {
                        emit('gesture', gesture);
                    }
                }
            }, at),
        );
    });
}

function topicChip(id: string): Chip | null {
    const topic = props.guide.topics[id];

    return topic ? { kind: 'topic', id, label: topic.question } : null;
}

/** Opciones de la sección y comunes, sin repetir ni la que se acaba de ver. */
function menu(except?: string): Chip[] {
    const ids = [...(current.value?.topics ?? []), ...props.guide.common];

    return [...new Set(ids)]
        .filter((id) => id !== except)
        .map(topicChip)
        .filter((chip): chip is Chip => chip !== null);
}

function greet() {
    const section = current.value;
    greeted = browsing.value;
    say([{ text: section?.greeting ?? '¿En qué te ayudo?' }], menu(), null);
}

function showNotices(list: KaiNotice[]) {
    const count = list.length;
    list.forEach((n) => shownNotices.add(n.id));
    say(
        [
            {
                text:
                    count === 1
                        ? 'Tengo un aviso para ti:'
                        : `Tengo ${count} avisos para ti:`,
                notices: list,
            },
        ],
        [{ kind: 'read', label: 'Entendido, gracias' }, ...menu()],
        'boing',
    );
}

function openTopic(id: string) {
    const topic = props.guide.topics[id];

    if (!topic) {
        return;
    }

    push({ from: 'user', text: topic.question });

    if (id === 'otras-secciones') {
        say(
            [{ text: topic.answer[0] }],
            props.guide.sections.map((s) => ({
                kind: 'section' as const,
                id: s.id,
                label: s.label,
            })),
        );

        return;
    }

    if (topic.tour?.length) {
        say(
            topic.answer.map((text) => ({ text })),
            [{ kind: 'tour', label: 'Empezar', step: 0 }],
            topic.gesture ?? 'nod',
        );

        return;
    }

    const bubbles: Omit<Message, 'id' | 'from'>[] = topic.answer.map(
        (text) => ({ text }),
    );
    const last = bubbles[bubbles.length - 1];

    if (last) {
        last.steps = topic.steps;
        last.actions = topic.actions;
    }

    say(bubbles, menu(id), topic.gesture ?? 'nod');
}

function openSection(id: string) {
    const section = sections.value[id];

    if (!section) {
        return;
    }

    push({ from: 'user', text: section.label });
    browsing.value = id;
    greeted = id;
    say([{ text: section.greeting }], menu());
}

/** Busca el primer elemento visible que encaje con el selector. */
function locate(selector: string): HTMLElement | null {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        if (el.getClientRects().length > 0) {
            return el;
        }
    }

    return null;
}

function tourStep(step: number) {
    const tour = props.guide.topics.tour?.tour ?? [];
    const item = tour[step];

    if (!item) {
        push({ from: 'user', text: 'Terminar' });
        say(
            [{ text: '¡Listo! Ya conoces lo básico. ¿Algo más?' }],
            menu('tour'),
            'success',
        );

        return;
    }

    push({ from: 'user', text: step === 0 ? 'Empezar' : 'Siguiente' });
    const el = locate(item.target);

    if (el) {
        emit('show', el);
    }

    const last = step === tour.length - 1;
    say(
        [
            {
                text: el
                    ? item.text
                    : `${item.text} (En pantallas pequeñas está en el menú ☰.)`,
            },
        ],
        [
            {
                kind: 'tour',
                label: last ? 'Terminar' : 'Siguiente',
                step: step + 1,
            },
        ],
        null,
    );
}

function choose(chip: Chip) {
    // El botón pulsado desaparece con las opciones viejas: el foco se queda
    // en el grupo de opciones, donde llegarán las nuevas.
    options.value?.focus({ preventScroll: true });

    if (chip.kind === 'topic') {
        openTopic(chip.id);
    } else if (chip.kind === 'section') {
        openSection(chip.id);
    } else if (chip.kind === 'tour') {
        tourStep(chip.step);
    } else {
        push({ from: 'user', text: chip.label });
        emit(
            'read',
            props.notices.map((n) => n.id),
        );
        greet();
    }
}

function runAction(action: KaiGuideAction, event: MouseEvent) {
    if (action.kind === 'topic') {
        openTopic(action.topic);
    } else if (action.kind === 'link') {
        emit('navigate', action.href, event);
    } else {
        const el = locate(action.target);

        if (el) {
            emit('show', el);
            say([{ text: 'Ahí lo tienes. 👉' }], menu(), null);
        } else {
            say(
                [
                    {
                        text: 'En esta pantalla no lo veo. En pantallas pequeñas, búscalo en el menú ☰.',
                    },
                ],
                menu(),
                null,
            );
        }
    }
}

function search() {
    const text = query.value.trim();

    if (!text) {
        return;
    }

    query.value = '';
    push({ from: 'user', text });
    const found = searchGuide(props.guide, text);

    if (found.length) {
        say(
            [{ text: 'Esto es lo que encontré:' }],
            found.map(topicChip).filter((chip): chip is Chip => chip !== null),
            'idea',
        );
    } else {
        say([{ text: props.guide.fallback }], menu(), null);
    }
}

/* ── Abrir y cerrar ──────────────────────────────────────────────────── */

watch(
    () => props.open,
    (open) => {
        if (!open) {
            return;
        }

        const fresh = props.notices.filter((n) => !shownNotices.has(n.id));

        if (fresh.length) {
            browsing.value = props.section || browsing.value;
            showNotices(fresh);
        } else if (!messages.value.length || greeted !== props.section) {
            // Primera vez, o el usuario ha cambiado de sección desde la última.
            browsing.value = props.section || browsing.value;
            greet();
        }

        void nextTick(() => panel.value?.focus());
    },
    { immediate: true },
);

watch(
    () => props.notices.map((n) => n.id).join(),
    () => {
        // Avisos ya leídos: si vuelven a llegar, se enseñan otra vez.
        shownNotices = new Set(
            [...shownNotices].filter((id) =>
                props.notices.some((n) => n.id === id),
            ),
        );
    },
);

// Si cambia la sección con el chat abierto (navegación), saluda en la nueva.
watch(
    () => props.section,
    (section) => {
        if (props.open && section && section !== greeted) {
            browsing.value = section;
            greet();
        }
    },
);

// Escape cierra aunque el foco se haya quedado fuera (p. ej. en <body>).
useEventListener('keydown', (event: KeyboardEvent) => {
    if (!props.open || event.key !== 'Escape') {
        return;
    }

    const active = document.activeElement;

    if (!active || active === document.body || panel.value?.contains(active)) {
        emit('close');
    }
});

onBeforeUnmount(() => {
    token++;
    clearTimers();
});

const sectionLabel = computed(() => current.value?.label ?? '');
</script>

<template>
    <section
        ref="panel"
        class="kc"
        role="dialog"
        aria-modal="false"
        :aria-labelledby="`${uid}-title`"
        tabindex="-1"
        :data-reduced="reducedMotion || undefined"
    >
        <header class="kc-head">
            <div>
                <h2 :id="`${uid}-title`" class="kc-title">KAI</h2>
                <p class="kc-sub">
                    Ayuda guiada<template v-if="sectionLabel">
                        · {{ sectionLabel }}</template
                    >
                </p>
            </div>
            <button
                type="button"
                class="kc-close"
                aria-label="Cerrar la ayuda"
                @click="emit('close')"
            >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
            </button>
        </header>

        <ol
            ref="log"
            class="kc-log"
            role="log"
            aria-live="polite"
            aria-label="Conversación con KAI"
        >
            <li
                v-for="message in messages"
                :key="message.id"
                class="kc-msg"
                :data-from="message.from"
            >
                <p class="kc-text">{{ message.text }}</p>
                <ol v-if="message.steps?.length" class="kc-steps">
                    <li v-for="step in message.steps" :key="step">
                        {{ step }}
                    </li>
                </ol>
                <ul v-if="message.notices?.length" class="kc-notices">
                    <li v-for="notice in message.notices" :key="notice.id">
                        <strong>{{ notice.title }}</strong>
                        <span v-if="notice.text">{{ notice.text }}</span>
                        <a
                            v-if="notice.href"
                            :href="notice.href"
                            class="kc-link"
                            @click="emit('navigate', notice.href, $event)"
                            >Ver aviso</a
                        >
                    </li>
                </ul>
                <div v-if="message.actions?.length" class="kc-actions">
                    <template
                        v-for="action in message.actions"
                        :key="action.label"
                    >
                        <a
                            v-if="action.kind === 'link'"
                            :href="action.href"
                            class="kc-action"
                            data-kind="link"
                            @click="runAction(action, $event)"
                            >{{ action.label }}</a
                        >
                        <button
                            v-else
                            type="button"
                            class="kc-action"
                            :data-kind="action.kind"
                            @click="runAction(action, $event)"
                        >
                            {{ action.label }}
                        </button>
                    </template>
                </div>
            </li>
            <li v-if="typing" class="kc-msg kc-typing" data-from="kai">
                <span class="kc-dots" aria-hidden="true">
                    <i /><i /><i />
                </span>
                <span class="kc-sr">KAI está escribiendo…</span>
            </li>
        </ol>

        <div
            v-show="chips.length"
            ref="options"
            class="kc-chips"
            role="group"
            aria-label="Opciones"
            tabindex="-1"
        >
            <button
                v-for="(chip, i) in chips"
                :key="`${chip.kind}-${chip.label}`"
                type="button"
                class="kc-chip"
                :data-kind="chip.kind"
                :style="{ animationDelay: `${i * 45}ms` }"
                @click="choose(chip)"
            >
                {{ chip.label }}
            </button>
        </div>

        <form class="kc-form" role="search" @submit.prevent="search">
            <label :for="`${uid}-q`" class="kc-sr">Buscar en la ayuda</label>
            <input
                :id="`${uid}-q`"
                v-model="query"
                class="kc-input"
                type="text"
                autocomplete="off"
                placeholder="Escribe qué buscas…"
                maxlength="120"
            />
            <button
                type="submit"
                class="kc-send"
                aria-label="Buscar"
                :disabled="!query.trim()"
            >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
                </svg>
            </button>
        </form>
    </section>
</template>

<style scoped>
.kc {
    --kc-ink: #151924;
    --kc-muted: #5b6475;
    --kc-line: rgba(169, 193, 211, 0.55);
    --kc-surface: rgba(255, 255, 255, 0.94);
    --kc-bubble: linear-gradient(
        135deg,
        rgba(92, 157, 255, 0.13),
        rgba(155, 130, 255, 0.13)
    );
    --kc-accent: #2f6fe0;

    display: flex;
    flex-direction: column;
    width: min(360px, calc(100vw - 48px));
    max-height: min(560px, calc(100vh - 190px));
    overflow: hidden;
    border: 1px solid var(--kc-line);
    border-radius: 22px;
    background: var(--kc-surface);
    box-shadow:
        0 28px 60px -28px rgba(21, 25, 36, 0.5),
        0 2px 6px -2px rgba(21, 25, 36, 0.08);
    color: var(--kc-ink);
    font-family: Raleway, system-ui, sans-serif;
    -webkit-backdrop-filter: blur(18px);
    backdrop-filter: blur(18px);
}

.kc:focus {
    outline: none;
}

.kc:focus-visible {
    outline: 3px solid #5c9dff;
    outline-offset: 2px;
}

:root.dark .kc {
    --kc-ink: #e8edf5;
    --kc-muted: #9aa6b8;
    --kc-line: rgba(255, 255, 255, 0.09);
    --kc-surface: rgba(17, 22, 33, 0.94);
    --kc-bubble: linear-gradient(
        135deg,
        rgba(92, 157, 255, 0.18),
        rgba(155, 130, 255, 0.18)
    );
    --kc-accent: #8dbaff;
}

.kc-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 14px 8px 18px;
}

.kc-title {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.04em;
}

.kc-sub {
    margin: 2px 0 0;
    color: var(--kc-muted);
    font-size: 12px;
}

.kc-close,
.kc-send {
    display: grid;
    flex: none;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.kc-close:hover {
    background: rgba(92, 157, 255, 0.14);
}

.kc-close svg,
.kc-send svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.kc-close:focus-visible,
.kc-chip:focus-visible,
.kc-action:focus-visible,
.kc-send:focus-visible,
.kc-link:focus-visible {
    outline: 3px solid #5c9dff;
    outline-offset: 2px;
}

.kc-log {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    min-height: 120px;
    margin: 0;
    padding: 4px 14px 10px;
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
}

.kc-msg {
    max-width: 88%;
    padding: 9px 12px;
    font-size: 13.5px;
    line-height: 1.45;
    animation: kc-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.kc-msg[data-from='kai'] {
    align-self: flex-start;
    border-radius: 16px 16px 16px 6px;
    background: var(--kc-bubble);
}

.kc-msg[data-from='user'] {
    align-self: flex-end;
    border-radius: 16px 16px 6px 16px;
    background: #5c9dff;
    color: #ffffff;
}

.kc-text {
    margin: 0;
}

.kc-steps {
    margin: 6px 0 0;
    padding-left: 1.3em;
    /* La lista de la conversación no lleva marcas; los pasos sí. */
    list-style: decimal;
}

.kc-steps li::marker {
    color: var(--kc-accent);
    font-weight: 700;
}

.kc-steps li + li {
    margin-top: 3px;
}

.kc-notices {
    display: grid;
    gap: 6px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
}

.kc-notices li {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.7);
}

:root.dark .kc-notices li {
    background: rgba(255, 255, 255, 0.06);
}

.kc-link {
    justify-self: start;
    color: var(--kc-accent);
    font-weight: 700;
}

.kc-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}

.kc-action {
    padding: 5px 10px;
    border: 1px solid currentColor;
    border-radius: 999px;
    background: transparent;
    color: var(--kc-accent);
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
}

.kc-action:hover {
    background: rgba(92, 157, 255, 0.12);
}

.kc-typing {
    padding: 11px 14px;
}

.kc-dots {
    display: inline-flex;
    gap: 4px;
}

.kc-dots i {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #5c9dff;
    opacity: 0.4;
    animation: kc-dot 1s ease-in-out infinite;
}

.kc-dots i:nth-child(2) {
    animation-delay: 0.15s;
}

.kc-dots i:nth-child(3) {
    animation-delay: 0.3s;
}

.kc-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 140px;
    padding: 8px 14px;
    overflow-y: auto;
    border-top: 1px solid var(--kc-line);
}

.kc-chip {
    padding: 6px 11px;
    border: 1px solid rgba(92, 157, 255, 0.45);
    border-radius: 999px;
    background: transparent;
    color: var(--kc-accent);
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
    animation: kc-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.kc-chips:focus {
    outline: none;
}

.kc-chip:hover {
    background: rgba(92, 157, 255, 0.12);
}

.kc-chip[data-kind='tour'],
.kc-chip[data-kind='read'] {
    border-color: transparent;
    background: #5c9dff;
    color: #ffffff;
}

.kc-form {
    display: flex;
    gap: 6px;
    padding: 10px 12px 12px;
    border-top: 1px solid var(--kc-line);
}

.kc-input {
    flex: 1;
    min-width: 0;
    padding: 8px 12px;
    border: 1px solid var(--kc-line);
    border-radius: 14px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 13.5px;
}

.kc-input:focus-visible {
    border-color: #5c9dff;
    outline: 2px solid rgba(92, 157, 255, 0.35);
}

.kc-send {
    background: #5c9dff;
    color: #ffffff;
}

.kc-send:disabled {
    opacity: 0.4;
    cursor: default;
}

.kc-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

@keyframes kc-in {
    from {
        opacity: 0;
        transform: translateY(6px) scale(0.98);
    }
}

@keyframes kc-dot {
    0%,
    100% {
        opacity: 0.35;
        transform: translateY(0);
    }

    50% {
        opacity: 1;
        transform: translateY(-3px);
    }
}

.kc[data-reduced] .kc-msg,
.kc[data-reduced] .kc-chip,
.kc[data-reduced] .kc-dots i {
    animation: none;
}

@media (prefers-reduced-motion: reduce) {
    .kc-msg,
    .kc-chip,
    .kc-dots i {
        animation: none;
    }
}
</style>
