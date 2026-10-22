/**
 * Llegada a la intranet después de iniciar sesión.
 *
 * KAI ya salió disparado del recuadro del inicio de sesión. Un telón del
 * mismo color que esa página cubre el cambio de página: Inertia monta el
 * destino debajo y, en cuanto el navbar existe, `AppHeader` lo presenta con
 * su animación de creación (aviso `kiub:navbar-ready`). El contenido se
 * descubre después y, por último, KAI llega a su sitio abajo a la derecha
 * entrando desde el borde derecho de la pantalla (aviso `kiub:kai-arrive`,
 * que escucha `KaiDock`).
 *
 * Vive fuera de Vue (un elemento sobre `<body>`) para sobrevivir al cambio
 * de página.
 */

export const ARRIVAL = {
    /** El contenido se descubre tras empezar el navbar (s). */
    contentDelay: 0.5,
    contentFade: 0.55,
    /** KAI entra desde la derecha tras empezar el navbar (s). */
    kaiAt: 1.05,
    /** Espera máxima a que exista el navbar (s). */
    waitBar: 4,
};

export const NAVBAR_READY_EVENT = 'kiub:navbar-ready';
export const KAI_ARRIVE_EVENT = 'kiub:kai-arrive';

export type ArrivalOptions = {
    /** Color del fondo de la página de origen: el telón empieza igual. */
    background: string;
    reduced?: boolean;
};

let pending = false;
let kaiPending = false;
const readyListeners = new Set<() => void>();
const kaiListeners = new Set<() => void>();

/** `true` mientras una llegada está en curso (el navbar debe esperar). */
export function arrivalPending(): boolean {
    return pending;
}

/** `true` si KAI aún debe llegar a su sitio (el KAI flotante espera fuera). */
export function kaiArrivalPending(): boolean {
    return kaiPending;
}

/**
 * Para `AppHeader`: avisa cuando debe presentar el navbar. Devuelve una
 * función para dejar de escuchar.
 */
export function onNavbarReady(listener: () => void): () => void {
    readyListeners.add(listener);

    return () => readyListeners.delete(listener);
}

/** Para `KaiDock`: avisa cuando KAI debe entrar a su sitio. */
export function onKaiArrive(listener: () => void): () => void {
    kaiListeners.add(listener);

    return () => kaiListeners.delete(listener);
}

function announce(listeners: Set<() => void>, event: string): void {
    for (const listener of listeners) {
        listener();
    }

    window.dispatchEvent(new CustomEvent(event));
}

function smooth(u: number): number {
    const x = u < 0 ? 0 : u > 1 ? 1 : u;

    return x * x * (3 - 2 * x);
}

let active: { cancel: () => void } | null = null;
let quiet: HTMLStyleElement | null = null;

/**
 * Desde que KAI sale, el viaje es el indicador de progreso: se oculta la
 * barra de carga de Inertia hasta que termina la llegada.
 */
export function beginDeparture(): void {
    if (!quiet) {
        quiet = document.createElement('style');
        quiet.textContent = '#nprogress { display: none !important; }';
        document.head.appendChild(quiet);
        // Nunca para siempre: si la llegada no llega a empezar, vuelve.
        window.setTimeout(() => {
            if (!pending) {
                endDeparture();
            }
        }, 12000);
    }
}

function endDeparture(): void {
    quiet?.remove();
    quiet = null;
}

/**
 * Cubre el cambio de página y presenta la intranet: navbar, contenido y
 * KAI. Se resuelve cuando termina. Llamarla de nuevo cancela la anterior.
 */
export function playArrival({
    background,
    reduced = false,
}: ArrivalOptions): Promise<void> {
    active?.cancel();
    pending = true;
    kaiPending = true;

    const backdrop = document.createElement('div');
    backdrop.className = 'kiub-arrival';
    backdrop.setAttribute('aria-hidden', 'true');
    Object.assign(backdrop.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '60',
        background,
        pointerEvents: 'auto',
    });
    document.body.append(backdrop);

    const timing = reduced
        ? { contentDelay: 0.05, contentFade: 0.25, kaiAt: 0.2 }
        : ARRIVAL;

    let frame = 0;
    let finished = false;
    const start = performance.now();
    let readyAt = Infinity;
    let kaiSent = false;

    return new Promise<void>((resolve) => {
        const sendKai = () => {
            if (!kaiSent) {
                kaiSent = true;
                kaiPending = false;
                announce(kaiListeners, KAI_ARRIVE_EVENT);
            }
        };

        const finish = () => {
            if (finished) {
                return;
            }

            finished = true;
            cancelAnimationFrame(frame);
            backdrop.remove();
            endDeparture();
            pending = false;
            sendKai();
            active = null;
            resolve();
        };

        active = {
            cancel: () => {
                if (readyAt === Infinity) {
                    announce(readyListeners, NAVBAR_READY_EVENT);
                }

                finish();
            },
        };

        const tick = (now: number) => {
            const t = (now - start) / 1000;

            // El navbar del destino ya existe (o se agotó la espera).
            if (
                readyAt === Infinity &&
                (document.querySelector('.kn-bar') || t > ARRIVAL.waitBar)
            ) {
                readyAt = t;
                announce(readyListeners, NAVBAR_READY_EVENT);
            }

            if (readyAt < Infinity) {
                const since = t - readyAt;
                const c = smooth(
                    (since - timing.contentDelay) / timing.contentFade,
                );
                backdrop.style.opacity = String(1 - c);
                // Ya no bloquea: el contenido es usable mientras se descubre.
                backdrop.style.pointerEvents = c > 0 ? 'none' : 'auto';

                if (since >= timing.kaiAt) {
                    sendKai();
                }

                if (c >= 1 && kaiSent) {
                    finish();

                    return;
                }
            }

            frame = requestAnimationFrame(tick);
        };

        tick(start);
    });
}

/** Retira una llegada en curso (p. ej. si la navegación falla). */
export function cancelArrival(): void {
    active?.cancel();
}
