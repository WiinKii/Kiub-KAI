<script setup lang="ts">
/**
 * Escena del inicio de sesión: KAI y el entorno por el que viaja.
 *
 * - Al montarse, «Una corriente que cobra vida» (la aparición `'stream'`),
 *   recortada por el panel: la corriente entra desde fuera, por abajo.
 * - `travel(true)`: mira al botón, retrocede, se inclina hacia la diagonal
 *   y el entorno empieza a pasar en sentido contrario (estado «Viaje»).
 * - `launch()`: se comprime y se impulsa; el entorno acelera (estado
 *   «Impulso») y así sigue mientras se valida, dure lo que dure.
 * - `fail()`: frena, recoge la estela y muestra el error junto al formulario.
 * - `depart()`: sube hasta el navbar, recoge la estela, se divide en cuatro
 *   gotas y las entrega a la capa de llegada (`lib/kai/arrival`).
 *
 * Todo parte de la pose actual: entrar y salir del botón a medias continúa
 * desde donde está, sin reinicios.
 */
import { usePreferredReducedMotion, useResizeObserver } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import KaiCharacter from '@/components/kai/KaiCharacter.vue';
import { measureBar, playArrival } from '@/lib/kai/arrival';
import { SPLIT } from '@/lib/kai/stream';
import { subscribeTick } from '@/lib/kai/ticker';
import type { KaiEmergePhase, KaiState } from '@/lib/kai/types';
import { createTravelLayers } from './useTravelLayers';
import type { TravelLayers } from './useTravelLayers';

const emit = defineEmits<{
    phase: [phase: KaiEmergePhase | null];
}>();

/** Dirección del viaje: arriba a la derecha, hacia Kiub. */
const HEADING = -0.72;
/** Velocidades del entorno. */
const SPEED = { rest: 0.04, travel: 1, rush: 2.4, depart: 3.4 };

type KaiRef = InstanceType<typeof KaiCharacter>;

const root = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
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
/** Tras el relevo, las gotas ya son de la capa de llegada. */
const hidden = ref(false);
const lift = ref({ x: 0, y: 0, scale: 1 });

let layers: TravelLayers | null = null;
let unsubscribe: (() => void) | null = null;
let hovering = false;
let busy = false;
let errorTimer: number | undefined;
let launchedAt = 0;

useResizeObserver(root, ([entry]) => {
    width.value = entry.contentRect.width;
    height.value = entry.contentRect.height;
    layers?.resize(width.value, height.value);
});

function tick(dt: number) {
    layers?.frame(dt);
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

/* ── API ───────────────────────────────────────────────────────────── */

/** Cursor, foco o dedo sobre «Ingresar»: KAI comienza el viaje. */
function travel(on: boolean, target: Element | null = null) {
    hovering = on;

    if (busy || departing.value) {
        return;
    }

    if (appearing.value) {
        // Se aplica al terminar la aparición.
        return;
    }

    if (on) {
        gazeTo(target);
        window.setTimeout(() => {
            if (hovering && !busy) {
                kai.value?.lookAt(null);
            }
        }, 340);
        setState('travel');
        layers?.setSpeed(SPEED.travel);
    } else {
        kai.value?.lookAt(null);
        setState('idle');
        layers?.setSpeed(SPEED.rest);
    }
}

/** Envío del formulario: se comprime y se impulsa. */
function launch() {
    window.clearTimeout(errorTimer);
    busy = true;
    launchedAt = performance.now();

    if (appearing.value) {
        kai.value?.cancelEmerge();
        appearing.value = false;
    }

    kai.value?.lookAt(null);
    kai.value?.setHeading(HEADING);
    layers?.setHeading(HEADING);
    setState('rush');
    // El entorno acelera tras la compresión.
    window.setTimeout(() => {
        if (busy && !departing.value) {
            layers?.setSpeed(SPEED.rush);
        }
    }, 120);
}

/** Credenciales rechazadas: frena, vuelve junto al formulario y avisa. */
function fail(target: Element | null = null) {
    busy = false;
    layers?.setSpeed(SPEED.rest);
    setState('idle');
    window.clearTimeout(errorTimer);
    errorTimer = window.setTimeout(() => {
        setState('error');
        gazeTo(target);
    }, 480);
}

/** El usuario corrige: vuelve a la calma. */
function recover() {
    window.clearTimeout(errorTimer);

    if (state.value === 'error') {
        kai.value?.lookAt(null);
        setState(hovering ? 'travel' : 'idle');
    }
}

/** Mirar el campo que se está rellenando (o dejar de hacerlo). */
function watchField(el: Element | null) {
    if (busy || departing.value || appearing.value) {
        return;
    }

    if (state.value === 'travel') {
        return;
    }

    gazeTo(el);
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

function easeInOut(u: number): number {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/**
 * Acceso concedido: KAI sube hasta el navbar, se divide y entrega las
 * gotas a la capa de llegada. Se resuelve cuando esa capa ya cubre la
 * página (el destino puede montarse debajo).
 */
async function depart(background: string): Promise<void> {
    departing.value = true;
    busy = true;
    window.clearTimeout(errorTimer);

    // El impulso del clic se ve entero antes de salir.
    const since = performance.now() - launchedAt;

    if (!reduced.value && since < 450) {
        await sleep(450 - since);
    }

    const box = kaiBox.value?.getBoundingClientRect();
    const bar = measureBar();

    if (reduced.value || !box) {
        await kai.value?.emerge('split');
        void playArrival({ drops: [], background, reduced: true });

        return;
    }

    const from = {
        x: box.left + box.width / 2,
        y: box.top + box.height * (80 / 144),
    };
    const to = { x: bar.left + bar.width / 2, y: bar.top + bar.height / 2 };
    const heading = Math.atan2(to.y - from.y, to.x - from.x);

    // Gira hacia arriba y el entorno acelera: la estela apunta abajo. El
    // panel deja de recortarlo cuando ya se está desvaneciendo.
    kai.value?.setHeading(heading);
    layers?.setHeading(heading);
    layers?.setSpeed(SPEED.depart);
    await sleep(200);
    clipped.value = false;

    // Asciende: arranca con fuerza y frena al llegar arriba.
    const scale = Math.max(
        0.55,
        Math.min(0.85, (bar.height * 1.7) / (size.value * 0.69)),
    );
    await animate(760, (u) => {
        const e = easeInOut(u);
        lift.value = {
            x: (to.x - from.x) * e,
            y: (to.y - from.y) * e,
            scale: 1 + (scale - 1) * e,
        };
    });

    // Arriba: la estela regresa al cuerpo y se divide en cuatro gotas.
    setState('idle');
    kai.value?.lookAt(null);
    await sleep(260);
    void kai.value?.emerge('split');
    await sleep(SPLIT.handoff * 1000);

    const geometry = kai.value?.screenGeometry();
    const drops = (geometry?.drops ?? [])
        .filter((d) => d.color)
        .sort((a, b) => a.x - b.x)
        .map(({ x, y, r, color }) => ({ x, y, r, color }));

    // Relevo en el mismo fotograma: las gotas pasan a la capa de llegada.
    void playArrival({ drops, background });
    hidden.value = true;
}

function onEmergeEnd() {
    appearing.value = false;

    if (hovering && !busy) {
        travel(true);
    }
}

defineExpose({ travel, launch, fail, recover, watchField, depart });

onMounted(() => {
    if (canvas.value) {
        layers = createTravelLayers(canvas.value);
        layers.setHeading(HEADING);
        layers.setSpeed(reduced.value ? 0 : SPEED.rest);
        layers.resize(width.value || 1, height.value || 1);
    }

    kai.value?.setHeading(HEADING);
    void kai.value?.emerge('stream');
    startLoop();
});

onBeforeUnmount(() => {
    unsubscribe?.();
    window.clearTimeout(errorTimer);
});
</script>

<template>
    <div
        ref="root"
        class="kls"
        :class="{ 'is-departing': departing }"
        :data-kai-scene="state"
        :data-appearing="appearing || undefined"
    >
        <div class="kls-backdrop" aria-hidden="true">
            <canvas ref="canvas" class="kls-canvas" />
            <span class="kls-light" />
        </div>

        <div
            class="kls-kai-layer"
            :class="{ 'is-clipped': clipped }"
            aria-hidden="true"
        >
            <div
                ref="kaiBox"
                class="kls-kai"
                :class="{ 'is-hidden': hidden }"
                :style="{
                    transform: `translate(-50%, -${(80 / 144) * 100}%) translate(${lift.x}px, ${lift.y}px) scale(${lift.scale})`,
                }"
            >
                <KaiCharacter
                    ref="kai"
                    :size="size"
                    surface="dark"
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
    border-radius: inherit;
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
}

/* El panel: profundidad azul noche con luz que entra desde arriba. */
.kls-backdrop {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
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
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    transition: opacity 0.45s ease;
}

.kls-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

/* Halo bajo KAI: lo separa del fondo y da profundidad. */
.kls-light {
    position: absolute;
    top: 54%;
    left: 50%;
    width: 70%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(
        closest-side,
        rgba(140, 180, 255, 0.22),
        rgba(140, 180, 255, 0)
    );
    transform: translate(-50%, -50%);
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

.kls.is-departing .kls-backdrop {
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .kls-backdrop {
        transition: none;
    }
}
</style>
