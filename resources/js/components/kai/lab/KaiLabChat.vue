<script setup lang="ts">
/**
 * Sección del laboratorio para probar el chat guiado del KAI flotante:
 * simular la sección de la intranet, recibir avisos y ver qué haría cada
 * enlace (en el laboratorio no se navega).
 */
import { useId } from 'vue';
import type { KaiGuideSection, KaiNotice } from '@/lib/kai/guide';

defineProps<{
    sections: KaiGuideSection[];
    notices: KaiNotice[];
    dockOn: boolean;
    events: string[];
}>();

const section = defineModel<string>('section', { required: true });

const emit = defineEmits<{
    open: [];
    notify: [];
    clear: [];
}>();

const uid = useId();
</script>

<template>
    <section class="klch" :aria-labelledby="`${uid}-title`">
        <h2 :id="`${uid}-title`" class="klch-title">Chat guiado (sin IA)</h2>
        <p class="klch-hint">
            Pulsa a KAI, abajo a la derecha, para abrir su ayuda. Saluda según
            la sección de la intranet, explica cómo usar módulos y servicios,
            busca por palabras y señala elementos de la pantalla. El contenido
            es de ejemplo y se edita en <code>lib/kai/guide.ts</code>.
        </p>

        <div class="klch-card">
            <fieldset class="klch-fieldset">
                <legend class="klch-legend">Simular que estoy en</legend>
                <div class="klch-segment">
                    <label class="klch-segment-item">
                        <input
                            v-model="section"
                            type="radio"
                            :name="`${uid}-section`"
                            value=""
                            data-chat-section=""
                        />
                        <span>Según la URL</span>
                    </label>
                    <label
                        v-for="item in sections"
                        :key="item.id"
                        class="klch-segment-item"
                    >
                        <input
                            v-model="section"
                            type="radio"
                            :name="`${uid}-section`"
                            :value="item.id"
                            :data-chat-section="item.id"
                        />
                        <span>{{ item.label }}</span>
                    </label>
                </div>
            </fieldset>

            <div class="klch-row">
                <button
                    type="button"
                    class="klch-button klch-button--primary"
                    data-chat-open
                    @click="emit('open')"
                >
                    Abrir el chat
                </button>
                <button
                    type="button"
                    class="klch-button"
                    data-notify
                    @click="emit('notify')"
                >
                    Simular un aviso
                </button>
                <button
                    type="button"
                    class="klch-button"
                    data-clear-notices
                    :disabled="!notices.length"
                    @click="emit('clear')"
                >
                    Quitar avisos ({{ notices.length }})
                </button>
            </div>

            <p v-if="!dockOn" class="klch-note">
                El KAI flotante está oculto: al abrir el chat se mostrará.
            </p>
            <p class="klch-note">
                Prueba «Hazme un recorrido rápido» (KAI señala cada parte de la
                barra) o escribe «vacaciones», «contraseña» o «IT».
            </p>

            <div v-if="events.length" class="klch-events">
                <h3 class="klch-events-title">Enlaces pulsados</h3>
                <ul class="klch-events-list" aria-live="polite">
                    <li v-for="(event, i) in events" :key="`${i}-${event}`">
                        {{ event }}
                    </li>
                </ul>
            </div>
        </div>
    </section>
</template>

<style scoped>
.klch {
    display: grid;
    gap: 12px;
}

.klch-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--kl-ink);
}

.klch-hint {
    margin: -6px 0 0;
    max-width: 66ch;
    font-size: 14px;
    color: var(--kl-ink-3);
}

.klch-hint code {
    font-size: 13px;
}

.klch-card {
    display: grid;
    gap: 16px;
    max-width: 760px;
    padding: 22px;
    border: 1px solid var(--kl-line);
    border-radius: 22px;
    background: var(--kl-surface);
    box-shadow: 0 14px 34px -22px rgba(21, 25, 36, 0.35);
}

.klch-fieldset {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
}

.klch-legend {
    margin-bottom: 8px;
    padding: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--kl-ink-2);
}

.klch-segment {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.klch-segment-item {
    position: relative;
}

.klch-segment-item input {
    position: absolute;
    opacity: 0;
}

.klch-segment-item span {
    display: inline-block;
    padding: 6px 12px;
    border: 1px solid var(--kl-line);
    border-radius: 999px;
    background: var(--kl-surface-2);
    color: var(--kl-ink-2);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
        background 0.2s,
        color 0.2s,
        border-color 0.2s;
}

.klch-segment-item input:checked + span {
    border-color: var(--kl-blue);
    background: var(--kl-blue);
    color: #ffffff;
}

.klch-segment-item input:focus-visible + span {
    outline: 3px solid var(--kl-focus);
    outline-offset: 2px;
}

.klch-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.klch-button {
    padding: 8px 14px;
    border: 1px solid var(--kl-line);
    border-radius: 999px;
    background: var(--kl-surface-2);
    color: var(--kl-ink);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
}

.klch-button:hover:not(:disabled) {
    border-color: var(--kl-blue);
}

.klch-button:disabled {
    opacity: 0.5;
    cursor: default;
}

.klch-button:focus-visible {
    outline: 3px solid var(--kl-focus);
    outline-offset: 2px;
}

.klch-button--primary {
    border-color: var(--kl-blue);
    background: var(--kl-blue);
    color: #ffffff;
}

.klch-note {
    margin: 0;
    font-size: 13px;
    color: var(--kl-ink-3);
}

.klch-events {
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--kl-surface-2);
}

.klch-events-title {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--kl-ink-2);
}

.klch-events-list {
    display: grid;
    gap: 4px;
    margin: 0;
    padding-left: 1.1em;
    font-size: 13px;
    color: var(--kl-ink-2);
}
</style>
