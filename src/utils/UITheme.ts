import { GameObjects, Scene } from "phaser";
import type { LeaderboardEntry } from "../SaveConstants.ts";

export type ChamferStyle = {
    cut?: number;
    fillColor?: number;
    fillAlpha?: number;
    strokeColor?: number;
    strokeAlpha?: number;
    lineWidth?: number;
    brackets?: boolean;
    bracketLen?: number;
    bracketColor?: number;
};

type Point = { x: number; y: number };

function buildChamferPoints(x: number, y: number, w: number, h: number, cut: number): Point[] {
    const c = Math.min(cut, w * 0.4, h * 0.4);
    return [
        { x: x + c, y },
        { x: x + w - c, y },
        { x: x + w, y: y + c },
        { x: x + w, y: y + h - c },
        { x: x + w - c, y: y + h },
        { x: x + c, y: y + h },
        { x, y: y + h - c },
        { x, y: y + c },
    ];
}

/**
 * Draws a 45-degree chamfered sci-fi rectangle anchored at top-left (x, y).
 */
export function drawChamferRectTopLeft(
    g: GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    style: ChamferStyle = {}
): GameObjects.Graphics {
    const {
        cut = 14,
        fillColor = 0x0b1324,
        fillAlpha = 0.9,
        strokeColor = 0x38bdf8,
        strokeAlpha = 0.85,
        lineWidth = 2,
        brackets = false,
        bracketLen = 14,
        bracketColor = strokeColor,
    } = style;

    const pts = buildChamferPoints(x, y, w, h, cut);

    if (fillAlpha > 0) {
        g.fillStyle(fillColor, fillAlpha);
        g.fillPoints(pts, true);

        // Subtle inner top gloss strip
        g.fillStyle(0xffffff, 0.04);
        const c = Math.min(cut, w * 0.4, h * 0.4);
        g.fillRect(x + c, y + 2, Math.max(0, w - c * 2), Math.min(6, h * 0.25));
    }

    if (lineWidth > 0 && strokeAlpha > 0) {
        g.lineStyle(lineWidth, strokeColor, strokeAlpha);
        g.strokePoints(pts, true);
    }

    if (brackets) {
        drawCornerBrackets(g, x, y, w, h, bracketLen, bracketColor, 0.95, Math.max(2, lineWidth));
    }

    return g;
}

/**
 * Draws a centered 45-degree chamfered sci-fi panel.
 */
export function drawChamferPanel(
    g: GameObjects.Graphics,
    cx: number,
    cy: number,
    w: number,
    h: number,
    style: ChamferStyle = {}
): GameObjects.Graphics {
    return drawChamferRectTopLeft(g, cx - w / 2, cy - h / 2, w, h, style);
}

/**
 * Draws glowing L-shaped corner targeting brackets around a box (top-left x, y).
 */
export function drawCornerBrackets(
    g: GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    len: number = 14,
    color: number = 0x38bdf8,
    alpha: number = 0.9,
    lineWidth: number = 3
): GameObjects.Graphics {
    const l = Math.min(len, w * 0.3, h * 0.3);
    g.lineStyle(lineWidth, color, alpha);

    // Top-left
    g.lineBetween(x, y + l, x, y);
    g.lineBetween(x, y, x + l, y);
    // Top-right
    g.lineBetween(x + w - l, y, x + w, y);
    g.lineBetween(x + w, y, x + w, y + l);
    // Bottom-right
    g.lineBetween(x + w, y + h - l, x + w, y + h);
    g.lineBetween(x + w, y + h, x + w - l, y + h);
    // Bottom-left
    g.lineBetween(x + l, y + h, x, y + h);
    g.lineBetween(x, y + h, x, y + h - l);

    return g;
}

/**
 * Renders styled leaderboard rows into a Container (used by HomeScene & GameOverScene).
 */
export function renderLeaderboardRows(
    scene: Scene,
    target: GameObjects.Container,
    cx: number,
    firstRowY: number,
    rowWidth: number,
    rowStep: number,
    entries: LeaderboardEntry[],
    maxRows: number,
    highlightIndex: number = -1
) {
    const slice = entries.slice(0, maxRows);
    const medalColors = [0xfacc15, 0xcbd5e1, 0xfb923c];

    slice.forEach((entry, idx) => {
        const rowY = firstRowY + idx * rowStep;
        const isNew = idx === highlightIndex;
        const rowFill = isNew ? 0x064e3b : idx % 2 === 0 ? 0x131f35 : 0x0f182a;
        const rowStroke = isNew ? 0x4ade80 : idx === 0 ? 0xfacc15 : 0x334155;

        const rowBg = scene.add.rectangle(cx, rowY, rowWidth, rowStep - 10, rowFill, 0.88)
            .setStrokeStyle(isNew ? 2 : 1, rowStroke, isNew ? 0.95 : 0.65);

        const rankColorHex = isNew
            ? '#4ade80'
            : idx === 0
                ? '#fde047'
                : idx === 1
                    ? '#e2e8f0'
                    : idx === 2
                        ? '#fdba74'
                        : '#94a3b8';

        const badgeColor = idx < 3 ? medalColors[idx] : 0x334155;
        const badge = scene.add.rectangle(cx - rowWidth / 2 + 42, rowY, 52, 34, badgeColor, idx < 3 ? 0.22 : 0.45)
            .setStrokeStyle(1.5, badgeColor, 0.9);
        const rankTxt = scene.add.text(cx - rowWidth / 2 + 42, rowY, `#${idx + 1}`, {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: rankColorHex,
        }).setOrigin(0.5);

        const nameTxt = scene.add.text(cx - rowWidth / 2 + 84, rowY, entry.name, {
            fontSize: '24px',
            fontFamily: 'future, sans-serif',
            color: isNew ? '#86efac' : '#f8fafc',
        }).setOrigin(0, 0.5);

        const lvlTxt = scene.add.text(cx + 80, rowY, `LVL ${entry.level}`, {
            fontSize: '20px',
            fontFamily: 'future, sans-serif',
            color: '#38bdf8',
        }).setOrigin(0.5);

        const scoreTxt = scene.add.text(cx + rowWidth / 2 - 22, rowY, `${entry.score.toLocaleString('fr-FR')} PTS`, {
            fontSize: '25px',
            fontFamily: 'future, sans-serif',
            color: rankColorHex,
        }).setOrigin(1, 0.5);

        target.add([rowBg, badge, rankTxt, nameTxt, lvlTxt, scoreTxt]);
    });
}
