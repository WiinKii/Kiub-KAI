/**
 * Estela blanca de KAI: una cinta plana (2D), como la de la referencia,
 * con anchura variable a lo largo del recorrido (la usa el inicio de
 * sesión).
 */

/** Punto de la cinta en píxeles de pantalla; `w` es la media anchura. */
export type RibbonPoint = { x: number; y: number; w: number };

/**
 * Dibuja la cinta como un único contorno relleno (bordes a ambos lados del
 * recorrido y extremos redondos): una sola forma, así la sombra y la
 * opacidad no se acumulan en los empalmes aunque la anchura cambie.
 */
export function drawRibbon(
    ctx: CanvasRenderingContext2D,
    points: RibbonPoint[],
    color = '#ffffff',
): void {
    const n = points.length;

    if (n < 2) {
        return;
    }

    const left: [number, number][] = [];
    const right: [number, number][] = [];

    for (let i = 0; i < n; i++) {
        const a = points[Math.max(0, i - 1)];
        const b = points[Math.min(n - 1, i + 1)];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const p = points[i];
        left.push([p.x + nx * p.w, p.y + ny * p.w]);
        right.push([p.x - nx * p.w, p.y - ny * p.w]);
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);

    for (let i = 1; i < n; i++) {
        ctx.lineTo(left[i][0], left[i][1]);
    }

    for (let i = n - 1; i >= 0; i--) {
        ctx.lineTo(right[i][0], right[i][1]);
    }

    ctx.closePath();

    // Extremos redondos, en el mismo trazado y con el mismo sentido de
    // giro que el contorno: al rellenar se suman, no se restan.
    const outline = [...left, ...right.reverse()];
    let area = 0;

    for (let i = 0; i < outline.length; i++) {
        const [x1, y1] = outline[i];
        const [x2, y2] = outline[(i + 1) % outline.length];
        area += x1 * y2 - x2 * y1;
    }

    for (const p of [points[0], points[n - 1]]) {
        ctx.moveTo(p.x + p.w, p.y);
        ctx.arc(p.x, p.y, p.w, 0, Math.PI * 2, area < 0);
    }

    ctx.fill('nonzero');
}
