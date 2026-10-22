<script setup lang="ts">
/**
 * Escena del inicio de sesión: KAI, su estela blanca y el entorno por el que
 * viaja.
 *
 * - Al montarse, «Una corriente que cobra vida» (la aparición `'stream'`),
 *   recortada por el panel; al terminar, KAI saluda. Después vive: gestos
 *   naturales de vez en cuando, mira el campo de correo y deja de mirar
 *   mientras se escribe la contraseña.
 * - El fondo es blanco. La «galaxia» aparece con un fundido al pasar por
 *   «Ingresar» y mientras se valida, hasta que el contenedor desaparece.
 * - `travel(true)`: mira al botón, retrocede y se inclina hacia la dirección
 *   de viaje; de su espalda sale una estela blanca plana, alineada con el
 *   movimiento, y el entorno pasa al revés (estado «Viaje»).
 * - `launch()`: se comprime y se impulsa; el entorno acelera y un pulso de
 *   luz recorre la estela (estado «Impulso»), lo que dure la validación.
 * - `fail()`: frena, recoge la estela y muestra el error junto al formulario.
 * - `depart()`: como al final de la referencia, acelera en su dirección y
 *   sale del recuadro; la estela pasa tras él y queda la galaxia.
 *
 * Todo parte de la pose actual: entrar y salir del botón a medias continúa
 * desde donde está, sin reinicios.
 */
import {
    useEventListener,
    usePreferredReducedMotion,
    useResizeObserver,
} from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import KaiCharacter from '@/components/kai/KaiCharacter.vue';
import { subscribeTick } from '@/lib/kai/ticker';
import type { KaiEmergePhase, KaiReaction, KaiState } from '@/lib/kai/types';
import { createTravelLayers } from './useTravelLayers';
import type { TravelLayers } from './useTravelLayers';
import { createWhiteTrail } from './useWhiteTrail';
import type { WhiteTrail } from './useWhiteTrail';

const emit = defineEmits<{
    phase: [phase: KaiEmergePhase | null];
}>();

/**
 * Dirección del viaje (pantalla): de izquierda a derecha y hacia abajo,
 * como en la referencia (≈ 32°).
 */
const HEADING = 0.55;
/** Velocidades del entorno. */
const SPEED = { rest: 0.35, travel: 1.3, rush: 2.1, depart: 3 };
/** Gestos espontáneos en reposo: cada cuánto (ms) y cuáles. */
const MOOD_EVERY: [number, number] = [6500, 10500];
/** Tras esta pausa sin escribir (ms), deja de mirar el campo. */
const TYPING_PAUSE = 2500;

type KaiRef = InstanceType<typeof KaiCharacter>;
type Mood = { reaction?: KaiReaction; state?: KaiState; look?: boolean };

const MOODS: Mood[] = [
    { look: true },
    { state: 'curious' },
    { reaction: 'boing' },
    { reaction: 'nod' },
    { reaction: 'idea' },
    { state: 'content' },
    { reaction: 'giggle' },
];

const root = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const trailCanvas = ref<HTMLCanvasElement | null>(null);
const kaiBox = ref<HTMLElement | null>(null);
const kai = ref<KaiRef | null>(null);

const prefersReduced = usePreferredReducedMotion();
const reduced = computed(() => prefersReduced.value === 'reduce');

const width = ref(0);
const height = ref(0);
const size = computed(() =>
    Math.round(
        Math.max(120, Math.min(250, Math.min(width.value, height.value) * 0.5)),
    ),
);

const state = ref<KaiState>('idle');
const appearing = ref(true);
const departing = ref(false);
/** Tras salir del recuadro, KAI ya no se dibuja. */
const hidden = ref(false);
/** Movimiento reducido: KAI se desvanece en su sitio. */
const fading = ref(false);
/** Galaxia visible: viaje, validación y salida. */
const galaxy = ref(false);
const lift = ref({ x: 0, y: 0, scale: 1 });

let layers: TravelLayers | null = null;
let trail: WhiteTrail | null = null;
let unsubscribe: (() => void) | null = null;
let hovering = false;
let busy = false;
let field: 'email' | 'password' | null = null;
let fieldEl: HTMLInputElement | null = null;
/** Última pulsación: mientras se escribe, KAI no hace gestos. */
let typedAt = -Infinity;
let errorTimer: number | undefined;
let lookTimer: number | undefined;
let moodTimer: number | undefined;
let moodBack: number | undefined;
let launchedAt = 0;
let heading = HEADING;
/** Radio de las esquinas del panel (recorte de la estela). */
let panelRadius = 28;

useResizeObserver(root, ([entry]) => {
    width.value = entry.contentRect.width;
    height.value = entry.contentRect.height;
    layers?.resize(width.value, height.value);

    const radius = parseFloat(
        getComputedStyle(entry.target).borderTopLeftRadius,
    );
    panelRadius = Number.isFinite(radius) ? radius : 28;
});

useEventListener(window, 'resize', () => trail?.resize());

/* ── Bucle: entorno y estela ───────────────────────────────────────── */

/** Centro y radio de KAI en pantalla (px), escala incluida. */
function kaiHead() {
    const g = kai.value?.screenGeometry();

    return g ? { x: g.center.x, y: g.center.y, r: g.radius * 0.97 } : null;
}

function tick(dt: number) {
    layers?.frame(dt);

    const rect = root.value?.getBoundingClientRect();
    trail?.frame(
        Math.min(dt, 0.05),
        // Aunque ya no se dibuje (salió del recuadro), la estela lo sigue.
        kaiHead(),
        heading,
        rect ? { rect, radius: panelRadius } : null,
        layers?.speed ?? 1,
    );
}

function startLoop() {
    if (!unsubscribe && !reduced.value) {
        unsubscribe = subscribeTick(tick);
    }
}

watch(reduced, (value) => {
    if (value) {
        unsubscribe?.();
        unsubscribe = null;
        trail?.clear();
        layers?.setSpeed(0);
        layers?.frame(1);
    } else {
        startLoop();
    }
});

function setState(next: KaiState) {
    state.value = next;
    kai.value?.setState(next);
}

function setHeading(angle: number) {
    heading = angle;
    kai.value?.setHeading(angle);
    layers?.setHeading(angle);
}

/** Mirada de KAI hacia un elemento de la página. */
function gazeTo(el: Element | null) {
    const box = kaiBox.value?.getBoundingClientRect();

    if (!el || !box) {
        kai.value?.lookAt(null);

        return;
    }

    const r = el.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height * (80 / 144);
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const k = 1 / Math.max(160, Math.hypot(dx, dy) * 0.9);
    kai.value?.lookAt({ x: dx * k * 1.3, y: dy * k });
}

/* ── Vida en reposo ────────────────────────────────────────────────── */

/** Sin nada que atender: puede tener un gesto espontáneo. */
function calm(): boolean {
    return (
        !appearing.value &&
        !hovering &&
        !busy &&
        !departing.value &&
        field !== 'password' &&
        state.value === 'idle' &&
        performance.now() - typedAt > TYPING_PAUSE
    );
}

function scheduleMood() {
    window.clearTimeout(moodTimer);
    const [min, max] = MOOD_EVERY;
    moodTimer = window.setTimeout(playMood, min + Math.random() * (max - min));
}

let lastMood = -1;

function playMood() {
    scheduleMood();

    if (!calm() || reduced.value) {
        return;
    }

    let i = Math.floor(Math.random() * MOODS.length);

    if (i === lastMood) {
        i = (i + 1) % MOODS.length;
    }

    lastMood = i;
    const mood = MOODS[i];

    if (mood.reaction) {
        void kai.value?.react(mood.reaction);
    } else if (mood.state) {
        setState(mood.state);
        window.clearTimeout(moodBack);
        moodBack = window.setTimeout(() => {
            if (state.value === mood.state && field !== 'password' && !busy) {
                setState('idle');
            }
        }, 2600);
    } else if (mood.look) {
        // Echa un vistazo al formulario y vuelve.
        kai.value?.lookAt({ x: 0.8, y: 0.15 });
        window.clearTimeout(moodBack);
        moodBack = window.setTimeout(() => {
            if (calm()) {
                kai.value?.lookAt(null);
            }
        }, 1700);
    }
}

/* ── API ───────────────────────────────────────────────────────────── */

/** Cursor, foco o dedo sobre «Ingresar»: KAI comienza el viaje. */
function travel(on: boolean, target: Element | null = null) {
    hovering = on;

    if (busy || departing.value || appearing.value) {
        // Durante la aparición se aplica al terminar.
        return;
    }

    window.clearTimeout(lookTimer);
    window.clearTimeout(moodBack);

    if (on) {
        galaxy.value = true;
        setHeading(HEADING);
        gazeTo(target);
        lookTimer = window.setTimeout(() => {
            if (hovering && !busy) {
                kai.value?.lookAt(null);
            }
        }, 340);
        setState('travel');
        layers?.setSpeed(SPEED.travel);
        // La estela sale tras el pequeño retroceso.
        window.setTimeout(() => {
            if (hovering && !busy) {
                trail?.setAmount(1);
            }
        }, 140);
    } else {
        galaxy.value = false;
        kai.value?.lookAt(null);
        trail?.setAmount(0);
        setState(field ? fieldState() : 'idle');
        layers?.setSpeed(SPEED.rest);
    }
}

/** Envío del formulario: se comprime y se impulsa. */
function launch() {
    window.clearTimeout(errorTimer);
    window.clearTimeout(moodBack);
    busy = true;
    launchedAt = performance.now();
    galaxy.value = true;

    if (appearing.value) {
        kai.value?.cancelEmerge();
        appearing.value = false;
    }

    kai.value?.lookAt(null);
    setHeading(HEADING);
    setState('rush');
    trail?.setRush(1);
    // Tras la compresión, el entorno acelera y la estela sale.
    window.setTimeout(() => {
        if (busy && !departing.value) {
            trail?.setAmount(1);
            layers?.setSpeed(SPEED.rush);
        }
    }, 120);
}

/** Credenciales rechazadas: frena, vuelve junto al formulario y avisa. */
function fail(target: Element | null = null) {
    busy = false;
    galaxy.value = false;
    trail?.setRush(0);
    trail?.setAmount(0);
    layers?.setSpeed(SPEED.rest);
    setState('idle');
    window.clearTimeout(errorTimer);
    errorTimer = window.setTimeout(() => {
        setState('error');
        gazeTo(target);
    }, 480);
}

/**
 * El usuario escribe (o corrige tras un error): vuelve a la calma y, en el
 * correo, mira lo que se escribe mientras dura.
 */
function recover() {
    window.clearTimeout(errorTimer);
    typedAt = performance.now();

    if (state.value === 'error') {
        kai.value?.lookAt(null);
        setState(hovering ? 'travel' : fieldState());
    }

    if (field === 'email' && fieldEl && state.value === 'idle' && !busy) {
        gazeTo(fieldEl);
        window.clearTimeout(lookTimer);
        lookTimer = window.setTimeout(() => {
            if (calm()) {
                kai.value?.lookAt(null);
            }
        }, TYPING_PAUSE);
    }
}

function fieldState(): KaiState {
    // Con la contraseña cierra los ojos: no mira.
    return field === 'password' ? 'content' : 'idle';
}

/** Campo que se está rellenando (o ninguno). */
function watchField(el: Element | null) {
    const input = el as HTMLInputElement | null;
    fieldEl = input;
    field =
        input?.name === 'password'
            ? 'password'
            : input?.name === 'email'
              ? 'email'
              : null;

    if (busy || departing.value || appearing.value || hovering) {
        return;
    }

    if (state.value === 'error') {
        return;
    }

    window.clearTimeout(moodBack);
    setState(fieldState());

    if (field === 'email') {
        gazeTo(el);
    } else {
        kai.value?.lookAt(null);
    }
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function animate(duration: number, step: (u: number) => void): Promise<void> {
    return new Promise((resolve) => {
        const start = performance.now();
        const frame = (now: number) => {
            const u = Math.min(1, (now - start) / duration);
            step(u);

            if (u < 1) {
                requestAnimationFrame(frame);
            } else {
                resolve();
            }
        };

        requestAnimationFrame(frame);
    });
}

/**
 * Acceso concedido, como al final de la referencia: KAI acelera en su
 * dirección y sale del recuadro (dentro del panel, que lo recorta); la
 * estela pasa tras él y queda la galaxia. Se resuelve al terminar; la
 * página se encarga después de apartar el contenedor y presentar la
 * intranet.
 */
async function depart(): Promise<void> {
    departing.value = true;
    busy = true;
    window.clearTimeout(errorTimer);
    window.clearTimeout(moodTimer);

    // El impulso del clic se ve entero antes de salir.
    const since = performance.now() - launchedAt;

    if (!reduced.value && since < 450) {
        await sleep(450 - since);
    }

    const head = kaiHead();
    const panel = root.value?.getBoundingClientRect();

    if (reduced.value || !head || !panel) {
        fading.value = true;
        await sleep(250);

        return;
    }

    // Distancia hasta salir del todo por el borde del panel.
    const ux = Math.cos(heading);
    const uy = Math.sin(heading);
    const tx =
        ux > 0 ? (panel.right - head.x) / ux : (panel.left - head.x) / ux;
    const ty =
        uy > 0 ? (panel.bottom - head.y) / uy : (panel.top - head.y) / uy;
    const distance = Math.min(tx, ty) + head.r * 2.6;

    layers?.setSpeed(SPEED.depart);
    trail?.setRush(0);

    // Arranca suave y acelera fuerte: se va disparado.
    await animate(430, (u) => {
        const e = u * u * u;
        lift.value = {
            x: ux * distance * e,
            y: uy * distance * e,
            scale: 1 + 0.14 * e,
        };
    });

    // La cola de la estela pasa rápido por el panel y queda la galaxia.
    hidden.value = true;
    trail?.setAmount(0, 5.5);
    await sleep(520);
}

function onEmergeEnd() {
    appearing.value = false;

    if (hovering && !busy) {
        travel(true);

        return;
    }

    if (!busy) {
        // Recién formado, saluda.
        void kai.value?.react('welcome');
    }

    scheduleMood();
}

defineExpose({ travel, launch, fail, recover, watchField, depart });

onMounted(() => {
    if (canvas.value) {
        layers = createTravelLayers(canvas.value);
        layers.setHeading(HEADING);
        layers.setSpeed(reduced.value ? 0 : SPEED.rest);
        layers.resize(width.value || 1, height.value || 1);
    }

    if (trailCanvas.value) {
        trail = createWhiteTrail(trailCanvas.value);
        trail.resize();
    }

    kai.value?.setHeading(HEADING);
    void kai.value?.emerge('stream');
    startLoop();
});

onBeforeUnmount(() => {
    unsubscribe?.();
    window.clearTimeout(errorTimer);
    window.clearTimeout(lookTimer);
    window.clearTimeout(moodTimer);
    window.clearTimeout(moodBack);
});
</script>

<template>
    <div
        ref="root"
        class="kls"
        :class="{ 'is-departing': departing, 'is-galaxy': galaxy }"
        :data-kai-scene="state"
        :data-galaxy="galaxy || undefined"
        :data-appearing="appearing || undefined"
    >
        <div class="kls-backdrop" aria-hidden="true">
            <span class="kls-light" />
            <div class="kls-galaxy">
                <canvas ref="canvas" class="kls-canvas" />
            </div>
        </div>

        <canvas ref="trailCanvas" class="kls-trail" aria-hidden="true" />

        <div class="kls-kai-layer" aria-hidden="true">
            <div
                ref="kaiBox"
                class="kls-kai"
                :class="{ 'is-hidden': hidden, 'is-fading': fading }"
                :style="{
                    transform: `translate(-50%, -${(80 / 144) * 100}%) translate(${lift.x}px, ${lift.y}px) scale(${lift.scale})`,
                }"
            >
                <KaiCharacter
                    ref="kai"
                    :size="size"
                    :surface="galaxy ? 'dark' : 'light'"
                    @emerge-phase="emit('phase', $event.phase)"
                    @emerge-end="
                        emit('phase', null);
                        onEmergeEnd();
                    "
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.kls {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: inherit;
}

/* El panel: blanco; la galaxia aparece encima con un fundido. */
.kls-backdrop {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    background: #ffffff;
    box-shadow: inset 0 0 0 1px rgba(21, 25, 36, 0.05);
    transition: opacity 0.45s ease;
}

.kls-galaxy {
    position: absolute;
    inset: 0;
    /* Azul noche arriba, violeta abajo: los tonos de la referencia. */
    background:
        radial-gradient(
            110% 70% at 15% 0%,
            rgba(30, 70, 190, 0.45),
            transparent 60%
        ),
        linear-gradient(
            180deg,
            #112565 0%,
            #1a2067 42%,
            #2d1866 74%,
            #381266 100%
        );
    opacity: 0;
    transition: opacity 0.5s ease;
}

.kls.is-galaxy .kls-galaxy {
    opacity: 1;
    transition-duration: 0.4s;
}

.kls-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

/* Halo muy suave bajo KAI sobre el blanco. */
.kls-light {
    position: absolute;
    top: 54%;
    left: 50%;
    width: 64%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(
        closest-side,
        rgba(92, 157, 255, 0.1),
        rgba(92, 157, 255, 0)
    );
    transform: translate(-50%, -50%);
}

/* Estela blanca: a pantalla completa, entre el fondo y KAI. */
.kls-trail {
    position: fixed;
    inset: 0;
    z-index: 4;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
}

.kls-kai-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    border-radius: inherit;
    pointer-events: none;
    /* El panel recorta a KAI: entra y sale por sus bordes. */
    clip-path: inset(0 round var(--kls-radius, 28px));
}

.kls-kai {
    position: absolute;
    top: 54%;
    left: 50%;
    transform-origin: 50% 55.6%;
    transition:
        left 0.7s cubic-bezier(0.22, 1, 0.36, 1),
        top 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
}

/* De viaje se coloca algo a la derecha, como en la referencia: la estela
   tiene sitio y KAI parece avanzar. */
.kls.is-galaxy .kls-kai {
    top: 52%;
    left: 57%;
}

.kls-kai.is-hidden {
    visibility: hidden;
}

.kls-kai.is-fading {
    opacity: 0;
    transition: opacity 0.25s ease;
}

/* En el espacio no hay suelo: sin sombra mientras viaja. */
.kls :deep(.kai-shadow) {
    transition: opacity 0.4s ease;
}

.kls.is-galaxy :deep(.kai-shadow),
.kls.is-departing :deep(.kai-shadow) {
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .kls-backdrop,
    .kls-galaxy {
        transition-duration: 0.2s;
    }
}
</style>
