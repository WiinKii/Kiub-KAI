/**
 * Guía de KAI: el contenido del chat guiado (sin IA).
 *
 * Cada sección de la intranet tiene un saludo y sus temas; algunos temas
 * están en todas. Un tema responde con uno o más globos, pasos numerados y
 * acciones: abrir otro tema, ir a una página o señalar un elemento de la
 * pantalla. KAI nunca hace las gestiones por el usuario: le guía.
 *
 * El contenido es de ejemplo: ajústalo a los módulos reales de Kiub.
 */

import type { KaiReaction } from './types';

export type KaiGuideAction =
    /** Abre otro tema. */
    | { kind: 'topic'; topic: string; label: string }
    /** Enlace a una página de la intranet. */
    | { kind: 'link'; href: string; label: string }
    /** Señala un elemento de la pantalla (selector CSS). */
    | { kind: 'show'; target: string; label: string };

export type KaiTourStep = { target: string; text: string };

export type KaiGuideTopic = {
    /** Lo que «pregunta» el usuario (texto del botón). */
    question: string;
    /** Lo que responde KAI: uno o más globos. */
    answer: string[];
    steps?: string[];
    actions?: KaiGuideAction[];
    /** Recorrido: KAI señala cada elemento por turnos. */
    tour?: KaiTourStep[];
    /** Palabras para el buscador. */
    keywords?: string[];
    /** Gesto de KAI al responder (por defecto, asentir). */
    gesture?: KaiReaction;
};

export type KaiGuideSection = {
    id: string;
    label: string;
    /** Prefijos de URL que corresponden a la sección. */
    paths: string[];
    /** Saludo al abrir el chat aquí. */
    greeting: string;
    topics: string[];
};

export type KaiGuide = {
    sections: KaiGuideSection[];
    topics: Record<string, KaiGuideTopic>;
    /** Temas disponibles en cualquier sección. */
    common: string[];
    /** Cuando el buscador no encuentra nada. */
    fallback: string;
};

/** Aviso que KAI enseña al abrir el chat. */
export type KaiNotice = {
    id: string;
    title: string;
    text?: string;
    href?: string;
};

const NAV = (key: string) => `[data-nav-key="${key}"]`;

export const KIUB_GUIDE: KaiGuide = {
    sections: [
        {
            id: 'inicio',
            label: 'Inicio',
            paths: ['/dashboard', '/'],
            greeting: 'Estás en Inicio, tu punto de partida. ¿En qué te ayudo?',
            topics: ['tour', 'buscar', 'avisos', 'modulos'],
        },
        {
            id: 'modulos',
            label: 'Módulos',
            paths: ['/modulos'],
            greeting:
                'Aquí están las herramientas de cada área. ¿Cuál necesitas?',
            topics: ['modulos', 'vacaciones', 'recibos', 'soporte'],
        },
        {
            id: 'rrhh',
            label: 'Recursos Humanos',
            paths: ['/rrhh', '/recursos-humanos'],
            greeting:
                'Estás en Recursos Humanos. Puedo guiarte en estas gestiones:',
            topics: ['vacaciones', 'recibos', 'datos', 'contacto-rrhh'],
        },
        {
            id: 'comunicaciones',
            label: 'Comunicaciones',
            paths: ['/comunicaciones'],
            greeting:
                'Estás en Comunicaciones, donde se publican los avisos oficiales de Kaizen Holdings.',
            topics: ['leer-comunicados', 'filtrar', 'publicar'],
        },
        {
            id: 'calendario',
            label: 'Calendario',
            paths: ['/calendario'],
            greeting: 'Estás en el Calendario. ¿Qué quieres hacer?',
            topics: ['ver-semana', 'recordatorio', 'sala'],
        },
    ],

    common: ['tour', 'contrasena', 'soporte', 'otras-secciones'],

    fallback:
        'Todavía no tengo una guía para eso. Prueba con otras palabras o elige una de estas opciones:',

    topics: {
        tour: {
            question: 'Hazme un recorrido rápido',
            answer: ['¡Vamos! Te enseño la barra de arriba, paso a paso.'],
            tour: [
                {
                    target: NAV('inicio'),
                    text: 'Inicio te devuelve siempre a tu panel.',
                },
                {
                    target: NAV('modulos'),
                    text: 'En Módulos están las herramientas de cada área: Recursos Humanos, IT y las que tu empresa active.',
                },
                {
                    target: NAV('comunicaciones'),
                    text: 'Comunicaciones reúne los avisos oficiales.',
                },
                {
                    target: NAV('calendario'),
                    text: 'En el Calendario ves eventos y reservas.',
                },
                {
                    target: '.kn-search-btn',
                    text: 'Con la lupa buscas cualquier cosa de la intranet.',
                },
                {
                    target: '.kn-bell',
                    text: 'La campana guarda tus notificaciones.',
                },
                {
                    target: '.kn-user',
                    text: 'Y aquí están tu perfil y tu configuración.',
                },
            ],
            keywords: ['recorrido', 'tour', 'empezar', 'nuevo', 'ayuda'],
            gesture: 'welcome',
        },
        buscar: {
            question: '¿Cómo busco algo?',
            answer: [
                'Usa la lupa de la barra de arriba: escribe lo que buscas y pulsa Enter.',
            ],
            actions: [
                {
                    kind: 'show',
                    target: '.kn-search-btn',
                    label: 'Muéstrame la lupa',
                },
            ],
            keywords: ['buscar', 'búsqueda', 'encontrar', 'lupa'],
        },
        avisos: {
            question: '¿Dónde veo mis notificaciones?',
            answer: [
                'Llegan a la campana de arriba a la derecha. Cuando tengo algo para ti, también te lo enseño yo con un globito.',
            ],
            actions: [
                {
                    kind: 'show',
                    target: '.kn-bell',
                    label: 'Muéstrame la campana',
                },
            ],
            keywords: ['avisos', 'notificaciones', 'campana', 'novedades'],
        },
        modulos: {
            question: '¿Qué son los Módulos?',
            answer: [
                'Cada área tiene su módulo: Recursos Humanos, IT Tecnología y los que tu empresa active. Se abren desde «Módulos», en la barra.',
            ],
            actions: [
                {
                    kind: 'show',
                    target: NAV('modulos'),
                    label: 'Muéstrame dónde',
                },
                {
                    kind: 'topic',
                    topic: 'vacaciones',
                    label: 'Pedir vacaciones',
                },
            ],
            keywords: ['modulos', 'módulo', 'herramientas', 'áreas'],
        },
        vacaciones: {
            question: 'Quiero pedir vacaciones',
            answer: ['Así se piden:'],
            steps: [
                'Abre Módulos → Recursos Humanos.',
                'Entra en «Vacaciones» y pulsa «Nueva solicitud».',
                'Elige las fechas: verás tus días disponibles.',
                'Envíala. Recibirás un aviso cuando tu responsable la revise.',
            ],
            actions: [
                {
                    kind: 'link',
                    href: '/rrhh/vacaciones',
                    label: 'Ir a Vacaciones',
                },
                {
                    kind: 'show',
                    target: NAV('modulos'),
                    label: 'Muéstrame Módulos',
                },
            ],
            keywords: [
                'vacaciones',
                'días libres',
                'permiso',
                'ausencia',
                'descanso',
            ],
        },
        recibos: {
            question: '¿Dónde está mi recibo de nómina?',
            answer: ['Tus recibos están en Recursos Humanos:'],
            steps: [
                'Abre Módulos → Recursos Humanos.',
                'Entra en «Mis recibos».',
                'Elige el mes y descárgalo en PDF.',
            ],
            actions: [
                {
                    kind: 'link',
                    href: '/rrhh/recibos',
                    label: 'Ir a Mis recibos',
                },
            ],
            keywords: ['nómina', 'recibo', 'sueldo', 'pago', 'salario'],
        },
        datos: {
            question: 'Actualizar mis datos personales',
            answer: ['Se hace desde tu perfil:'],
            steps: [
                'Abre tu perfil, arriba a la derecha.',
                'Entra en «Datos personales».',
                'Edita y guarda. Algunos cambios los revisa Recursos Humanos.',
            ],
            actions: [
                {
                    kind: 'show',
                    target: '.kn-user',
                    label: 'Muéstrame mi perfil',
                },
            ],
            keywords: ['datos', 'dirección', 'teléfono', 'perfil', 'cuenta'],
        },
        'contacto-rrhh': {
            question: '¿A quién pregunto en RRHH?',
            answer: [
                'Escribe al equipo de Recursos Humanos desde su módulo, en «Contacto». Si es urgente, habla con tu responsable directo.',
            ],
            keywords: ['rrhh', 'recursos humanos', 'contacto', 'pregunta'],
        },
        'leer-comunicados': {
            question: '¿Cómo leo los comunicados?',
            answer: [
                'Los más recientes salen arriba. Pulsa uno para leerlo completo; los que aún no has leído llevan un punto.',
            ],
            keywords: ['comunicados', 'noticias', 'leer', 'anuncios'],
        },
        filtrar: {
            question: 'Ver solo los de mi área',
            answer: [
                'Usa el filtro de áreas sobre la lista y elige la tuya. Se recordará la próxima vez.',
            ],
            keywords: ['filtrar', 'área', 'departamento'],
        },
        publicar: {
            question: '¿Puedo publicar un comunicado?',
            answer: [
                'Solo si tu perfil tiene permiso de publicación. En ese caso verás «Nuevo comunicado» sobre la lista.',
            ],
            keywords: ['publicar', 'escribir', 'comunicado', 'permiso'],
        },
        'ver-semana': {
            question: 'Ver los eventos de la semana',
            answer: [
                'Cambia la vista a «Semana» arriba del calendario. Los colores indican el tipo de evento.',
            ],
            keywords: ['eventos', 'semana', 'agenda', 'reuniones'],
        },
        recordatorio: {
            question: 'Crear un recordatorio',
            answer: ['Así se crea:'],
            steps: [
                'Pulsa sobre el día en el calendario.',
                'Elige «Recordatorio», escribe el título y la hora.',
                'Guárdalo: te llegará a la campana.',
            ],
            keywords: ['recordatorio', 'alarma', 'recordar', 'nota'],
        },
        sala: {
            question: 'Reservar una sala',
            answer: ['Las salas se reservan desde el Calendario:'],
            steps: [
                'Pulsa «Reservar sala».',
                'Elige la sala, el día y el horario libre.',
                'Confirma. La reserva aparecerá en tu calendario.',
            ],
            actions: [
                {
                    kind: 'link',
                    href: '/calendario/salas',
                    label: 'Ir a Salas',
                },
            ],
            keywords: ['sala', 'reservar', 'reunión', 'espacio'],
        },
        contrasena: {
            question: 'Cambiar mi contraseña',
            answer: ['Se cambia en tu configuración:'],
            steps: [
                'Abre tu perfil, arriba a la derecha.',
                'Entra en «Configuración» → «Contraseña».',
                'Escribe la actual y la nueva, y guarda.',
            ],
            actions: [
                {
                    kind: 'show',
                    target: '.kn-user',
                    label: 'Muéstrame mi perfil',
                },
            ],
            keywords: ['contraseña', 'clave', 'password', 'seguridad'],
        },
        soporte: {
            question: 'Tengo un problema técnico',
            answer: [
                'IT Tecnología te atiende desde su módulo: «Soporte» → «Nuevo ticket». Cuenta qué pasó y en qué pantalla; si puedes, añade una captura.',
            ],
            keywords: [
                'error',
                'falla',
                'no funciona',
                'soporte',
                'ticket',
                'it',
                'sistemas',
                'problema',
            ],
        },
        'otras-secciones': {
            question: 'Ver otras secciones',
            answer: ['¿De qué sección quieres saber?'],
            keywords: ['secciones', 'menú', 'navegar'],
        },
    },
};

/** Minúsculas y sin acentos, para comparar palabras. */
export function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

/** Sección que corresponde a una URL (la del prefijo más largo). */
export function sectionFromUrl(guide: KaiGuide, url: string): string {
    const path = url.split(/[?#]/)[0] || '/';
    let best = guide.sections[0]?.id ?? '';
    let length = -1;

    for (const section of guide.sections) {
        for (const prefix of section.paths) {
            const match =
                prefix === '/'
                    ? path === '/'
                    : path === prefix || path.startsWith(`${prefix}/`);

            if (match && prefix.length > length) {
                best = section.id;
                length = prefix.length;
            }
        }
    }

    return best;
}

/** Palabras que no dicen qué se busca. */
const STOPWORDS = new Set(
    'que como donde cuando quiero quisiera necesito para por los las del una uno unos mis tus con sin hay esta este esto puedo hacer algo ver tengo'.split(
        ' ',
    ),
);

/** Temas que encajan con lo escrito, de más a menos relevantes. */
export function searchGuide(
    guide: KaiGuide,
    query: string,
    limit = 4,
): string[] {
    const words = normalize(query)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 2 && !STOPWORDS.has(word));

    if (!words.length) {
        return [];
    }

    const scored: [string, number][] = [];

    for (const [id, topic] of Object.entries(guide.topics)) {
        const keywords = (topic.keywords ?? []).map(normalize);
        const question = normalize(topic.question);
        const answer = normalize(
            [...topic.answer, ...(topic.steps ?? [])].join(' '),
        );
        let score = 0;

        for (const word of words) {
            // Las palabras cortas («it») solo cuentan si coinciden enteras.
            const short = word.length < 3;
            const hit = keywords.some((k) =>
                short
                    ? k === word
                    : k.includes(word) || (k.length >= 4 && word.includes(k)),
            );

            if (hit) {
                score += 3;
            }

            if (!short && question.includes(word)) {
                score += 2;
            }

            if (!short && answer.includes(word)) {
                score += 1;
            }
        }

        if (score > 0) {
            scored.push([id, score]);
        }
    }

    return scored
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);
}
