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
 * - `depart()`: sale del panel describiendo una curva amplia, con la estela
 *   siguiendo su recorrido, y choca contra el navbar; la capa de llegada
 *   (`lib/kai/arrival`) convierte el choque en la barra.
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
import { measureBar, playArrival } from '@/lib/kai/arrival';
import { subscribeTick } from '@/lib/kai/ticker';
import type { KaiEmergePhase, KaiReaction, KaiState } from '@/lib/kai/types';
import { createTravelLayers } from './useTravelLayers';
import type { TravelLayers } from './useTravelLayers';
import { createWhiteTrail } from './useWhiteTrail';
import type { WhiteTrail } from './useWhiteTrail';

const emit = defineEmits<{
    phase: [phase: KaiEmergePhase | null];
}>();

/** Dirección del viaje (pantalla): hacia la derecha y un poco hacia arriba. */
const HEADING = -0.26;
/** Velocidades del entorno. */
const SPEED = { rest: 0.35, travel: 1.3, rush: 2.8, depart: 3.6 };
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
/** El panel recorta a KAI (la corriente entra desde fuera); al salir, no. */
const clipped = ref(true);
const departing = ref(false);
/** Tras el choque, KAI es la barra (capa de llegada). */
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
        hidden.value ? null : kaiHead(),
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

function smooth(u: number): number {
    const x = Math.max(0, Math.min(1, u));

    return x * x * (3 - 2 * x);
}

type Point = { x: number; y: number };

function bezier(p: Point[], t: number): Point {
    const m = 1 - t;
    const a = m * m * m;
    const b = 3 * m * m * t;
    const c = 3 * m * t * t;
    const d = t * t * t;

    return {
        x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
        y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
    };
}

/**
 * Acceso concedido: KAI sale del panel en una curva amplia (a la derecha,
 * sube y vuelve hacia el centro) y choca contra el navbar desde abajo. Se
 * resuelve cuando la capa de llegada ya cubre la página (el destino puede
 * montarse debajo).
 */
async function depart(background: string): Promise<void> {
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
    const bar = measureBar();

    if (reduced.value || !head) {
        fading.value = true;
        await sleep(250);
        void playArrival({ background, reduced: true });

        return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const end = { x: bar.left + bar.width / 2, y: bar.top + bar.height / 2 };
    // Recorrido como en el boceto: sale hacia la derecha, se eleva por el
    // lado y entra al navbar desde abajo.
    // El lazo se adapta a la pantalla y no se sale del encuadre.
    const margin = head.r * 1.8;
    const path: Point[] = [
        { x: head.x, y: head.y },
        { x: Math.min(vw - margin, head.x + vw * 0.48), y: head.y + 30 },
        {
            x: Math.min(vw - margin, end.x + vw * 0.34),
            y: Math.min(
                vh - margin,
                end.y + vh * 0.46,
                head.y + Math.max(80, vh * 0.12),
            ),
        },
        end,
    ];
    // La estela parte de donde está: hasta el borde del panel.
    const panel = root.value?.getBoundingClientRect();
    const back = heading + Math.PI;
    let reach = 0;

    if (panel) {
        const ux = Math.cos(back);
        const uy = Math.sin(back);
        const tx =
            ux < 0 ? (panel.left - head.x) / ux : (panel.right - head.x) / ux;
        const ty =
            uy < 0 ? (panel.top - head.y) / uy : (panel.bottom - head.y) / uy;
        reach = Math.max(0, Math.min(tx, ty));
    }

    trail?.setRush(0);
    trail?.follow(true, head, heading, reach);
    clipped.value = false;
    layers?.setSpeed(SPEED.depart);

    // Al llegar, su diámetro es algo mayor que la altura de la barra.
    const scale = Math.max(0.3, Math.min(0.9, (bar.height * 0.62) / head.r));
    let previous = path[0];

    await animate(1050, (u) => {
        // Arranca con fuerza y llega aún rápido: así se nota el choque.
        const s = 1.55 * u * u - 0.55 * u * u * u;
        const p = bezier(path, Math.min(1, s));
        const angle = Math.atan2(p.y - previous.y, p.x - previous.x);

        if (Math.hypot(p.x - previous.x, p.y - previous.y) > 0.5) {
            setHeading(angle);
        }

        previous = p;
        lift.value = {
            x: p.x - path[0].x,
            y: p.y - path[0].y,
            scale: 1 + (scale - 1) * smooth(u * 1.15),
        };
    });

    // Choque: en el mismo fotograma, la capa de llegada toma el relevo.
    const impact = kaiHead() ?? { x: end.x, y: end.y, r: head.r * scale };
    void playArrival({
        background,
        impact: { x: impact.x, y: impact.y, r: impact.r },
        trail: trail?.snapshot() ?? [],
    });
    // La capa dibuja su primer fotograma antes que este: sin hueco.
    requestAnimationFrame(() => {
        hidden.value = true;
        trail?.clear();
    });
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

        <div
            class="kls-kai-layer"
            :class="{ 'is-clipped': clipped }"
            aria-hidden="true"
        >
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
    background:
        radial-gradient(
            120% 80% at 20% 0%,
            rgba(92, 157, 255, 0.38),
            transparent 60%
        ),
        radial-gradient(
            90% 70% at 100% 100%,
            rgba(122, 104, 255, 0.32),
            transparent 65%
        ),
        linear-gradient(160deg, #1b2440 0%, #151924 55%, #10131c 100%);
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
}

.kls-kai-layer.is-clipped {
    clip-path: inset(0 round var(--kls-radius, 28px));
}

.kls-kai {
    position: absolute;
    top: 54%;
    left: 50%;
    transform-origin: 50% 55.6%;
    will-change: transform;
}

.kls-kai.is-hidden {
    visibility: hidden;
}

.kls-kai.is-fading {
    opacity: 0;
    transition: opacity 0.25s ease;
}

.kls.is-departing .kls-backdrop {
    opacity: 0;
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
