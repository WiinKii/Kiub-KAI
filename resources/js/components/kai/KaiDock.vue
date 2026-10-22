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
 *
 * Al pulsarlo abre el chat guiado de la sección actual. Los avisos se
 * muestran en un globito sobre su cuerpo y en el chat; KAI señala con una
 * manita los elementos de la página de los que habla.
 *
 * Tras iniciar sesión llega a su sitio entrando desde el borde derecho de
 * la pantalla (aviso de `lib/kai/arrival`) y saluda.
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
    useId,
    watch,
} from 'vue';
import { kaiArrivalPending, onKaiArrive } from '@/lib/kai/arrival';
import { KIUB_GUIDE, sectionFromUrl } from '@/lib/kai/guide';
import type { KaiGuide, KaiNotice } from '@/lib/kai/guide';
import type { KaiColors } from '@/lib/kai/palette';
import type {
    KaiDockSize,
    KaiReaction,
    KaiReducedMotion,
    KaiState,
} from '@/lib/kai/types';
import KaiCharacter from './KaiCharacter.vue';
import KaiChat from './KaiChat.vue';
import { pageDocks } from './dockOwners';
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
    /** Pulsarlo abre el chat guiado. */
    chat?: boolean;
    /** Contenido del chat. */
    guide?: KaiGuide;
    /** Sección actual (id de la guía); vacío = según la URL. */
    section?: string;
    /** Avisos sin leer: globito sobre KAI y primer mensaje del chat. */
    notices?: KaiNotice[];
    /**
     * Lo monta la intranet (layout), no una página. Si una página monta
     * el suyo (p. ej. el laboratorio), este se aparta.
     */
    app?: boolean;
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
    chat: true,
    guide: () => KIUB_GUIDE,
    section: '',
    notices: () => [],
    app: false,
});

const emit = defineEmits<{
    /** Enlace del chat; `event.preventDefault()` para navegar con Inertia. */
    navigate: [href: string, event: MouseEvent];
    /** El usuario ha visto estos avisos. */
    read: [ids: string[]];
}>();

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

/* ── Chat ────────────────────────────────────────────────────────────── */
const chatOpen = ref(false);
const typing = ref(false);
const trigger = ref<HTMLElement | null>(null);
const chatId = useId();
const currentSection = ref(props.section);

// Los estados de presencia solo «tapan» el reposo: un estado real (trabajando,
// error…) siempre se ve.
/* ── Llegada tras iniciar sesión: entra desde la derecha ────────────── */
const away = ref(kaiArrivalPending());
const entering = ref(false);
const offset = ref(0);
let offArrive: (() => void) | undefined;
let arriveTimer = 0;
let arriveFrame = 0;

const shown = computed<KaiState>(() => {
    // Mientras entra, viaja hacia su sitio.
    if (entering.value) {
        return 'travel';
    }

    if (state.value !== 'idle') {
        return state.value;
    }

    if (chatOpen.value) {
        return typing.value ? 'thinking' : 'attentive';
    }

    if (asleep.value) {
        return 'sleeping';
    }

    return props.notices.length ? 'notice' : 'idle';
});

function openChat() {
    if (!props.chat) {
        return;
    }

    currentSection.value =
        props.section || sectionFromUrl(props.guide, window.location.pathname);
    asleep.value = false;
    chatOpen.value = true;
    lookAtChat();
}

// Mientras habláis, mira la conversación (arriba a la izquierda).
function lookAtChat() {
    if (chatOpen.value && !spotTarget) {
        kai.value?.lookAt({ x: -0.5, y: -0.65 });
    }
}

function closeChat() {
    chatOpen.value = false;
    typing.value = false;
    stopSpot();
    void nextTick(() => trigger.value?.focus());
}

function toggleChat() {
    if (chatOpen.value) {
        closeChat();
    } else {
        openChat();
    }
}

function onTyping(value: boolean) {
    typing.value = value;
}

function onGesture(name: KaiReaction) {
    // Tras aplicar el cambio de expresión (pensar → atender), que si no
    // cortaría el gesto.
    void nextTick(() => kai.value?.react(name));
}

watch(
    () => props.section,
    (section) => {
        if (section) {
            currentSection.value = section;
        }
    },
);

const triggerLabel = computed(() => {
    const count = props.notices.length;
    const notices = count
        ? `, ${count} ${count === 1 ? 'aviso nuevo' : 'avisos nuevos'}`
        : '';

    return `${chatOpen.value ? 'Cerrar' : 'Abrir'} la ayuda de KAI${notices}`;
});

// Llega un aviso: KAI despierta y da un saltito para que se note.
watch(
    () => props.notices.length,
    (count, before) => {
        if (count > (before ?? 0)) {
            asleep.value = false;
            lastActivity = Date.now();
        }
    },
);

/* ── Señalar elementos de la página ──────────────────────────────────── */
type Spot = { x: number; y: number; w: number; h: number };
const spot = ref<Spot | null>(null);
let spotTarget: HTMLElement | null = null;
let spotUntil = 0;
let spotFrame = 0;

function showElement(el: HTMLElement) {
    spotTarget = el;
    spotUntil = performance.now() + 3800;
    el.scrollIntoView({
        block: 'nearest',
        behavior: reduced.value ? 'auto' : 'smooth',
    });
    window.cancelAnimationFrame(spotFrame);
    followSpot();
}

function stopSpot() {
    window.cancelAnimationFrame(spotFrame);
    spot.value = null;
    spotTarget = null;
    kai.value?.point(null);
    kai.value?.lookAt(null);
    lookAtChat();
}

// Sigue al elemento (por si la página se mueve) y KAI lo señala.
function followSpot() {
    if (!spotTarget || performance.now() > spotUntil) {
        stopSpot();

        return;
    }

    const r = spotTarget.getBoundingClientRect();
    spot.value = {
        x: r.left - 6,
        y: r.top - 6,
        w: r.width + 12,
        h: r.height + 12,
    };
    const body = trigger.value?.getBoundingClientRect();

    if (body) {
        const dx = r.left + r.width / 2 - (body.left + body.width / 2);
        const dy = r.top + r.height / 2 - (body.top + (body.height * 80) / 144);
        const d = Math.hypot(dx, dy) || 1;
        kai.value?.point({ x: dx / d, y: dy / d });
        kai.value?.lookAt({ x: dx / d, y: dy / d });
    }

    spotFrame = window.requestAnimationFrame(followSpot);
}

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
        !chatOpen.value &&
        !props.notices.length &&
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
        lookTimer = window.setTimeout(() => {
            kai.value?.lookAt(null);
            lookAtChat();
        }, 800);
    },
    { passive: true },
);

/* ── Saludo: una vez por sesión (y siempre al llegar tras el acceso) ─── */
const GREETED_KEY = 'kiub.kai.greeted';
let greetTimer = 0;

function greet(delay: number, always = false) {
    if (!props.greet) {
        return;
    }

    try {
        if (!always && window.sessionStorage.getItem(GREETED_KEY)) {
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
    }, delay);
}

/**
 * Entra desde el borde derecho hasta su sitio: viaja hacia la izquierda,
 * frena con un pequeño rebote (la masa sigue un poco por inercia) y saluda.
 */
function arrive() {
    offArrive?.();
    window.clearTimeout(arriveTimer);

    if (!away.value) {
        return;
    }

    away.value = false;

    if (reduced.value) {
        greet(300, true);

        return;
    }

    const from = 28 + px.value + 80;
    const start = performance.now();
    const duration = 950;
    offset.value = from;
    entering.value = true;
    kai.value?.setHeading(Math.PI);

    const step = (now: number) => {
        const u = Math.min(1, (now - start) / duration);
        // Sale rápido y se pasa un poco antes de asentarse.
        const back = u - 1;
        const e = 1 + 2.2 * back * back * back + 1.2 * back * back;
        offset.value = from * (1 - e);

        if (u < 1) {
            arriveFrame = window.requestAnimationFrame(step);

            return;
        }

        offset.value = 0;
        entering.value = false;
        kai.value?.nudge(-1.1, 0);
        greet(380, true);
    };

    arriveFrame = window.requestAnimationFrame(step);
}

onMounted(() => {
    lastScroll = window.scrollY;

    if (!props.app) {
        pageDocks.value++;
    }

    if (away.value) {
        offArrive = onKaiArrive(arrive);
        // Si la llegada no avisa (pestaña oculta, error), aparece igual.
        arriveTimer = window.setTimeout(arrive, 8000);

        return;
    }

    greet(900);
});

onBeforeUnmount(() => {
    if (!props.app) {
        pageDocks.value--;
    }

    offArrive?.();
    window.clearTimeout(arriveTimer);
    window.cancelAnimationFrame(arriveFrame);
    window.clearTimeout(lookTimer);
    window.clearTimeout(greetTimer);
    window.cancelAnimationFrame(spotFrame);
});

/** `dock.value?.kai?.react('welcome')`, `track(...)`, `openChat()`, etc. */
defineExpose({ kai, asleep, chatOpen, openChat, closeChat });
</script>

<template>
    <div
        class="kai-dock"
        :class="{ 'is-away': away }"
        :data-size="size"
        :data-arriving="entering || undefined"
        :style="offset ? { transform: `translateX(${offset}px)` } : undefined"
    >
        <div
            v-if="spot"
            class="kai-dock-spot"
            aria-hidden="true"
            :style="{
                left: `${spot.x}px`,
                top: `${spot.y}px`,
                width: `${spot.w}px`,
                height: `${spot.h}px`,
            }"
        />
        <Transition name="kai-chat">
            <KaiChat
                v-if="chat"
                v-show="chatOpen"
                :id="chatId"
                class="kai-dock-chat"
                :open="chatOpen"
                :guide="guide"
                :section="currentSection"
                :notices="notices"
                :reduced-motion="reduced"
                @close="closeChat"
                @typing="onTyping"
                @gesture="onGesture"
                @show="showElement"
                @navigate="(href, event) => emit('navigate', href, event)"
                @read="(ids) => emit('read', ids)"
            />
        </Transition>
        <component
            :is="chat ? 'button' : 'div'"
            ref="trigger"
            :type="chat ? 'button' : undefined"
            class="kai-dock-body"
            :aria-label="chat ? triggerLabel : undefined"
            :aria-expanded="chat ? chatOpen : undefined"
            :aria-controls="chat ? chatId : undefined"
            data-dock-trigger
            @click="toggleChat"
        >
            <KaiCharacter
                ref="kai"
                :state="shown"
                :size="px"
                animate-size
                playful
                :tickle="!chat"
                :badge="notices.length || false"
                :colors="colors"
                :mouth="mouth"
                :ambient="size !== 'mini'"
                :intensity="size === 'mini' ? intensity * 0.5 : intensity"
                :paused="paused"
                :reduced-motion="reducedMotion"
                :pull="pull"
                @update:state="onState"
            />
        </component>
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

.kai-dock.is-away {
    /* Opacidad, no visibilidad: el SVG fija `visibility` en sus gotas. */
    opacity: 0;
}

.kai-dock.is-away * {
    pointer-events: none;
}

.kai-dock-body {
    position: relative;
    display: block;
    pointer-events: auto;
}

button.kai-dock-body {
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

button.kai-dock-body:focus-visible {
    outline: 3px solid #5c9dff;
    outline-offset: 2px;
}

.kai-dock-chat {
    position: absolute;
    right: 0;
    bottom: calc(100% + 10px);
    transform-origin: bottom right;
    pointer-events: auto;
}

.kai-chat-enter-active {
    transition:
        opacity 0.2s ease-out,
        transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.kai-chat-leave-active {
    transition:
        opacity 0.15s ease-in,
        transform 0.2s ease-in;
}

.kai-chat-enter-from,
.kai-chat-leave-to {
    opacity: 0;
    transform: translateY(12px) scale(0.9);
}

/* Anillo que rodea el elemento que KAI señala. */
.kai-dock-spot {
    position: fixed;
    border-radius: 14px;
    box-shadow:
        0 0 0 2px #5c9dff,
        0 0 0 7px rgba(92, 157, 255, 0.22),
        0 0 28px 6px rgba(92, 157, 255, 0.35);
    pointer-events: none;
    animation:
        kai-spot-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1),
        kai-spot-pulse 1.4s ease-in-out 0.45s infinite;
}

@keyframes kai-spot-in {
    from {
        opacity: 0;
        transform: scale(1.3);
    }
}

@keyframes kai-spot-pulse {
    50% {
        box-shadow:
            0 0 0 2px #5c9dff,
            0 0 0 11px rgba(92, 157, 255, 0.12),
            0 0 34px 8px rgba(92, 157, 255, 0.3);
    }
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
    .kai-dock-controls,
    .kai-chat-enter-active,
    .kai-chat-leave-active {
        transition: none;
    }

    .kai-dock-spot {
        animation: none;
    }
}
</style>
