/**
 * Estela blanca de KAI en el inicio de sesión, como la de la referencia:
 * una cinta plana del ancho del cuerpo que sale de su espalda en sentido
 * contrario al viaje, con un borde blanco que lo rodea y unas gotitas
 * mínimas que se desprenden junto a él.
 *
 * - En viaje (`setAmount`) es recta, alineada con la dirección, y llega
 *   hasta el borde del panel; crece y se recoge con suavidad.
 * - En la salida (`follow(true)`) sigue el recorrido real de KAI.
 *
 * Dibuja en un `<canvas>` fijo a pantalla completa (coordenadas de la
 * ventana); dentro del panel se recorta con sus esquinas redondeadas.
 */

import { drawRibbon, trimRibbon } from '@/lib/kai/ribbon';
import type { RibbonPoint } from '@/lib/kai/ribbon';

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

/** Largo máximo de la estela que sigue el recorrido (px). */
const FOLLOW_LENGTH = 560;

export function createWhiteTrail(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    let dpr = 1;
    let target = 0;
    let amount = 0;
    let rush = 0;
    let time = 0;
    let spawn = 0;
    let following = false;
    let path: RibbonPoint[] = [];
    let drawn = false;
    const droplets: Droplet[] = [];

    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        drawn = true;
    }

    /** La estela recta actual, de la cabeza (KAI) hacia atrás. */
    function straight(head: TrailHead, heading: number, reach: number) {
        const ux = Math.cos(heading + Math.PI);
        const uy = Math.sin(heading + Math.PI);
        const grow = 1 - Math.pow(1 - Math.min(1, amount), 2.2);
        const len = reach * grow;
        const w = head.r * (0.97 + 0.05 * rush);

        return [
            { x: head.x, y: head.y, w },
            { x: head.x + ux * len, y: head.y + uy * len, w: w * 1.1 },
        ];
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
        const rate = target > amount ? 6.5 : 4.2;
        amount += (target - amount) * Math.min(1, dt * rate);

        if (Math.abs(target - amount) < 0.002) {
            amount = target;
        }

        const visible = following || amount > 0.004 || droplets.length > 0;

        if (!visible) {
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

        if (clip && !following) {
            const { rect, radius } = clip;
            ctx.beginPath();
            ctx.roundRect(rect.left, rect.top, rect.width, rect.height, radius);
            ctx.clip();
        }

        let points: RibbonPoint[] = [];

        if (head) {
            if (following) {
                const last = path[0];

                if (
                    !last ||
                    Math.hypot(head.x - last.x, head.y - last.y) > 1.5
                ) {
                    path.unshift({ x: head.x, y: head.y, w: head.r * 0.97 });
                }

                path = trimRibbon(path, FOLLOW_LENGTH);
                points = path;
            } else if (amount > 0.004) {
                const reach = clip
                    ? Math.hypot(clip.rect.width, clip.rect.height) * 1.1
                    : 900;
                points = straight(head, heading, reach);
            }
        }

        if (points.length > 1 && head) {
            // Fuera del panel, sobre el fondo claro, una sombra mínima la
            // separa del fondo.
            if (following) {
                ctx.shadowColor = 'rgba(21, 25, 36, 0.10)';
                ctx.shadowBlur = 18;
                ctx.shadowOffsetY = 6;
            }

            drawRibbon(ctx, points);
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            // Borde blanco alrededor de KAI: la estela nace de su silueta.
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(
                head.x,
                head.y,
                head.r * 1.13 * (following ? 1 : Math.min(1, amount * 1.6)),
                0,
                Math.PI * 2,
            );
            ctx.fill();

            // Impulso: un pulso de luz recorre la estela hacia atrás.
            if (rush > 0.01 && !following) {
                const [a, b] = points;
                const p = (time * 1.3) % 1;
                const span = 70;
                const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                const ux = (b.x - a.x) / len;
                const uy = (b.y - a.y) / len;
                const d = head.r * 1.2 + p * (len - head.r * 1.2);
                const g = ctx.createLinearGradient(
                    a.x + ux * (d - span),
                    a.y + uy * (d - span),
                    a.x + ux * (d + span),
                    a.y + uy * (d + span),
                );
                g.addColorStop(0, 'rgba(120,170,255,0)');
                g.addColorStop(0.5, `rgba(120,170,255,${0.16 * rush})`);
                g.addColorStop(1, 'rgba(120,170,255,0)');
                ctx.strokeStyle = g;
                ctx.lineCap = 'butt';
                ctx.lineWidth = a.w * 2;
                ctx.beginPath();
                ctx.moveTo(a.x + ux * (d - span), a.y + uy * (d - span));
                ctx.lineTo(a.x + ux * (d + span), a.y + uy * (d + span));
                ctx.stroke();
            }

            // Gotitas que se desprenden junto a la espalda de KAI.
            spawn -= dt;

            if (spawn <= 0 && (following || amount > 0.5)) {
                spawn = 0.09 + Math.random() * 0.08;
                const [a, b] = points;
                const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                const ux = (b.x - a.x) / len;
                const uy = (b.y - a.y) / len;
                const inside = Math.random() < 0.6;
                const side = (Math.random() - 0.5) * 2;
                const off = inside
                    ? side * a.w * 0.7
                    : Math.sign(side) * (a.w + 6 + Math.random() * 8);
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
        /** Viaje en línea recta: 0 recogida, 1 viaje. */
        setAmount(value: number) {
            target = value;
        },
        /** 0-1: pulso de luz y algo más de anchura mientras se valida. */
        setRush(value: number) {
            rush = value;
        },
        /**
         * Seguir el recorrido real (salida). Parte de la estela recta
         * actual para que no haya salto.
         */
        follow(on: boolean, head?: TrailHead, heading = 0, reach = 600) {
            following = on;

            if (on && head) {
                const [a, b] = straight(head, heading, reach);
                path = [a, b];
            }
        },
        /** La estela en este momento (cabeza primero), para entregarla. */
        snapshot(): RibbonPoint[] {
            return path.map((p) => ({ ...p }));
        },
        clear() {
            following = false;
            target = 0;
            amount = 0;
            path = [];
            droplets.length = 0;
        },
    };
}

export type WhiteTrail = ReturnType<typeof createWhiteTrail>;
