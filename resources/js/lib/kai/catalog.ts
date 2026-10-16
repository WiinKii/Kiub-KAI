/**
 * Nombres y descripciones de los estados de KAI para la interfaz.
 */

import type { KaiReaction, KaiState } from './types';

export type CatalogEntry = { label: string; description: string };

export const STATE_CATALOG: Record<KaiState, CatalogEntry> = {
    idle: {
        label: 'Reposo',
        description:
            'Flota y respira; le salen lóbulos y una gotita brota arriba y vuelve.',
    },
    attentive: {
        label: 'Atento',
        description: 'Mira hacia la interacción y después inclina el cuerpo.',
    },
    curious: {
        label: 'Curioso',
        description: 'Se estira hacia un lado y asoma un lóbulo.',
    },
    thinking: {
        label: 'Pensando',
        description: 'Ondula despacio; una gota sube como una idea y vuelve.',
    },
    working: {
        label: 'Trabajando',
        description: 'Ojos cerrados, el contorno hierve y dos motas giran.',
    },
    loading: {
        label: 'Cargando',
        description: 'Se divide en una fila de gotas que laten en onda.',
    },
    doubt: {
        label: 'Duda',
        description: 'Inclinación lateral y mirada interrogativa, contenida.',
    },
    error: {
        label: 'Error recuperable',
        description: 'Retrocede con suavidad y queda atento a la solución.',
    },
    waiting: {
        label: 'Esperando',
        description: 'Se sienta sobre dos patitas y mira con calma.',
    },
    content: {
        label: 'Contento',
        description: 'Ojos «◡◡», rubor y una nube de lóbulos que se mece.',
    },
    music: {
        label: 'Escuchando música',
        description: 'Se balancea al ritmo y le salen notas.',
    },
    sleeping: {
        label: 'Dormido',
        description: 'Respira hondo, se asienta y suelta zetas.',
    },
    shy: {
        label: 'Tímido',
        description: 'Se encoge, se sonroja y mira de reojo.',
    },
};

export const REACTION_CATALOG: Record<KaiReaction, CatalogEntry> = {
    welcome: {
        label: 'Bienvenida',
        description: 'Le sale una manita que se desprende, saluda y guiña.',
    },
    success: {
        label: 'Alegre / éxito',
        description: 'Salto elástico, manitas que se agitan y destellos.',
    },
    surprised: {
        label: 'Sorprendido',
        description: 'Estiramiento vertical, ojos muy abiertos y boca «o».',
    },
    dance: {
        label: 'Baile',
        description: 'Brazos que giran con el balanceo y se desplaza.',
    },
    love: {
        label: 'Encantado',
        description: 'Ojos de corazón, rubor y corazones que suben.',
    },
    giggle: {
        label: 'Cosquillas',
        description: 'Se sacude de risa (también al pulsarlo).',
    },
    idea: {
        label: '¡Idea!',
        description: 'Una gota salta por arriba y vuelve como antena.',
    },
    dizzy: {
        label: 'Mareado',
        description: 'Ojos de espiral y estrellas (da vueltas con el cursor).',
    },
    explore: {
        label: 'Explorar',
        description: 'Viaja a un lado con una gota rezagada y vuelve.',
    },
    yawn: {
        label: 'Bostezo',
        description: 'Se estira hacia arriba con la boca muy abierta.',
    },
    boing: {
        label: 'Rebote',
        description: 'Aplastamiento y estiramiento rápido.',
    },
};

export const KAI_STATES = Object.keys(STATE_CATALOG) as KaiState[];

export const KAI_REACTIONS = Object.keys(REACTION_CATALOG) as KaiReaction[];

/** Agrupación para el laboratorio. */
export const STATE_GROUPS: { label: string; states: KaiState[] }[] = [
    {
        label: 'Interacción',
        states: [
            'idle',
            'attentive',
            'curious',
            'thinking',
            'working',
            'loading',
            'doubt',
            'error',
            'waiting',
        ],
    },
    { label: 'Emociones', states: ['content', 'music', 'sleeping', 'shy'] },
];
