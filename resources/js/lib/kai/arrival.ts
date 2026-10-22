/**
 * Llegada a Kiub: KAI choca contra el navbar desde abajo y su líquido se
 * extiende hasta ser la barra.
 *
 * Al impacto el cuerpo se aplasta contra el techo, la masa corre hacia los
 * dos lados con un frente que se abomba y rebota (elástico), cuelgan un
 * par de gotas que se recogen y saltan unas pocas gotitas. Un destello de
 * luz y una onda marcan el choque; los ojos de KAI sonríen un instante en
 * la barra. Después el color de KAI se vuelve el vidrio del navbar, un
 * brillo lo recorre y la barra real toma el relevo: primero sus controles,
 * luego el contenido. La estela blanca se recoge hacia el punto de choque.
 *
 * Vive fuera de Vue (una capa sobre `<body>`) para sobrevivir al cambio de
 * página: el inicio de sesión la lanza, Inertia monta el destino debajo de
 * un fondo opaco y `AppHeader` muestra la barra real cuando está formada
 * (evento `kiub:navbar-ready`).
 */

import { BINS, traceField } from './field';
import type { Ball } from './field';
import { KAI_DEFAULT_COLORS } from './palette';
import { drawRibbon, ribbonLength, trimRibbon } from './ribbon';
import type { RibbonPoint } from './ribbon';

export const ARRIVAL = {
    /** El líquido corre hasta los extremos de la barra (s). */
    spread: 0.72,
    /** Del color de KAI al vidrio del navbar: comienzo y duración (s). */
    glassAt: 0.5,
    glass: 0.45,
    /** La estela se recoge hacia el choque (s). */
    trail: 0.3,
    /** Entrega a la barra real (s desde el choque). */
    handoffAt: 1.12,
    /** Fundido de la capa a la barra real (s). */
    handoff: 0.32,
    /** El contenido aparece después de los controles (s tras la entrega). */
    contentDelay: 0.42,
    contentFade: 0.5,
};

export const NAVBAR_READY_EVENT = 'kiub:navbar-ready';

/** Dónde y con qué tamaño llega KAI (px de pantalla). */
export type ArrivalImpact = { x: number; y: number; r: number };

export type ArrivalOptions = {
    /** Color del fondo de la página de origen: el telón empieza igual. */
    background: string;
    /** Sin impacto (movimiento reducido): la barra aparece con un fundido. */
    impact?: ArrivalImpact;
    /** Estela blanca en el momento del choque (cabeza primero). */
    trail?: RibbonPoint[];
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

/** Rectángulo redondeado como trazado (para cerrar con la forma real). */
function roundRect(b: BarRect, rx: number): string {
    const r = Math.min(rx, b.height / 2, b.width / 2);
    const x = b.left;
    const y = b.top;
    const w = b.width;
    const h = b.height;

    return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

type Droplet = { x: number; y: number; vx: number; vy: number; r: number };

/**
 * Forma el navbar con el choque de KAI. Se resuelve cuando todo terminó
 * (capa retirada y contenido visible). Llamarla de nuevo cancela la anterior.
 */
export function playArrival({
    background,
    impact,
    trail = [],
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

    // La estela, debajo de la barra.
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
    });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    const ctx = canvas.getContext('2d');

    const svg = el('svg', { width: '100%', height: '100%' });
    Object.assign(svg.style, {
        position: 'absolute',
        inset: '0',
        overflow: 'visible',
    });
    const uid = Math.random().toString(36).slice(2, 8);
    const id = (name: string) => `kiub-arrival-${name}-${uid}`;
    const defs = el('defs');
    const path = el('path', { id: id('shape'), d: 'M0 0' });
    const clip = el('clipPath', { id: id('clip') });
    clip.appendChild(el('use', { href: `#${id('shape')}` }));

    const c = KAI_DEFAULT_COLORS;
    const kaiFill = el('radialGradient', {
        id: id('kai'),
        gradientUnits: 'userSpaceOnUse',
    });
    kaiFill.append(
        el('stop', { offset: 0, 'stop-color': '#eef4ff' }),
        el('stop', { offset: 0.1, 'stop-color': '#a9c8ff' }),
        el('stop', { offset: 0.42, 'stop-color': c.primary }),
        el('stop', { offset: 0.78, 'stop-color': c.accent }),
        el('stop', { offset: 1, 'stop-color': '#b6a5ff' }),
    );
    const glassFill = el('linearGradient', {
        id: id('glass'),
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 1,
    });
    glassFill.append(
        el('stop', { offset: 0, 'stop-color': 'rgb(244,246,250)' }),
        el('stop', { offset: 1, 'stop-color': 'rgb(226,231,239)' }),
    );
    const glow = el('radialGradient', { id: id('glow') });
    glow.append(
        el('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': 1 }),
        el('stop', {
            offset: 0.4,
            'stop-color': '#ffffff',
            'stop-opacity': 0.45,
        }),
        el('stop', { offset: 1, 'stop-color': '#ffffff', 'stop-opacity': 0 }),
    );
    const sheen = el('linearGradient', { id: id('sheen'), x1: 0, x2: 1 });
    sheen.append(
        el('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': 0 }),
        el('stop', {
            offset: 0.5,
            'stop-color': '#ffffff',
            'stop-opacity': 0.75,
        }),
        el('stop', { offset: 1, 'stop-color': '#ffffff', 'stop-opacity': 0 }),
    );
    defs.append(path, clip, kaiFill, glassFill, glow, sheen);
    svg.appendChild(defs);

    const group = el('g');
    group.style.filter =
        'drop-shadow(0 12px 22px rgba(5, 25, 36, 0.16)) drop-shadow(0 2px 4px rgba(5, 25, 36, 0.08))';
    const kaiBody = el('use', {
        href: `#${id('shape')}`,
        fill: `url(#${id('kai')})`,
    });
    const glassBody = el('use', {
        href: `#${id('shape')}`,
        fill: `url(#${id('glass')})`,
        opacity: 0,
    });
    const inner = el('g', { 'clip-path': `url(#${id('clip')})` });
    const flash = el('circle', { fill: `url(#${id('glow')})`, r: 0 });
    const sweep = el('rect', {
        fill: `url(#${id('sheen')})`,
        width: 0,
        height: 0,
        opacity: 0,
    });
    // Reflejo superior: el vidrio (o el líquido) recibe la luz desde arriba.
    const rim = el('rect', { fill: '#ffffff', opacity: 0.55, height: 1.5 });
    inner.append(flash, sweep, rim);
    const edge = el('use', {
        href: `#${id('shape')}`,
        fill: 'none',
        stroke: 'rgba(255,255,255,0.8)',
        'stroke-width': 1,
    });
    // Los ojos de KAI sonríen un instante en la barra («◠ ◠»).
    const eyes = el('path', {
        fill: 'none',
        stroke: '#ffffff',
        'stroke-width': 2.6,
        'stroke-linecap': 'round',
        opacity: 0,
    });
    group.append(kaiBody, glassBody, inner, edge, eyes);

    const ring = el('ellipse', {
        fill: 'none',
        stroke: c.primary,
        'stroke-width': 1.5,
        opacity: 0,
    });
    const dropletEls = Array.from({ length: 6 }, () =>
        el('circle', { fill: c.primary, r: 0, opacity: 0 }),
    );
    svg.append(ring, group, ...dropletEls);
    layer.append(canvas, svg);
    document.body.append(backdrop, layer);

    let frame = 0;
    let finished = false;
    let last = performance.now();
    const start = last;
    const zeros = new Float64Array(BINS);
    let readyAt = Infinity;
    const trailLength = ribbonLength(trail);

    // Gotitas del choque: pocas, pequeñas y hacia los lados.
    const droplets: Droplet[] = impact
        ? [
              [-1, 0.55, -0.35],
              [-1, 0.85, 0.15],
              [-1, 0.4, 0.5],
              [1, 0.6, -0.3],
              [1, 0.95, 0.2],
              [1, 0.45, 0.55],
          ].map(([side, speed, lift], i) => ({
              x: impact.x + side * impact.r * 0.4,
              y: impact.y - impact.r * 0.1,
              vx: side * (180 + 260 * speed),
              vy: -120 * (1 - lift) + 80 * lift,
              r: 2.2 + (i % 3) * 1.1,
          }))
        : [];

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

        const handoffAt = reduced || !impact ? 0.05 : ARRIVAL.handoffAt;

        const tick = (now: number) => {
            const t = (now - start) / 1000;
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            // La barra real aparece al montarse el destino: se sigue su sitio.
            const bar = measureBar();
            const h = bar.height;
            const capR = h / 2;
            const cy = bar.top + capR;

            if (impact && !reduced) {
                // Estela: se recoge desde la cola hacia el choque.
                if (ctx) {
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    const k = 1 - smooth(t / ARRIVAL.trail);

                    if (k > 0 && trail.length > 1) {
                        drawRibbon(ctx, trimRibbon(trail, trailLength * k));
                    }
                }

                const ex = impact.x;
                const ey = cy;
                const leftEnd = bar.left + capR;
                const rightEnd = bar.left + bar.width - capR;
                const spread = elastic((t - 0.03) / ARRIVAL.spread);
                // El rebote del extremo no se sale del sitio de la barra.
                const xl = Math.max(
                    leftEnd - capR * 0.18,
                    mix(ex, leftEnd, spread),
                );
                const xr = Math.min(
                    rightEnd + capR * 0.18,
                    mix(ex, rightEnd, spread),
                );
                const jiggle = 1 + 0.08 * Math.exp(-5 * t) * Math.sin(t * 20);
                const barR = capR * mix(0.62, 1, smooth(t / 0.16)) * jiggle;
                const balls: Ball[] = [];

                // El cuerpo se aplasta contra el techo y se vacía en la barra.
                const body = impact.r * (1 - smooth((t - 0.03) / 0.3));

                if (body > 0.8) {
                    balls.push({
                        x: ex,
                        y: ey + h * 0.12 - h * 0.18 * smooth(t / 0.1),
                        r: body,
                        stretch: 1 + 0.85 * smooth(t / 0.12),
                        c: 1,
                        s: 0,
                    });
                }

                balls.push({
                    x: xl,
                    y: ey,
                    x2: Math.max(xl + 0.1, xr),
                    y2: ey,
                    r: barR,
                });

                // Frentes del líquido: se abomban mientras corren.
                const front = barR * 0.92 * (1 - smooth((t - 0.18) / 0.45));

                if (front > 0.8) {
                    balls.push(
                        { x: xl, y: ey, r: front },
                        { x: xr, y: ey, r: front },
                    );
                }

                // Dos gotas cuelgan un momento bajo la barra y se recogen.
                for (const [offset, at] of [
                    [-0.17, 0.2],
                    [0.23, 0.26],
                ]) {
                    const dx = offset * bar.width;
                    const u = clamp01((t - at) / 0.55);
                    const hang = Math.sin(Math.PI * u) * 11;

                    if (u > 0 && u < 1 && ex + dx > xl && ex + dx < xr) {
                        balls.push({
                            x: ex + dx,
                            y: bar.top + h + hang - 4,
                            r: 5.5 * Math.sin(Math.PI * Math.min(1, u * 1.4)),
                        });
                    }
                }

                // Al asentarse, la forma termina siendo la de la barra real.
                const settle = clamp01((t - 0.86) / 0.3);

                if (settle > 0) {
                    path.setAttribute(
                        'd',
                        roundRect(bar, mix(capR, bar.radius, smooth(settle))),
                    );
                } else {
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

                // Del color de KAI al vidrio del navbar.
                const glassK = smooth((t - ARRIVAL.glassAt) / ARRIVAL.glass);
                kaiFill.setAttribute('cx', String(ex));
                kaiFill.setAttribute('cy', String(ey));
                kaiFill.setAttribute(
                    'r',
                    String(Math.max(40, (xr - xl) * 0.55 + capR)),
                );
                set(kaiBody, { opacity: (1 - glassK).toFixed(3) });
                set(glassBody, { opacity: glassK.toFixed(3) });

                // Destello del choque y onda.
                const f = clamp01((t - 0.03) / 0.45);
                set(flash, {
                    cx: ex,
                    cy: ey,
                    r: (20 + 220 * smooth(f)).toFixed(1),
                    opacity: (t < 0.03 ? 0 : 0.9 * (1 - smooth(f))).toFixed(3),
                });
                const w = clamp01(t / 0.6);
                set(ring, {
                    cx: ex,
                    cy: ey,
                    rx: (impact.r + 220 * smooth(w)).toFixed(1),
                    ry: (impact.r * 0.6 + 26 * smooth(w)).toFixed(1),
                    opacity: (0.55 * (1 - smooth(w))).toFixed(3),
                });

                // Brillo que recorre la barra ya formada.
                const s = clamp01((t - 0.78) / 0.55);
                set(sweep, {
                    x: (bar.left - 220 + (bar.width + 440) * smooth(s)).toFixed(
                        1,
                    ),
                    y: bar.top,
                    width: 220,
                    height: h,
                    opacity: (Math.sin(Math.PI * s) * 0.8).toFixed(3),
                });
                set(rim, {
                    x: Math.min(xl, xr) - capR * 0.5,
                    y: bar.top + 1.5,
                    width: Math.max(0, xr - xl + capR),
                });

                // Ojos «◠ ◠»: aparecen al chocar y se desvanecen.
                const e = clamp01(t / 0.9);
                const eo = 1 - smooth((e - 0.45) / 0.45);
                const gap = Math.min(10, h * 0.16);
                const ew = Math.min(6, h * 0.1);
                const eyY = ey - 2;
                set(eyes, {
                    d: `M${ex - gap - ew} ${eyY}q${ew} ${-ew * 1.1} ${ew * 2} 0M${ex + gap - ew} ${eyY}q${ew} ${-ew * 1.1} ${ew * 2} 0`,
                    opacity: eo.toFixed(3),
                });

                // Gotitas: salen despedidas, caen y se desvanecen.
                droplets.forEach((d, i) => {
                    d.vy += 1100 * dt;
                    d.x += d.vx * dt;
                    d.y += d.vy * dt;
                    d.vx *= 1 - 1.6 * dt;
                    const life = clamp01(t / (0.62 + (i % 3) * 0.1));
                    set(dropletEls[i], {
                        cx: d.x.toFixed(1),
                        cy: d.y.toFixed(1),
                        r: (d.r * (1 - 0.6 * life)).toFixed(2),
                        opacity: (0.9 * (1 - smooth(life))).toFixed(3),
                    });
                });
            }

            // Entrega: la barra real aparece debajo y la capa se funde.
            if (t >= handoffAt && readyAt === Infinity) {
                readyAt = t;
                announceReady();
            }

            if (readyAt < Infinity) {
                const k = clamp01((t - readyAt) / ARRIVAL.handoff);
                layer.style.opacity = String(1 - smooth(k));
                const cf = clamp01(
                    (t - readyAt - (reduced ? 0 : ARRIVAL.contentDelay)) /
                        (reduced ? 0.25 : ARRIVAL.contentFade),
                );
                backdrop.style.opacity = String(1 - smooth(cf));
                // Ya no bloquea: el contenido es usable mientras se descubre.
                backdrop.style.pointerEvents = cf > 0 ? 'none' : 'auto';

                if (cf >= 1 && k >= 1) {
                    finish();

                    return;
                }
            }

            frame = requestAnimationFrame(tick);
        };

        // El primer fotograma se dibuja ya: el telón no tapa a KAI ni un
        // instante sin que la capa lo haya sustituido.
        tick(start);
    });
}

/** Retira una llegada en curso (p. ej. si la navegación falla). */
export function cancelArrival(): void {
    active?.cancel();
}
