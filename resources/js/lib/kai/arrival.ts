/**
 * Llegada a Kiub: las cuatro gotas en que se divide KAI viajan, una tras
 * otra, hasta la posición del navbar. La primera se aplana y es la primera
 * sección del vidrio; las demás se unen a su extremo hasta completar la
 * cápsula. Cada unión deforma el borde y deja un destello de su color que
 * se reparte por el interior y el contorno.
 *
 * Vive fuera de Vue (una capa sobre `<body>`) para sobrevivir al cambio de
 * página: el inicio de sesión la lanza, Inertia monta el destino debajo de
 * un fondo opaco y `AppHeader` muestra la barra real cuando la cápsula está
 * completa (evento `kiub:navbar-ready`). Después aparecen los controles y,
 * al final, el contenido.
 */

import { BINS, traceField } from './field';
import type { Ball } from './field';
import { NAVBAR_COLORS } from './stream';

export const ARRIVAL = {
    /** Vuelo de cada gota hasta su sitio (s). */
    flight: 0.62,
    /** Retraso entre gotas (s). */
    stagger: 0.24,
    /** Aplanado / unión elástica de cada sección (s). */
    merge: 0.46,
    /** Destello de color al unirse (s). */
    flash: 0.7,
    /** Pausa con la cápsula completa antes de entregar la barra real (s). */
    hold: 0.12,
    /** Fundido de la cápsula a la barra real (s). */
    handoff: 0.32,
    /** El contenido aparece después de los controles (s tras la entrega). */
    contentDelay: 0.42,
    contentFade: 0.5,
};

export const NAVBAR_READY_EVENT = 'kiub:navbar-ready';

export type ArrivalDrop = { x: number; y: number; r: number; color?: string };

export type ArrivalOptions = {
    /** Gotas al empezar (px de pantalla), en orden de izquierda a derecha. */
    drops: ArrivalDrop[];
    /** Color del fondo de la página de origen: el telón empieza igual. */
    background: string;
    reduced?: boolean;
};

type BarRect = {
    left: number;
    top: number;
    width: number;
    height: number;
    radius: number;
};

let pending = false;
const readyListeners = new Set<() => void>();

/** `true` mientras una llegada está formando el navbar. */
export function arrivalPending(): boolean {
    return pending;
}

/**
 * Para `AppHeader`: avisa cuando la cápsula está completa. Devuelve una
 * función para dejar de escuchar.
 */
export function onNavbarReady(listener: () => void): () => void {
    readyListeners.add(listener);

    return () => readyListeners.delete(listener);
}

function announceReady(): void {
    for (const listener of readyListeners) {
        listener();
    }

    window.dispatchEvent(new CustomEvent(NAVBAR_READY_EVENT));
}

/* ── Geometría de la barra ──────────────────────────────────────────── */

/** La barra real si ya está en el documento; si no, la que tendrá (CSS de AppHeader). */
export function measureBar(): BarRect {
    const el = document.querySelector<HTMLElement>('.kn-bar');
    const rect = el?.getBoundingClientRect();

    if (el && rect && rect.width > 0) {
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius);

        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            radius: Number.isFinite(radius) ? radius : 22,
        };
    }

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const small = vw <= 640;
    const padX = small ? 6 : 10;
    const top = small ? 10 : 14;
    const margin = small ? 6 : 14;
    const inner = vw - padX * 2;
    const shell = Math.min(inner, 1680);
    const left = padX + (inner - shell) / 2 + margin;

    return {
        left,
        top,
        width: shell - margin * 2,
        height: small ? 58 : 62,
        radius: small ? 20 : 22,
    };
}

/* ── Curvas ─────────────────────────────────────────────────────────── */

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(u: number): number {
    const x = clamp01(u);

    return x * x * (3 - 2 * x);
}

function easeInOut(u: number): number {
    const x = clamp01(u);

    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Muelle subamortiguado de 0 a 1: pasa un poco y vuelve (elástico). */
function elastic(u: number): number {
    const x = clamp01(u);

    if (x >= 1) {
        return 1;
    }

    return 1 - Math.exp(-6.2 * x) * Math.cos(x * Math.PI * 2.6);
}

function mix(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/* ── Capa ───────────────────────────────────────────────────────────── */

const SVG = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG, tag);

    for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, String(v));
    }

    return node;
}

function set(node: Element, attrs: Record<string, string | number>): void {
    for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, String(v));
    }
}

/** Mezcla un color #rrggbb con blanco (`k` 0-1). */
function lighten(hex: string, k: number): string {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) =>
        Math.round(v + (255 - v) * k),
    );

    return `rgb(${c.join(',')})`;
}

let active: { cancel: () => void } | null = null;
let quiet: HTMLStyleElement | null = null;

/**
 * Desde que KAI sale hacia el navbar, el viaje es el indicador de progreso:
 * se oculta la barra de carga de Inertia hasta que termina la llegada.
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
 * Forma el navbar con las gotas. Se resuelve cuando todo terminó (capa
 * retirada y contenido visible). Llamarla de nuevo cancela la anterior.
 */
export function playArrival({
    drops,
    background,
    reduced = false,
}: ArrivalOptions): Promise<void> {
    active?.cancel();
    pending = true;

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

    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '80',
        pointerEvents: 'none',
    });

    const svg = el('svg', { width: '100%', height: '100%' });
    svg.style.overflow = 'visible';
    svg.style.display = 'block';
    const defs = el('defs');
    const uid = Math.random().toString(36).slice(2, 8);
    const clipId = `kiub-arrival-clip-${uid}`;
    const glassId = `kiub-arrival-glass-${uid}`;
    const path = el('path', { id: `kiub-arrival-shape-${uid}`, d: 'M0 0' });
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(el('use', { href: `#${path.id}` }));
    const glass = el('linearGradient', {
        id: glassId,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 1,
    });
    glass.append(
        el('stop', { offset: 0, 'stop-color': 'rgb(246,248,251)' }),
        el('stop', { offset: 1, 'stop-color': 'rgb(226,232,240)' }),
    );
    defs.append(path, clip, glass);

    const colors = drops.map(
        (d, i) => d.color || NAVBAR_COLORS[i % NAVBAR_COLORS.length],
    );
    const dropGradients = colors.map((color, i) => {
        const g = el('radialGradient', {
            id: `kiub-arrival-drop-${uid}-${i}`,
            cx: 0.38,
            cy: 0.32,
            r: 0.78,
        });
        g.append(
            el('stop', { offset: 0, 'stop-color': lighten(color, 0.55) }),
            el('stop', { offset: 0.62, 'stop-color': color }),
            el('stop', {
                offset: 1,
                'stop-color': color,
                'stop-opacity': 0.92,
            }),
        );
        defs.appendChild(g);

        return g.id;
    });
    const flashGradients = colors.map((color, i) => {
        const g = el('radialGradient', {
            id: `kiub-arrival-flash-${uid}-${i}`,
        });
        g.append(
            el('stop', {
                offset: 0,
                'stop-color': color,
                'stop-opacity': 0.85,
            }),
            el('stop', {
                offset: 0.55,
                'stop-color': color,
                'stop-opacity': 0.35,
            }),
            el('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 }),
        );
        defs.appendChild(g);

        return g.id;
    });
    // Tinte de KAI: al recibirlas, las gotas aún llevan su azul violáceo y
    // lo pierden en el primer tramo del vuelo (continuidad de material).
    const kaiTintId = `kiub-arrival-kai-${uid}`;
    const kaiTint = el('radialGradient', {
        id: kaiTintId,
        cx: 0.4,
        cy: 0.34,
        r: 0.8,
    });
    kaiTint.append(
        el('stop', { offset: 0, 'stop-color': '#b9c8ff' }),
        el('stop', { offset: 0.6, 'stop-color': '#7f8cff' }),
        el('stop', { offset: 1, 'stop-color': '#6a6ff2' }),
    );
    defs.appendChild(kaiTint);
    svg.appendChild(defs);

    const group = el('g');
    group.style.filter =
        'drop-shadow(0 12px 22px rgba(5, 25, 36, 0.16)) drop-shadow(0 2px 4px rgba(5, 25, 36, 0.08))';
    const body = el('use', { href: `#${path.id}`, fill: `url(#${glassId})` });
    const inner = el('g', { 'clip-path': `url(#${clipId})` });
    const dropEls = colors.map((_, i) =>
        el('ellipse', { fill: `url(#${dropGradients[i]})`, rx: 0, ry: 0 }),
    );
    const flashEls = colors.map((_, i) =>
        el('circle', { fill: `url(#${flashGradients[i]})`, r: 0, opacity: 0 }),
    );
    const tintEls = colors.map(() =>
        el('ellipse', { fill: `url(#${kaiTintId})`, rx: 0, ry: 0 }),
    );
    const shine = colors.map(() =>
        el('ellipse', { fill: '#ffffff', opacity: 0, rx: 0, ry: 0 }),
    );
    inner.append(...flashEls, ...dropEls, ...tintEls, ...shine);
    const edge = el('use', {
        href: `#${path.id}`,
        fill: 'none',
        stroke: 'rgba(255,255,255,0.85)',
        'stroke-width': 1.2,
    });
    const edgeFlashes = colors.map((color) =>
        el('use', {
            href: `#${path.id}`,
            fill: 'none',
            stroke: color,
            'stroke-width': 2.2,
            opacity: 0,
        }),
    );
    group.append(body, inner, edge, ...edgeFlashes);
    svg.appendChild(group);
    layer.appendChild(svg);
    document.body.append(backdrop, layer);

    let frame = 0;
    let finished = false;
    const start = performance.now();
    const zeros = new Float64Array(BINS);
    let bar = measureBar();
    let readyAt = Infinity;

    return new Promise<void>((resolve) => {
        const finish = () => {
            if (finished) {
                return;
            }

            finished = true;
            cancelAnimationFrame(frame);
            backdrop.remove();
            layer.remove();
            endDeparture();
            pending = false;
            active = null;
            resolve();
        };

        active = {
            cancel: () => {
                if (readyAt === Infinity) {
                    announceReady();
                }

                finish();
            },
        };

        const n = drops.length;
        const lastJoin =
            ARRIVAL.flight + (n - 1) * ARRIVAL.stagger + ARRIVAL.merge;
        const handoffAt = reduced ? 0.05 : lastJoin + ARRIVAL.hold;

        const tick = (now: number) => {
            const t = (now - start) / 1000;
            // La barra real aparece al montarse el destino: se sigue su sitio.
            bar = measureBar();
            const h = bar.height;
            const cy = bar.top + h / 2;
            const capR = h / 2;
            const left = bar.left + capR;
            const sectionEnd = (k: number) =>
                bar.left +
                (bar.width * (k + 1)) / n -
                capR * (k === n - 1 ? 1 : 0.35);
            const balls: Ball[] = [];
            let barEnd = -Infinity;
            let barStart = -Infinity;
            let barR = 0;

            if (!reduced) {
                drops.forEach((drop, k) => {
                    const depart = k * ARRIVAL.stagger * 0.45;
                    const arrive = ARRIVAL.flight + k * ARRIVAL.stagger;
                    // Punto de unión: el centro de su sección (la primera) o
                    // el extremo actual de la cápsula (las demás).
                    const jx =
                        k === 0
                            ? bar.left + bar.width / (2 * n)
                            : bar.left + (bar.width * k) / n + capR * 0.2;
                    const u = easeInOut((t - depart) / (arrive - depart));
                    // Vuelo con una curva suave por debajo de la barra.
                    const swoop = Math.sin(Math.PI * clamp01(u)) * h * 0.55;
                    const x = mix(drop.x, jx, u);
                    const y = mix(drop.y, cy, u) + swoop;
                    const merge = clamp01((t - arrive) / ARRIVAL.merge);
                    const r =
                        mix(drop.r, capR * 0.92, smooth(u)) *
                        (1 - smooth(merge * 1.25));

                    // Velocidad aproximada: se alarga en la dirección del vuelo.
                    const du = 0.02;
                    const u2 = easeInOut((t + du - depart) / (arrive - depart));
                    const vx = (mix(drop.x, jx, u2) - x) / du;
                    const vy =
                        (mix(drop.y, cy, u2) +
                            Math.sin(Math.PI * clamp01(u2)) * h * 0.55 -
                            y) /
                        du;
                    const speed = Math.hypot(vx, vy);
                    const stretch = 1 + Math.min(0.55, speed / 2600);
                    const angle = Math.atan2(vy, vx);

                    if (r > 0.6) {
                        balls.push({
                            x,
                            y,
                            r,
                            stretch: stretch > 1.01 ? stretch : undefined,
                            c: Math.cos(angle),
                            s: Math.sin(angle),
                        });
                    }

                    // Tinte de la gota (y su brillo) mientras es una gota.
                    const sx = r * Math.sqrt(stretch) * 1.02;
                    const sy = (r / Math.sqrt(stretch)) * 1.02;
                    set(dropEls[k], {
                        cx: x.toFixed(1),
                        cy: y.toFixed(1),
                        rx: Math.max(0, sx).toFixed(1),
                        ry: Math.max(0, sy).toFixed(1),
                        transform: `rotate(${((angle * 180) / Math.PI).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`,
                        opacity: (0.95 * (1 - smooth(merge * 1.4))).toFixed(3),
                    });
                    const handover = 1 - smooth(t / 0.45);
                    set(tintEls[k], {
                        cx: x.toFixed(1),
                        cy: y.toFixed(1),
                        rx: Math.max(0, sx).toFixed(1),
                        ry: Math.max(0, sy).toFixed(1),
                        transform: `rotate(${((angle * 180) / Math.PI).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`,
                        opacity: (0.3 * handover).toFixed(3),
                    });
                    set(shine[k], {
                        cx: (x - r * 0.32).toFixed(1),
                        cy: (y - r * 0.38).toFixed(1),
                        rx: (r * 0.34).toFixed(1),
                        ry: (r * 0.2).toFixed(1),
                        opacity: (
                            0.55 *
                            (1 - handover) *
                            (1 - smooth(merge * 1.6))
                        ).toFixed(3),
                    });

                    // La cápsula: la primera gota se aplana; cada una que
                    // llega la alarga hasta su sección, con rebote.
                    if (t >= arrive) {
                        const e = elastic(merge);

                        if (k === 0) {
                            barStart = mix(jx, left, e);
                            barEnd = Math.max(
                                barEnd,
                                mix(jx, sectionEnd(0), e),
                            );
                            barR = mix(drop.r * 0.9, capR, smooth(merge * 1.4));
                        } else {
                            // La última no se pasa del borde de la barra.
                            const reach = mix(
                                sectionEnd(k - 1),
                                sectionEnd(k),
                                e,
                            );
                            barEnd = Math.max(
                                barEnd,
                                k === n - 1
                                    ? Math.min(
                                          reach,
                                          sectionEnd(k) + capR * 0.12,
                                      )
                                    : reach,
                            );
                        }

                        // Destello del color de la gota: interior y borde.
                        const f = clamp01((t - arrive) / ARRIVAL.flash);
                        set(flashEls[k], {
                            cx: jx.toFixed(1),
                            cy: cy.toFixed(1),
                            r: (bar.width * 0.36 * smooth(f * 1.3) + 1).toFixed(
                                1,
                            ),
                            opacity: (
                                Math.sin(Math.PI * Math.pow(f, 0.6)) * 0.62
                            ).toFixed(3),
                        });
                        set(edgeFlashes[k], {
                            opacity: (
                                Math.sin(Math.PI * Math.pow(f, 0.5)) * 0.75
                            ).toFixed(3),
                        });
                    }
                });

                if (barEnd > -Infinity) {
                    // Al unirse, la sección se hincha un poco y vuelve.
                    let swell = 0;

                    drops.forEach((_, k) => {
                        const since =
                            t - (ARRIVAL.flight + k * ARRIVAL.stagger);

                        if (since > 0 && since < 0.5) {
                            swell = Math.max(
                                swell,
                                Math.sin((since / 0.5) * Math.PI) * 0.07,
                            );
                        }
                    });

                    balls.push({
                        x: barStart,
                        y: cy,
                        x2: Math.max(barStart + 0.1, barEnd),
                        y2: cy,
                        r: barR * (1 + swell),
                    });
                }
            }

            // El borde de vidrio aparece al separarse de KAI.
            edge.setAttribute('opacity', smooth(t / 0.4).toFixed(3));

            if (balls.length) {
                let minX = Infinity;
                let minY = Infinity;
                let maxX = -Infinity;
                let maxY = -Infinity;

                for (const b of balls) {
                    const span = b.r * 1.7 * Math.max(1, b.stretch ?? 1);
                    minX = Math.min(minX, b.x - span, (b.x2 ?? b.x) - span);
                    maxX = Math.max(maxX, b.x + span, (b.x2 ?? b.x) + span);
                    minY = Math.min(minY, b.y - span);
                    maxY = Math.max(maxY, b.y + span);
                }

                const traced = traceField(
                    { cx: minX - 1000, cy: minY - 1000, radii: zeros },
                    balls,
                    [minX, minY, maxX, maxY],
                    { cell: 3, decimals: 1 },
                );
                path.setAttribute('d', traced.path || 'M0 0');
            }

            // Entrega: la barra real aparece debajo y la cápsula se funde.
            if (t >= handoffAt && readyAt === Infinity) {
                readyAt = t;
                announceReady();
            }

            if (readyAt < Infinity) {
                const k = clamp01((t - readyAt) / ARRIVAL.handoff);
                layer.style.opacity = String(1 - smooth(k));
                const c = clamp01(
                    (t - readyAt - (reduced ? 0 : ARRIVAL.contentDelay)) /
                        (reduced ? 0.25 : ARRIVAL.contentFade),
                );
                backdrop.style.opacity = String(1 - smooth(c));
                // Ya no bloquea: el contenido es usable mientras se descubre.
                backdrop.style.pointerEvents = c > 0 ? 'none' : 'auto';

                if (c >= 1 && k >= 1) {
                    finish();

                    return;
                }
            }

            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
    });
}

/** Retira una llegada en curso (p. ej. si la navegación falla). */
export function cancelArrival(): void {
    active?.cancel();
}
