/**
 * Nombres y descripciones de los estados de KAI para la interfaz.
 */

import type { KaiReaction, KaiState } from './types';

export type CatalogEntry = { label: string; description: string };

export const STATE_CATALOG: Record<KaiState, CatalogEntry> = {
    idle: {
        label: 'Reposo',
        description: 'Casi circular, respiración suave y parpadeo ocasional.',
    },
    attentive: {
        label: 'Atento',
        description: 'Mira hacia la interacción y después inclina el cuerpo.',
    },
    curious: {
        label: 'Curioso',
        description: 'Se estira hacia un lado; un ojo algo mayor que el otro.',
    },
    thinking: {
        label: 'Pensando',
        description: 'Ondulación lenta del contorno y mirada hacia arriba.',
    },
    working: {
        label: 'Trabajando',
        description: 'Pulso regular y concentrado hasta recibir un resultado.',
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
        label: 'Esperando al usuario',
        description: 'Se asienta y mira con calma, sin insistir.',
    },
};

export const REACTION_CATALOG: Record<KaiReaction, CatalogEntry> = {
    welcome: {
        label: 'Bienvenida',
        description: 'Se comprime, asciende en un saludo y se asienta.',
    },
    success: {
        label: 'Alegre / éxito',
        description: 'Anticipación, salto elástico y ojos curvados.',
    },
    surprised: {
        label: 'Sorprendido',
        description: 'Estiramiento vertical breve y ojos más abiertos.',
    },
};

export const KAI_STATES = Object.keys(STATE_CATALOG) as KaiState[];

export const KAI_REACTIONS = Object.keys(REACTION_CATALOG) as KaiReaction[];
