/**
 * Secuencias de demostración del laboratorio.
 *
 * Los procesos son SIMULADOS (una espera), pero pasan por `track()`, la misma
 * API que usará una operación real: KAI trabaja mientras la promesa está
 * pendiente y reacciona solo cuando se resuelve.
 */
import { onBeforeUnmount, ref } from 'vue';
import type { KaiController, KaiReaction, KaiState } from '@/lib/kai/types';

export type SequenceStep =
    | { kind: 'state'; state: KaiState; hold: number; note: string }
    | { kind: 'react'; reaction: KaiReaction; next?: KaiState; note: string }
    | {
          kind: 'process';
          duration: number;
          outcome: 'success' | 'error';
          note: string;
      };

export type Sequence = { id: string; label: string; steps: SequenceStep[] };

export const SEQUENCES: Sequence[] = [
    {
        id: 'main',
        label: 'Demostración principal',
        steps: [
            {
                kind: 'react',
                reaction: 'welcome',
                next: 'attentive',
                note: 'Bienvenida',
            },
            {
                kind: 'state',
                state: 'attentive',
                hold: 1600,
                note: 'Atiende a la interacción',
            },
            {
                kind: 'process',
                duration: 2600,
                outcome: 'success',
                note: 'Procesando (simulado)',
            },
            {
                kind: 'state',
                state: 'idle',
                hold: 600,
                note: 'Vuelve a reposo',
            },
        ],
    },
    {
        id: 'recovery',
        label: 'Alternativa: duda y error',
        steps: [
            {
                kind: 'react',
                reaction: 'welcome',
                next: 'attentive',
                note: 'Bienvenida',
            },
            { kind: 'state', state: 'attentive', hold: 1200, note: 'Atiende' },
            { kind: 'state', state: 'thinking', hold: 1800, note: 'Piensa' },
            {
                kind: 'state',
                state: 'doubt',
                hold: 2400,
                note: 'Necesita información',
            },
            {
                kind: 'state',
                state: 'waiting',
                hold: 2000,
                note: 'Espera la respuesta',
            },
            {
                kind: 'process',
                duration: 2000,
                outcome: 'error',
                note: 'Procesando… falla (simulado)',
            },
            {
                kind: 'state',
                state: 'error',
                hold: 2600,
                note: 'Error recuperable: propone reintentar',
            },
            {
                kind: 'process',
                duration: 1800,
                outcome: 'success',
                note: 'Reintento (simulado)',
            },
            {
                kind: 'state',
                state: 'idle',
                hold: 600,
                note: 'Vuelve a reposo',
            },
        ],
    },
];

const STRESS_STATES: KaiState[] = [
    'attentive',
    'curious',
    'thinking',
    'working',
    'doubt',
    'error',
    'waiting',
    'idle',
];
const STRESS_REACTIONS: KaiReaction[] = ['welcome', 'success', 'surprised'];

/** Cambios rápidos y aleatorios para comprobar las interrupciones. */
export function stressSequence(count = 16): Sequence {
    const steps: SequenceStep[] = [];

    for (let i = 0; i < count; i++) {
        if (i % 3 === 1) {
            const reaction =
                STRESS_REACTIONS[
                    Math.floor(Math.random() * STRESS_REACTIONS.length)
                ];
            steps.push({
                kind: 'react',
                reaction,
                note: `Interrupción ${i + 1}/${count}`,
            });
        } else {
            const state =
                STRESS_STATES[Math.floor(Math.random() * STRESS_STATES.length)];
            steps.push({
                kind: 'state',
                state,
                hold: 160 + Math.random() * 260,
                note: `Interrupción ${i + 1}/${count}`,
            });
        }
    }

    steps.push({
        kind: 'state',
        state: 'idle',
        hold: 400,
        note: 'Vuelve a reposo',
    });

    return { id: 'stress', label: 'Prueba de interrupciones', steps };
}

export function useKaiSequence(getKai: () => KaiController | null) {
    const running = ref<string | null>(null);
    const caption = ref('');
    const progress = ref({ index: 0, total: 0 });
    let token = 0;
    let timer: number | undefined;
    let processTimer: number | undefined;
    let wake: (() => void) | null = null;

    function wait(ms: number, current: number): Promise<boolean> {
        return new Promise((resolve) => {
            wake = () => resolve(false);
            timer = window.setTimeout(() => {
                wake = null;
                resolve(current === token);
            }, ms);
        });
    }

    function stop() {
        token++;
        window.clearTimeout(timer);
        // El proceso simulado se abandona sin resolverse: así no llega un
        // resultado tardío cuando ya se está probando otra cosa.
        window.clearTimeout(processTimer);
        wake?.();
        wake = null;
        running.value = null;
        caption.value = '';
    }

    async function run(sequence: Sequence) {
        stop();
        const current = token;
        running.value = sequence.id;
        progress.value = { index: 0, total: sequence.steps.length };

        for (const [index, step] of sequence.steps.entries()) {
            const kai = getKai();

            if (!kai || current !== token) {
                return;
            }

            progress.value = { index: index + 1, total: sequence.steps.length };
            caption.value = step.note;

            if (step.kind === 'state') {
                kai.setState(step.state);

                if (!(await wait(step.hold, current))) {
                    return;
                }
            } else if (step.kind === 'react') {
                // En la prueba de estrés no se espera al final del gesto.
                const done = kai.react(step.reaction, { next: step.next });

                if (sequence.id === 'stress') {
                    if (!(await wait(220 + Math.random() * 300, current))) {
                        return;
                    }
                } else {
                    await done;
                }
            } else {
                const simulated = new Promise<void>((resolve, reject) => {
                    processTimer = window.setTimeout(
                        () =>
                            step.outcome === 'success'
                                ? resolve()
                                : reject(new Error('Fallo simulado')),
                        step.duration,
                    );
                });

                try {
                    await kai.track(simulated, { next: 'idle' });
                    // Deja ver la celebración antes del siguiente paso.
                    await wait(2100, current);
                } catch {
                    // El error es parte de la demostración: KAI ya está en «error».
                }
            }

            if (current !== token) {
                return;
            }
        }

        if (current === token) {
            running.value = null;
            caption.value = '';
        }
    }

    onBeforeUnmount(stop);

    return { running, caption, progress, run, stop };
}
