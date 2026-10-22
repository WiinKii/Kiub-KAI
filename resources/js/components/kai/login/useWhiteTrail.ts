/**
 * Estela blanca de KAI en el inicio de sesión, como la de la referencia:
 * una cinta plana que sale de su espalda en sentido contrario al viaje,
 * del ancho del cuerpo junto a él y más estrecha hacia atrás (perspectiva:
 * KAI viaja un poco hacia la cámara). Un borde blanco lo rodea y unas
 * gotitas mínimas se desprenden junto a él.
 *
 * Es recta, alineada con la dirección del viaje, y llega hasta el borde del
 * panel; crece y se recoge con suavidad. Dibuja en un `<canvas>` fijo a
 * pantalla completa (coordenadas de la ventana), recortado con las esquinas
 * redondeadas del panel.
 */

import { drawRibbon } from '@/lib/kai/ribbon';

export type TrailHead = { x: number; y: number; r: number };
export type TrailClip = { rect: DOMRect; radius: number };

type Droplet = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    age: number;
    life: number;
    inside: boolean;
};

/**
 * Perspectiva, como en la referencia: una cuña recta que llega al borde
 * del panel con esta fracción de su anchura junto a KAI.
 */
const EDGE_WIDTH = 0.5;
/** Borde blanco alrededor de KAI (radios). */
const OUTLINE = 1.2;

/** Media anchura a una distancia `d` de KAI (`edge`: distancia al borde). */
function widthAt(w: number, d: number, edge: number): number {
    return w * Math.max(0.15, 1 - ((1 - EDGE_WIDTH) * d) / edge);
}

/** Distancia desde `(x, y)` hasta el borde del rectángulo en la dirección `(ux, uy)`. */
function toEdge(rect: DOMRect, x: number, y: number, ux: number, uy: number) {
    const tx = ux < 0 ? (rect.left - x) / ux : (rect.right - x) / ux;
    const ty = uy < 0 ? (rect.top - y) / uy : (rect.bottom - y) / uy;

    return Math.max(1, Math.min(Math.abs(tx), Math.abs(ty)));
}

export function createWhiteTrail(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    let dpr = 1;
    let target = 0;
    let amount = 0;
    let retract = 4.2;
    let rush = 0;
    let time = 0;
    let spawn = 0;
    let drawn = false;
    const droplets: Droplet[] = [];

    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        drawn = true;
    }

    function frame(
        dt: number,
        head: TrailHead | null,
        heading: number,
        clip: TrailClip | null,
        envSpeed: number,
    ) {
        if (!ctx) {
            return;
        }

        time += dt;
        // Crece rápido y se recoge un poco más despacio.
        const rate = target > amount ? 6.5 : retract;
        amount += (target - amount) * Math.min(1, dt * rate);

        if (Math.abs(target - amount) < 0.002) {
            amount = target;
        }

        if (amount <= 0.004 && droplets.length === 0) {
            if (drawn) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                drawn = false;
            }

            return;
        }

        drawn = true;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.save();

        if (clip) {
            const { rect, radius } = clip;
            ctx.beginPath();
            ctx.roundRect(rect.left, rect.top, rect.width, rect.height, radius);
            ctx.clip();
        }

        const ux = Math.cos(heading + Math.PI);
        const uy = Math.sin(heading + Math.PI);

        if (head && amount > 0.004) {
            const reach = clip
                ? Math.hypot(clip.rect.width, clip.rect.height) * 1.05
                : 900;
            const grow = 1 - Math.pow(1 - Math.min(1, amount), 2.2);
            const len = reach * grow;
            // Junto a KAI, tan ancha como su borde blanco: se unen sin escalón.
            const w = head.r * (OUTLINE + 0.05 * rush);
            const edge = clip ? toEdge(clip.rect, head.x, head.y, ux, uy) : len;
            const points = [0, 1].map((k) => ({
                x: head.x + ux * len * k,
                y: head.y + uy * len * k,
                w: widthAt(w, len * k, edge),
            }));

            drawRibbon(ctx, points);
            // Borde blanco alrededor de KAI: la estela nace de su silueta.
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(
                head.x,
                head.y,
                head.r * OUTLINE * Math.min(1, amount * 1.6),
                0,
                Math.PI * 2,
            );
            ctx.fill();

            // Impulso: un pulso de luz recorre la estela hacia atrás.
            if (rush > 0.01) {
                const p = (time * 1.3) % 1;
                const span = 70;
                const d = head.r * 1.2 + p * (len - head.r * 1.2);
                const g = ctx.createLinearGradient(
                    head.x + ux * (d - span),
                    head.y + uy * (d - span),
                    head.x + ux * (d + span),
                    head.y + uy * (d + span),
                );
                g.addColorStop(0, 'rgba(120,170,255,0)');
                g.addColorStop(0.5, `rgba(120,170,255,${0.16 * rush})`);
                g.addColorStop(1, 'rgba(120,170,255,0)');
                ctx.strokeStyle = g;
                ctx.lineCap = 'butt';
                ctx.lineWidth = widthAt(w, d, edge) * 2;
                ctx.beginPath();
                ctx.moveTo(head.x + ux * (d - span), head.y + uy * (d - span));
                ctx.lineTo(head.x + ux * (d + span), head.y + uy * (d + span));
                ctx.stroke();
            }

            // Gotitas que se desprenden junto a la espalda de KAI.
            spawn -= dt;

            if (spawn <= 0 && amount > 0.5) {
                spawn = 0.09 + Math.random() * 0.08;
                const inside = Math.random() < 0.6;
                const side = (Math.random() - 0.5) * 2;
                const off = inside
                    ? side * w * 0.7
                    : Math.sign(side) * (w + 6 + Math.random() * 8);
                const back = head.r * (1.05 + Math.random() * 0.5);
                const speed =
                    (260 + Math.random() * 320) * Math.max(0.6, envSpeed);
                droplets.push({
                    x: head.x + ux * back - uy * off,
                    y: head.y + uy * back + ux * off,
                    vx: ux * speed,
                    vy: uy * speed,
                    r: 1.6 + Math.random() * 2.6,
                    age: 0,
                    life: 0.45 + Math.random() * 0.3,
                    inside,
                });
            }
        }

        for (let i = droplets.length - 1; i >= 0; i--) {
            const d = droplets[i];
            d.age += dt;
            d.x += d.vx * dt;
            d.y += d.vy * dt;

            if (d.age >= d.life) {
                droplets.splice(i, 1);
                continue;
            }

            const fade = 1 - d.age / d.life;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);

            if (d.inside) {
                // Sobre la cinta blanca se leen como burbujas de contorno.
                ctx.strokeStyle = `rgba(120,150,210,${0.55 * fade})`;
                ctx.lineWidth = 1.2;
                ctx.stroke();
            } else {
                ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
                ctx.fill();
            }
        }

        ctx.restore();
    }

    return {
        resize,
        frame,
        /**
         * 0 recogida, 1 viaje. `rate` (1/s) acelera la recogida: al salir
         * del panel la cola pasa rápido, como en la referencia.
         */
        setAmount(value: number, rate = 4.2) {
            target = value;
            retract = rate;
        },
        /** 0-1: pulso de luz y algo más de anchura mientras se valida. */
        setRush(value: number) {
            rush = value;
        },
        clear() {
            target = 0;
            amount = 0;
            droplets.length = 0;
        },
    };
}

export type WhiteTrail = ReturnType<typeof createWhiteTrail>;
