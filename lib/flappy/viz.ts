/*
 * Drawing helpers for brains and DNA, shared by the live "leader brain" panel
 * and the scroll explainer so both speak the same visual language:
 *   teal = positive weight, pink = negative weight, brightness = strength.
 */

import {
  GENE_COUNT,
  GENE_LAYOUT,
  HIDDEN_COUNT,
  INPUT_COUNT,
  INPUT_LABELS,
  OUTPUT_COUNT,
  OUTPUT_LABELS,
  type Genes,
} from "./sim";

export const COLORS = {
  positive: "#4ec0ca",
  negative: "#ff5d8f",
  neutral: "#1d2a52",
  accent: "#f4ce10",
  ink: "#0b1433",
  text: "#e9eefc",
  muted: "#8d9bc7",
} as const;

type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const POS = hex(COLORS.positive);
const NEG = hex(COLORS.negative);
const NEUTRAL = hex(COLORS.neutral);

const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

/** Gene values mostly live in -3..3; precompute 241 colours across that range. */
const GENE_LUT_STEPS = 240;
const GENE_RANGE = 3;
const GENE_LUT = Array.from({ length: GENE_LUT_STEPS + 1 }, (_, i) => {
  const v = (i / GENE_LUT_STEPS) * 2 * GENE_RANGE - GENE_RANGE;
  const t = Math.tanh(Math.abs(v) * 1.15);
  return css(mixRgb(NEUTRAL, v >= 0 ? POS : NEG, 0.18 + 0.82 * t));
});

export function geneColor(value: number): string {
  const v = Math.max(-GENE_RANGE, Math.min(GENE_RANGE, value));
  return GENE_LUT[Math.round(((v + GENE_RANGE) / (2 * GENE_RANGE)) * GENE_LUT_STEPS)];
}

export function hueColor(hue: number, lightness = 60, alpha = 1) {
  return `hsla(${hue.toFixed(0)}, 85%, ${lightness}%, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Network geometry
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface NetGeometry {
  inputs: Point[];
  hidden: Point[];
  outputs: Point[];
  radius: number;
}

export function networkGeometry(x: number, y: number, w: number, h: number): NetGeometry {
  const radius = Math.max(3, Math.min(13, h / (HIDDEN_COUNT * 2.7)));
  const column = (count: number, cx: number, spread: number): Point[] => {
    const span = (h - radius * 2) * spread;
    const top = y + (h - span) / 2;
    return Array.from({ length: count }, (_, i) => ({ x: cx, y: count === 1 ? y + h / 2 : top + (span * i) / (count - 1) }));
  };
  return {
    inputs: column(INPUT_COUNT, x + radius, 0.78),
    hidden: column(HIDDEN_COUNT, x + w / 2, 1),
    outputs: column(OUTPUT_COUNT, x + w - radius, 0.42),
    radius,
  };
}

export type GeneAnchor = { kind: "edge"; from: Point; to: Point } | { kind: "bias"; at: Point };

/** Where gene `i` lives in the drawn network: a connection or a neuron's bias. */
export function geneAnchor(i: number, geo: NetGeometry): GeneAnchor {
  const { hiddenBias, hiddenOutput, outputBias } = GENE_LAYOUT;
  if (i < hiddenBias) return { kind: "edge", from: geo.inputs[i % INPUT_COUNT], to: geo.hidden[Math.floor(i / INPUT_COUNT)] };
  if (i < hiddenOutput) return { kind: "bias", at: geo.hidden[i - hiddenBias] };
  if (i < outputBias) {
    const j = i - hiddenOutput;
    return { kind: "edge", from: geo.hidden[j % HIDDEN_COUNT], to: geo.outputs[Math.floor(j / HIDDEN_COUNT)] };
  }
  return { kind: "bias", at: geo.outputs[i - outputBias] };
}

export interface Activations {
  inputs: ArrayLike<number>;
  hidden: ArrayLike<number>;
  output: ArrayLike<number>;
}

export interface NetworkStyle {
  /** Draw the connections (default true). */
  edges?: boolean;
  /** 0..1 phase of a signal pulse travelling input -> hidden -> output. */
  pulse?: number;
  labels?: boolean;
  /** Show the numeric input values next to their labels. */
  values?: boolean;
  font?: string;
  labelColor?: string;
}

export function drawNetwork(ctx: CanvasRenderingContext2D, geo: NetGeometry, genes: Genes, act: Activations | null, style: NetworkStyle = {}) {
  const { radius } = geo;
  const flapWins = act ? act.output[0] > act.output[1] : false;

  ctx.save();
  // Respect any fade the caller applied.
  const base = ctx.globalAlpha;
  ctx.lineCap = "round";
  for (let i = 0; style.edges !== false && i < GENE_COUNT; i++) {
    const anchor = geneAnchor(i, geo);
    if (anchor.kind !== "edge") continue;
    const w = genes[i];
    const strength = Math.min(1, Math.abs(w) / 2);
    ctx.strokeStyle = w >= 0 ? COLORS.positive : COLORS.negative;
    ctx.globalAlpha = base * (0.12 + 0.68 * strength);
    ctx.lineWidth = 0.6 + 2.4 * strength;
    ctx.beginPath();
    ctx.moveTo(anchor.from.x, anchor.from.y);
    ctx.lineTo(anchor.to.x, anchor.to.y);
    ctx.stroke();
  }

  if (style.pulse !== undefined) {
    const p = style.pulse;
    const firstLayer = p < 0.5;
    const t = easeInOut(firstLayer ? p * 2 : (p - 0.5) * 2);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < GENE_COUNT; i++) {
      const anchor = geneAnchor(i, geo);
      if (anchor.kind !== "edge" || (i < GENE_LAYOUT.hiddenOutput) !== firstLayer) continue;
      ctx.globalAlpha = base * (0.25 + 0.75 * Math.min(1, Math.abs(genes[i]) / 1.5));
      ctx.beginPath();
      ctx.arc(lerp(anchor.from.x, anchor.to.x, t), lerp(anchor.from.y, anchor.to.y, t), Math.max(1.4, radius * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = base;

  const node = (pt: Point, activation: number, glow: boolean) => {
    if (glow) {
      ctx.shadowColor = COLORS.accent;
      ctx.shadowBlur = radius * 1.6;
    }
    ctx.fillStyle = css(mixRgb(hex(COLORS.ink), glow ? hex(COLORS.accent) : [233, 238, 252], 0.15 + 0.85 * activation));
    ctx.strokeStyle = glow ? COLORS.accent : "rgba(233,238,252,0.7)";
    ctx.lineWidth = Math.max(1, radius * 0.16);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
  };
  geo.inputs.forEach((pt, i) => node(pt, act ? clamp01(act.inputs[i]) : 0.4, false));
  geo.hidden.forEach((pt, i) => node(pt, act ? act.hidden[i] : 0.4, false));
  geo.outputs.forEach((pt, i) => node(pt, act ? act.output[i] : 0.4, act ? (i === 0 ? flapWins : !flapWins) : false));

  if (style.labels) {
    ctx.font = style.font ?? "11px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillStyle = style.labelColor ?? COLORS.text;
    ctx.textAlign = "right";
    geo.inputs.forEach((pt, i) => {
      const value = style.values && act ? ` ${act.inputs[i].toFixed(2)}` : "";
      ctx.fillText(`${INPUT_LABELS[i]}${value}`, pt.x - radius - 6, pt.y);
    });
    ctx.textAlign = "left";
    geo.outputs.forEach((pt, i) => {
      const winner = act ? (i === 0 ? flapWins : !flapWins) : false;
      ctx.fillStyle = winner ? COLORS.accent : style.labelColor ?? COLORS.text;
      ctx.fillText(OUTPUT_LABELS[i].toUpperCase(), pt.x + radius + 6, pt.y);
    });
  }
  ctx.restore();
}

export interface GeneStripStyle {
  gap?: number;
  /** Per-gene highlight strength 0..1 (used for mutation flashes). */
  highlight?: ArrayLike<number>;
  /** Draw gene i only if i < count (for "typing out" animations). */
  count?: number;
}

export function drawGenes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, genes: ArrayLike<number>, style: GeneStripStyle = {}) {
  const n = genes.length;
  const gap = style.gap ?? Math.min(1.5, (w / n) * 0.2);
  const bar = (w - gap * (n - 1)) / n;
  const count = style.count ?? n;
  for (let i = 0; i < Math.min(n, count); i++) {
    const bx = x + i * (bar + gap);
    ctx.fillStyle = geneColor(genes[i]);
    ctx.fillRect(bx, y, bar, h);
    const hl = style.highlight?.[i] ?? 0;
    if (hl > 0) {
      ctx.fillStyle = `rgba(255,255,255,${hl * 0.85})`;
      ctx.fillRect(bx - 1, y - 2, bar + 2, h + 4);
    }
  }
}

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
