<script setup lang="ts">
import { useId } from 'vue';
import KaiCharacter from '@/components/kai/KaiCharacter.vue';
import type { KaiController, KaiReaction, KaiState } from '@/lib/kai/types';
import type { LabSettings } from './settings';

defineProps<{ state: KaiState; settings: LabSettings }>();

const uid = useId();

const sizes = [
    { key: 'sm', label: 'Pequeño', px: 40 },
    { key: 'md', label: 'Mediano', px: 96 },
    { key: 'lg', label: 'Grande', px: 200 },
] as const;

const surfaces = [
    { key: 'light', label: 'Fondo claro' },
    { key: 'dark', label: 'Fondo oscuro' },
] as const;

const controllers = new Map<string, KaiController>();

function bind(id: string) {
    return (el: unknown) => {
        if (el) {
            controllers.set(id, el as KaiController);
        } else {
            controllers.delete(id);
        }
    };
}

/** Repite en todas las copias el gesto del protagonista. */
function react(name: KaiReaction) {
    controllers.forEach((kai) => void kai.react(name));
}

function blink() {
    controllers.forEach((kai) => kai.blink());
}

defineExpose({ react, blink });
</script>

<template>
    <section class="kls" :aria-labelledby="`${uid}-title`">
        <h2 :id="`${uid}-title`" class="kls-title">Tamaños y fondos</h2>
        <p class="kls-hint">
            Replican el estado y los gestos del protagonista. En tamaños
            pequeños el movimiento se contiene automáticamente.
        </p>
        <div class="kls-rows">
            <div
                v-for="surface in surfaces"
                :key="surface.key"
                class="kls-row"
                :data-surface="surface.key"
            >
                <span class="kls-surface">{{ surface.label }}</span>
                <figure v-for="size in sizes" :key="size.key" class="kls-item">
                    <KaiCharacter
                        :ref="bind(`${surface.key}-${size.key}`)"
                        :state="state"
                        :size="size.px"
                        :surface="surface.key"
                        :paused="settings.paused"
                        :reduced-motion="settings.motion"
                        :intensity="settings.intensity"
                        :time-scale="settings.timeScale"
                        :colors="settings.colors"
                        :mouth="settings.mouth"
                        :blush="settings.blush"
                        :ambient="settings.ambient"
                        :debug="settings.debug"
                    />
                    <figcaption>{{ size.label }} · {{ size.px }} px</figcaption>
                </figure>
            </div>
        </div>
    </section>
</template>

<style scoped>
.kls {
    display: grid;
    gap: 12px;
}

.kls-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--kl-ink);
}

.kls-hint {
    margin: -6px 0 0;
    max-width: 60ch;
    font-size: 14px;
    color: var(--kl-ink-3);
}

.kls-rows {
    display: grid;
    gap: 10px;
}

.kls-row {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-around;
    gap: 24px;
    padding: 64px 20px 18px;
    border-radius: 22px;
    background: var(--kl-stage-light);
    color: #3f4859;
}

.kls-row[data-surface='dark'] {
    background: var(--kl-stage-dark);
    color: #a9b4c4;
}

.kls-surface {
    position: absolute;
    top: 14px;
    left: 18px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.kls-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin: 0;
}

.kls-item figcaption {
    font-size: 12px;
    font-weight: 600;
}
</style>
