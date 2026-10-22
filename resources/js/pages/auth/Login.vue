<script setup lang="ts">
/**
 * Inicio de sesión de Kiub.
 *
 * Usa la autenticación real del proyecto (Fortify: `store`, recordar
 * sesión, recuperar contraseña, passkeys y registro si están activos) y le
 * suma a KAI: aparece como una corriente, viaja al pasar por «Ingresar», se
 * impulsa al enviar y, si el acceso es correcto, sale disparado del
 * recuadro. Después el contenedor se aparta, la intranet presenta su navbar
 * y KAI llega a su sitio, abajo a la derecha.
 *
 * Para encadenar la salida con la página de destino, la respuesta de un
 * acceso correcto se retiene (interceptor de Inertia) hasta que la capa de
 * llegada cubre la pantalla; el destino se monta debajo, ya preparado.
 */
import { interceptors } from '@inertiajs/core';
import { Form, Head } from '@inertiajs/vue3';
import { AlertCircle } from '@lucide/vue';
import { usePreferredReducedMotion } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import InputError from '@/components/InputError.vue';
import KaiLoginScene from '@/components/kai/login/KaiLoginScene.vue';
import PasswordInput from '@/components/PasswordInput.vue';
import TextLink from '@/components/TextLink.vue';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import BareLayout from '@/layouts/BareLayout.vue';
import { beginDeparture, playArrival } from '@/lib/kai/arrival';
/* @chisel-registration */
import { register } from '@/routes';
/* @end-chisel-registration */
import { store } from '@/routes/login';
import { request } from '@/routes/password';
/* @chisel-passkeys */
import PasskeyVerify from '@/components/PasskeyVerify.vue';
/* @end-chisel-passkeys */

defineOptions({ layout: BareLayout });

defineProps<{
    status?: string;
    canResetPassword: boolean;
}>();

/** Fondo de la pantalla: la capa de llegada empieza con este mismo color. */
const BACKGROUND = '#eef1f5';
/** Límite de espera de la salida: nunca retiene la navegación más de esto. */
const MAX_HOLD = 7000;

const scene = ref<InstanceType<typeof KaiLoginScene> | null>(null);
const button = ref<HTMLButtonElement | null>(null);
/** Acceso concedido: KAI se va (el botón dice «Entrando…»). */
const entering = ref(false);
/** El contenedor se aparta antes de presentar la intranet. */
const leaving = ref(false);
const prefersReduced = usePreferredReducedMotion();
const reduced = computed(() => prefersReduced.value === 'reduce');
let submitting = false;
let offInterceptor: (() => void) | undefined;

function onStart() {
    submitting = true;
    scene.value?.launch();
}

function onError() {
    submitting = false;
    scene.value?.fail(button.value);
}

function onFinish() {
    submitting = false;
}

/* ── Interacción con «Ingresar» ─────────────────────────────────────── */
function onButtonEnter(event: PointerEvent) {
    if (event.pointerType !== 'touch') {
        scene.value?.travel(true, button.value);
    }
}

function onButtonLeave(event: PointerEvent) {
    if (
        event.pointerType !== 'touch' &&
        document.activeElement !== button.value
    ) {
        scene.value?.travel(false);
    }
}

// En táctil no hay hover: al apoyar el dedo empieza el viaje.
function onButtonDown(event: PointerEvent) {
    if (event.pointerType === 'touch') {
        scene.value?.travel(true, button.value);
    }
}

function onButtonCancel(event: PointerEvent) {
    if (event.pointerType === 'touch') {
        scene.value?.travel(false);
    }
}

function onButtonFocus() {
    if (button.value?.matches(':focus-visible')) {
        scene.value?.travel(true, button.value);
    }
}

function onButtonBlur() {
    if (!button.value?.matches(':hover')) {
        scene.value?.travel(false);
    }
}

/* ── Campos: KAI mira el que se rellena ─────────────────────────────── */
function onFocusIn(event: FocusEvent) {
    const target = event.target as HTMLElement | null;

    if (target?.matches('input')) {
        scene.value?.watchField(target);
    }
}

function onFocusOut() {
    scene.value?.watchField(null);
}

function onInput() {
    scene.value?.recover();
}

/* ── Salida hacia la página de destino ──────────────────────────────── */
function pageComponent(data: unknown): string | null {
    try {
        const page = typeof data === 'string' ? JSON.parse(data) : data;

        return typeof page?.component === 'string' ? page.component : null;
    } catch {
        return null;
    }
}

onMounted(() => {
    offInterceptor = interceptors.onVisitResponse(async (_visit, response) => {
        const component = pageComponent(response.data);

        // Solo el envío de este formulario y solo si sale de las páginas de
        // acceso (credenciales incorrectas vuelven aquí con errores).
        if (!submitting || !component || component.startsWith('auth/')) {
            return response;
        }

        entering.value = true;
        beginDeparture();

        await Promise.race([
            scene.value?.depart().catch(() => undefined),
            new Promise((resolve) => window.setTimeout(resolve, MAX_HOLD)),
        ]);

        // El contenedor se aparta y la capa de llegada toma el relevo con el
        // mismo color de fondo: el destino se monta debajo.
        leaving.value = true;
        await new Promise((resolve) =>
            window.setTimeout(resolve, reduced.value ? 150 : 420),
        );
        void playArrival({ background: BACKGROUND, reduced: reduced.value });

        return response;
    });
});

onBeforeUnmount(() => offInterceptor?.());
</script>

<template>
    <Head title="Iniciar sesión" />

    <div class="kl" :style="{ '--kl-bg': BACKGROUND }">
        <main class="kl-card" :class="{ 'is-leaving': leaving }">
            <section class="kl-scene" aria-label="KAI te da la bienvenida">
                <KaiLoginScene ref="scene" />
            </section>

            <section class="kl-panel">
                <div class="kl-form-wrap">
                    <header class="kl-head">
                        <div class="kl-brand"><AppLogo /></div>
                        <h1 class="kl-title">Bienvenido a Kiub</h1>
                        <p class="kl-subtitle">
                            Tu espacio para conectar con el grupo.
                        </p>
                    </header>

                    <div v-if="status" class="kl-status" role="status">
                        {{ status }}
                    </div>

                    <!-- @chisel-passkeys -->
                    <PasskeyVerify
                        label="Ingresar con passkey"
                        loading-label="Verificando…"
                        separator="o con tu correo"
                    />
                    <!-- @end-chisel-passkeys -->

                    <Form
                        v-bind="store.form()"
                        :reset-on-success="['password']"
                        v-slot="{ errors, processing }"
                        class="kl-form"
                        @start="onStart"
                        @error="onError"
                        @finish="onFinish"
                        @focusin="onFocusIn"
                        @focusout="onFocusOut"
                        @input="onInput"
                    >
                        <div
                            v-if="errors.email || errors.password"
                            class="kl-alert"
                            role="alert"
                        >
                            <AlertCircle class="kl-alert-icon" />
                            <span>
                                No pudimos iniciar sesión. Revisa tu correo y tu
                                contraseña.
                            </span>
                        </div>

                        <div class="kl-field">
                            <Label for="email" class="kl-label">
                                Correo electrónico
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                name="email"
                                required
                                v-focus
                                autocomplete="email"
                                placeholder="nombre@empresa.com"
                                class="kl-input"
                                :aria-invalid="
                                    errors.email ? 'true' : undefined
                                "
                                :aria-describedby="
                                    errors.email ? 'email-error' : undefined
                                "
                            />
                            <InputError
                                id="email-error"
                                :message="errors.email"
                            />
                        </div>

                        <div class="kl-field">
                            <Label for="password" class="kl-label">
                                Contraseña
                            </Label>
                            <PasswordInput
                                id="password"
                                name="password"
                                required
                                autocomplete="current-password"
                                placeholder="Tu contraseña"
                                class="kl-input"
                                :aria-invalid="
                                    errors.password ? 'true' : undefined
                                "
                            />
                            <InputError :message="errors.password" />
                        </div>

                        <div class="kl-row">
                            <Label for="remember" class="kl-remember">
                                <Checkbox id="remember" name="remember" />
                                <span>Recordarme</span>
                            </Label>
                            <TextLink
                                v-if="canResetPassword"
                                :href="request()"
                                class="kl-link"
                            >
                                ¿Olvidaste tu contraseña?
                            </TextLink>
                        </div>

                        <button
                            ref="button"
                            type="submit"
                            class="kl-submit"
                            :class="{ 'is-busy': processing || entering }"
                            :disabled="processing || entering"
                            :aria-busy="processing || entering"
                            data-test="login-button"
                            @pointerenter="onButtonEnter"
                            @pointerleave="onButtonLeave"
                            @pointerdown="onButtonDown"
                            @pointercancel="onButtonCancel"
                            @focus="onButtonFocus"
                            @blur="onButtonBlur"
                        >
                            <span class="kl-submit-sheen" aria-hidden="true" />
                            <span class="kl-submit-label">
                                <Spinner
                                    v-if="processing || entering"
                                    class="kl-spinner"
                                />
                                {{
                                    entering
                                        ? 'Entrando…'
                                        : processing
                                          ? 'Validando…'
                                          : 'Ingresar'
                                }}
                            </span>
                        </button>

                        <!-- @chisel-registration -->
                        <p class="kl-register">
                            ¿Aún no tienes cuenta?
                            <TextLink :href="register()" class="kl-link">
                                Crear una cuenta
                            </TextLink>
                        </p>
                        <!-- @end-chisel-registration -->
                    </Form>
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
.kl {
    --kl-ink: #151924;
    --kl-ink-2: #4a5263;
    --kl-ink-3: #7a8394;
    --kl-mist: #a9c1d3;
    --kl-blue: #5c9dff;
    --kl-line: #dfe5ec;
    --kl-field: #f6f8fb;
    --kl-danger: #d64545;

    display: grid;
    place-items: center;
    min-height: 100vh;
    min-height: 100dvh;
    padding: 24px;
    background: var(--kl-bg);
    color: var(--kl-ink);
    font-family:
        'Raleway Variable', Raleway, ui-sans-serif, system-ui, sans-serif;
}

/* Contenedor blanco: la escena a la izquierda y el formulario a la derecha. */
.kl-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: 14px;
    width: min(1120px, 100%);
    min-height: min(700px, calc(100dvh - 48px));
    padding: 14px;
    border-radius: 36px;
    isolation: isolate;
}

.kl-card::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: #ffffff;
    box-shadow:
        0 1px 2px rgba(21, 25, 36, 0.04),
        0 24px 60px -28px rgba(21, 25, 36, 0.28);
    content: '';
    transition: opacity 0.45s ease;
}

.kl-scene {
    position: relative;
    min-height: 420px;
    border-radius: 28px;
    --kls-radius: 28px;
}

.kl-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 48px;
    transition:
        opacity 0.4s ease,
        transform 0.5s ease;
}

.kl-form-wrap {
    width: 100%;
    max-width: 400px;
}

.kl-head {
    margin-bottom: 28px;
}

.kl-brand {
    display: flex;
    align-items: center;
    margin-bottom: 28px;
    color: var(--kl-ink);
}

.kl-title {
    margin: 0;
    font-size: clamp(28px, 3vw, 34px);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
}

.kl-subtitle {
    margin: 10px 0 0;
    color: var(--kl-ink-3);
    font-size: 16px;
    font-weight: 500;
}

.kl-status {
    margin-bottom: 18px;
    padding: 10px 14px;
    border-radius: 12px;
    background: #e8f6ee;
    color: #1d7a45;
    font-size: 14px;
    font-weight: 600;
}

.kl-form {
    display: grid;
    gap: 18px;
}

.kl-alert {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 14px;
    border: 1px solid rgba(214, 69, 69, 0.22);
    border-radius: 14px;
    background: #fdf1f1;
    color: #9f2f2f;
    font-size: 14px;
    font-weight: 600;
    animation: kl-shake 0.42s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.kl-alert-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 1px;
}

.kl-field {
    display: grid;
    gap: 8px;
}

.kl-label {
    color: var(--kl-ink);
    font-size: 13px;
    font-weight: 700;
}

.kl-field :deep(.kl-input) {
    height: 50px;
    padding: 0 16px;
    border: 1px solid var(--kl-line);
    border-radius: 14px;
    background: var(--kl-field);
    color: var(--kl-ink);
    font-size: 15px;
    font-weight: 500;
    box-shadow: none;
    transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease;
}

.kl-field :deep(.kl-input::placeholder) {
    color: #9aa3b2;
}

.kl-field :deep(.kl-input:hover) {
    border-color: #c9d4e0;
}

.kl-field :deep(.kl-input:focus-visible) {
    border-color: var(--kl-blue);
    background: #ffffff;
    outline: none;
    box-shadow: 0 0 0 4px rgba(92, 157, 255, 0.2);
}

.kl-field :deep(.kl-input[aria-invalid='true']) {
    border-color: var(--kl-danger);
    background: #fffafa;
}

.kl-field :deep(.kl-input[aria-invalid='true']:focus-visible) {
    box-shadow: 0 0 0 4px rgba(214, 69, 69, 0.16);
}

.kl-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
}

.kl-remember {
    display: inline-flex;
    gap: 10px;
    align-items: center;
    color: var(--kl-ink-2);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
}

.kl-link {
    color: #2f6fd6;
    font-size: 14px;
    font-weight: 700;
    text-decoration: none;
}

.kl-link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
}

/* «Ingresar»: el brillo cruza el botón cuando KAI empieza el viaje. */
.kl-submit {
    position: relative;
    height: 54px;
    margin-top: 6px;
    overflow: hidden;
    border: 0;
    border-radius: 16px;
    background: linear-gradient(135deg, #6aa6ff 0%, #4a86f0 100%);
    color: #ffffff;
    font: inherit;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.01em;
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 10px 24px -12px rgba(74, 134, 240, 0.7);
    cursor: pointer;
    transition:
        transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
        box-shadow 0.25s ease,
        filter 0.2s ease;
}

.kl-submit:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 14px 28px -12px rgba(74, 134, 240, 0.8);
}

.kl-submit:active:not(:disabled) {
    transform: translateY(1px) scale(0.985);
}

.kl-submit:focus-visible {
    outline: 3px solid var(--kl-blue);
    outline-offset: 3px;
}

.kl-submit:disabled {
    cursor: progress;
}

.kl-submit-sheen {
    position: absolute;
    inset: 0;
    background: linear-gradient(
        105deg,
        transparent 30%,
        rgba(255, 255, 255, 0.5) 48%,
        transparent 66%
    );
    transform: translateX(-110%);
    pointer-events: none;
}

.kl-submit:hover .kl-submit-sheen,
.kl-submit:focus-visible .kl-submit-sheen {
    transform: translateX(110%);
    transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s;
}

/* Validando: un pulso de luz recorre el botón mientras KAI viaja. */
.kl-submit.is-busy .kl-submit-sheen {
    animation: kl-sheen 1.1s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

.kl-submit-label {
    position: relative;
    display: inline-flex;
    gap: 10px;
    align-items: center;
    justify-content: center;
}

.kl-spinner {
    width: 18px;
    height: 18px;
}

.kl-register {
    margin: 4px 0 0;
    color: var(--kl-ink-3);
    font-size: 14px;
    font-weight: 500;
    text-align: center;
}

/* Salida: KAI ya se fue; el contenedor entero se aparta con suavidad. */
.kl-card {
    transition:
        opacity 0.4s ease,
        transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.kl-card.is-leaving {
    opacity: 0;
    transform: scale(0.985) translateY(6px);
}

@keyframes kl-sheen {
    from {
        transform: translateX(-110%);
    }

    to {
        transform: translateX(110%);
    }
}

@keyframes kl-shake {
    20%,
    60% {
        transform: translateX(-4px);
    }

    40%,
    80% {
        transform: translateX(4px);
    }
}

/* Una columna: la escena arriba, más baja. */
@media (max-width: 899.98px) {
    .kl {
        padding: 12px;
        place-items: start center;
    }

    .kl-card {
        grid-template-columns: 1fr;
        min-height: 0;
        padding: 10px;
        border-radius: 28px;
    }

    .kl-scene {
        height: clamp(210px, 32vh, 280px);
        min-height: 0;
        border-radius: 20px;
        --kls-radius: 20px;
    }

    .kl-panel {
        padding: 22px 14px 18px;
    }

    .kl-head {
        margin-bottom: 22px;
    }

    .kl-brand {
        margin-bottom: 18px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .kl-alert,
    .kl-submit.is-busy .kl-submit-sheen {
        animation: none;
    }

    .kl-submit,
    .kl-submit:hover .kl-submit-sheen,
    .kl-panel,
    .kl-card::before {
        transition: none;
    }
}
</style>
