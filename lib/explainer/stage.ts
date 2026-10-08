/*
 * The animated stage behind the "How it learns" scrollytelling section.
 *
 * Ten scenes share one canvas. The same twelve birds persist across scenes and
 * glide between layouts (grid -> flight -> ranking -> roulette wheel ...), while
 * each scene draws its own backdrop and overlays and cross-fades in and out.
 * The data is scripted but uses the real genome format, fitness formula and
 * mutation settings from the game, plus a recorded training curve.
 */

import {
  GENE_COUNT,
  GENE_LAYOUT,
  HIDDEN_COUNT,
  INPUT_COUNT,
  OUTPUT_COUNT,
  activate,
  fitnessOf,
  genesHue,
  mulberry32,
  randomGenes,
  type Genes,
} from "@/lib/flappy/sim";
import type { Sprites, TintCache } from "@/lib/flappy/sprites";
import {
  COLORS,
  clamp01,
  drawGenes,
  drawNetwork,
  easeInOut,
  easeOut,
  easeOutBack,
  geneAnchor,
  geneColor,
  hueColor,
  lerp,
  networkGeometry,
  type NetGeometry,
} from "@/lib/flappy/viz";

export const STEP_COUNT = 10;

export const STEP = {
  sees: 0,
  brain: 1,
  dna: 2,
  generation: 3,
  flight: 4,
  fitness: 5,
  selection: 6,
  mutation: 7,
  crossover: 8,
  repeat: 9,
} as const;

/** Colours for the five senses, shared by the "sees" and "brain" scenes. */
const SENSE_COLORS = ["#f4ce10", "#ff9f43", "#7dd3fc", "#c4b5fd", "#86efac"];
const SENSE_NAMES = ["height", "velocity", "pipe distance", "gap top", "gap bottom"];

/** Best score per generation from a real headless run (500 birds, seed 1); generation 19 passed 150 pipes. */
const RECORDED_RUN = [2, 1, 3, 1, 1, 1, 3, 1, 4, 5, 3, 2, 4, 5, 7, 4, 22, 53];

/** Times (s) at which the four pipes of the flight scene reach the birds. */
const PIPE_TIMES = [1.5, 2.6, 3.7, 4.8];
const FLIGHT_LOOP = 7.2;

/** Pipes cleared and cause of death for each of the twelve birds. Bird 0 is the champion. */
const FLIGHT_SCRIPT: [number, "pipe" | "ground"][] = [
  [3, "pipe"],
  [0, "ground"],
  [1, "pipe"],
  [0, "pipe"],
  [2, "pipe"],
  [0, "ground"],
  [1, "pipe"],
  [0, "pipe"],
  [0, "ground"],
  [2, "pipe"],
  [1, "pipe"],
  [0, "pipe"],
];

/** The roulette wheel's three spins land on these birds (after the elite is copied). */
const WHEEL_PICKS = [0, 9, 6];
const SPIN_TIME = 1.9;
const SPIN_PAUSE = 0.7;
const ELITE_TIME = 1.1;

interface StageBird {
  genes: Genes;
  hue: number;
  pipes: number;
  cause: "pipe" | "ground";
  deathTime: number;
  fitness: number;
  rank: number;
  /** -1 or 1: which side of the gap a doomed bird drifts to. */
  side: number;
  wobble: number;
  phase: number;
}

interface Pose {
  x: number;
  y: number;
  /** Bird width in CSS px. */
  size: number;
  alpha: number;
  rot: number;
  hue?: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StageOptions {
  sprites: Sprites;
  tints: TintCache;
  pixelFont: string;
  monoFont: string;
  sansFont: string;
  reducedMotion: boolean;
}

export class EvolutionStage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private opts: StageOptions;
  private w = 0;
  private h = 0;
  private dpr = 1;

  private step = 0;
  private prevStep = 0;
  private stepStart = 0;
  private sceneStart = new Float64Array(STEP_COUNT);
  private vis = new Float64Array(STEP_COUNT);
  private morph = 0;

  private raf = 0;
  private running = false;
  private last = 0;

  private birds: StageBird[];
  private ranked: number[];
  private child: { genes: Genes; mutated: number[]; deltas: number[]; hueBefore: number; hueAfter: number };
  private cross: { genes: Genes; fromB: boolean[]; hue: number };
  private hidden = new Float64Array(HIDDEN_COUNT);
  private output = new Float64Array(OUTPUT_COUNT);
  private inputs = new Float64Array(INPUT_COUNT);

  constructor(canvas: HTMLCanvasElement, opts: StageOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.opts = opts;
    this.vis[0] = 1;

    const rng = mulberry32(686);
    this.birds = FLIGHT_SCRIPT.map(([pipes, cause], i) => {
      const genes = randomGenes(rng);
      const deathTime = cause === "ground" ? 0.7 + (i % 4) * 0.12 : PIPE_TIMES[pipes] - 0.06 * (i % 3);
      return {
        genes,
        hue: genesHue(genes),
        pipes,
        cause,
        deathTime,
        fitness: fitnessOf(Math.round(deathTime * 60), pipes),
        rank: 0,
        side: i % 2 === 0 ? -1 : 1,
        wobble: 0.6 + rng() * 0.8,
        phase: rng() * Math.PI * 2,
      };
    });
    this.ranked = this.birds.map((_, i) => i).sort((a, b) => this.birds[b].fitness - this.birds[a].fitness);
    this.ranked.forEach((birdIndex, rank) => (this.birds[birdIndex].rank = rank));

    const mrng = mulberry32(99);
    const champion = this.birds[0];
    const mutated: number[] = [];
    while (mutated.length < 7) {
      const g = Math.floor(mrng() * GENE_COUNT);
      if (!mutated.includes(g)) mutated.push(g);
    }
    mutated.sort((a, b) => a - b);
    const childGenes = champion.genes.slice();
    const deltas = mutated.map(() => (mrng() * 2 - 1) * 0.5);
    mutated.forEach((g, k) => (childGenes[g] += deltas[k]));
    this.child = { genes: childGenes, mutated, deltas, hueBefore: champion.hue, hueAfter: genesHue(childGenes) };

    const partner = this.birds[WHEEL_PICKS[1]];
    const fromB = Array.from({ length: GENE_COUNT }, () => mrng() < 0.5);
    const crossGenes = champion.genes.map((g, i) => (fromB[i] ? partner.genes[i] : g));
    this.cross = { genes: crossGenes, fromB, hue: genesHue(crossGenes) };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (!this.running) this.draw(performance.now());
  }

  setStep(step: number) {
    if (step === this.step) return;
    const now = performance.now();
    this.prevStep = this.step;
    this.step = step;
    this.stepStart = now;
    this.sceneStart[step] = now;
  }

  setRunning(running: boolean) {
    if (running === this.running) return;
    this.running = running;
    if (running) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } else {
      cancelAnimationFrame(this.raf);
    }
  }

  destroy() {
    this.setRunning(false);
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const k = this.opts.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    for (let i = 0; i < STEP_COUNT; i++) this.vis[i] += ((i === this.step ? 1 : 0) - this.vis[i]) * k;
    const morphTarget = this.step >= STEP.dna ? 1 : 0;
    const morphStep = this.opts.reducedMotion ? 1 : dt / 1.3;
    this.morph = morphTarget > this.morph ? Math.min(1, this.morph + morphStep) : Math.max(0, this.morph - morphStep);
    this.draw(now);
  };

  /** Seconds since `scene` became active; frozen at a representative moment for reduced motion. */
  private time(scene: number, now: number) {
    if (this.opts.reducedMotion) return [2.2, 1.2, 3, 3, 3.3, 3, 8.6, 4.5, 3, 7.5][scene];
    return (now - this.sceneStart[scene]) / 1000;
  }

  private draw(now: number) {
    const { ctx, w, h } = this;
    if (w === 0 || h === 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const visible = (i: number) => this.vis[i] > 0.01;
    const brainAlpha = Math.max(this.vis[STEP.brain], this.vis[STEP.dna]);

    // Backdrops
    if (visible(STEP.sees)) this.layer(this.vis[STEP.sees], () => this.drawSees(this.time(STEP.sees, now), now));
    if (brainAlpha > 0.01) this.layer(brainAlpha, () => this.drawBrainDna(now));
    if (visible(STEP.flight)) this.layer(this.vis[STEP.flight], () => this.drawFlightBack(this.flightTime(now)));
    if (visible(STEP.fitness)) this.layer(this.vis[STEP.fitness], () => this.drawFitnessBack(this.time(STEP.fitness, now)));
    if (visible(STEP.selection)) this.layer(this.vis[STEP.selection], () => this.drawWheel(this.time(STEP.selection, now)));
    if (visible(STEP.generation)) this.layer(this.vis[STEP.generation], () => this.drawGenerationBack(this.time(STEP.generation, now)));

    this.drawBirds(now);

    // Foregrounds
    if (visible(STEP.flight)) this.layer(this.vis[STEP.flight], () => this.drawFlightFront(this.flightTime(now)));
    if (visible(STEP.selection)) this.layer(this.vis[STEP.selection], () => this.drawTray(this.time(STEP.selection, now), now));
    if (visible(STEP.mutation)) this.layer(this.vis[STEP.mutation], () => this.drawMutation(this.time(STEP.mutation, now), now));
    if (visible(STEP.crossover)) this.layer(this.vis[STEP.crossover], () => this.drawCrossover(this.time(STEP.crossover, now), now));
    if (visible(STEP.repeat)) this.layer(this.vis[STEP.repeat], () => this.drawRepeat(this.time(STEP.repeat, now), now));
  }

  private layer(alpha: number, draw: () => void) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    draw();
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Layout helpers
  // -------------------------------------------------------------------------

  /** Area below the stage's HUD row, inset by a gutter. */
  private content(): Rect {
    const pad = Math.max(14, Math.min(28, this.w * 0.04));
    const top = 52;
    return { x: pad, y: top, w: this.w - pad * 2, h: this.h - top - pad };
  }

  private birdSize() {
    const c = this.content();
    return Math.max(24, Math.min(46, Math.min(c.w, c.h) * 0.085));
  }

  private get wide() {
    return this.w > this.h * 1.05;
  }

  // -------------------------------------------------------------------------
  // Birds (persistent entities)
  // -------------------------------------------------------------------------

  private drawBirds(now: number) {
    const tr = this.opts.reducedMotion ? 1 : easeInOut(clamp01((now - this.stepStart) / 750));
    const frame = Math.floor(now / 90) % 4;
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const from = this.pose(this.prevStep, i, now);
      const to = this.pose(this.step, i, now);
      let pose: Pose | null;
      if (tr >= 1 || !from) pose = to ? { ...to, alpha: to.alpha * (from ? 1 : tr) } : null;
      else if (!to) pose = { ...from, alpha: from.alpha * (1 - tr) };
      else
        pose = {
          x: lerp(from.x, to.x, tr),
          y: lerp(from.y, to.y, tr),
          size: lerp(from.size, to.size, tr),
          alpha: lerp(from.alpha, to.alpha, tr),
          rot: lerp(from.rot, to.rot, tr),
          hue: to.hue ?? from.hue,
        };
      if (pose && pose.alpha > 0.01) this.drawBird(pose, frame + i, this.birds[i].hue);
    }
  }

  private drawBird(pose: Pose, frame: number, hue: number) {
    const { ctx } = this;
    const img = this.opts.tints.get(((frame % 4) + 4) % 4, pose.hue ?? hue);
    const bw = pose.size;
    const bh = (bw * 24) / 34;
    ctx.save();
    ctx.globalAlpha *= pose.alpha;
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.rot);
    ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }

  private pose(scene: number, i: number, now: number): Pose | null {
    const t = this.time(scene, now);
    switch (scene) {
      case STEP.generation:
        return this.gridPose(i, t, now);
      case STEP.flight:
        return this.flightPose(i, this.flightTime(now));
      case STEP.fitness:
        return this.rankPose(i);
      case STEP.selection:
        return this.wheelPose(i, t);
      case STEP.mutation:
        return i === 0 ? this.rowPose(0, 0) : null;
      case STEP.crossover:
        if (i === 0) return this.rowPose(0, 1);
        if (i === WHEEL_PICKS[1]) return this.rowPose(1, 1);
        return null;
      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // Scene 0: what a bird sees
  // -------------------------------------------------------------------------

  /** Draws the Flappy background into `r`, bottom-aligned, and returns the sky band. */
  private drawWorld(r: Rect, radius = 14) {
    const { ctx } = this;
    const bg = this.opts.sprites.background;
    const scale = Math.max(r.w / 360, r.h / 640);
    const dw = 360 * scale;
    const dh = 640 * scale;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    // "Cover" fit, bottom-aligned so the ground and skyline stay visible.
    ctx.drawImage(bg, r.x + (r.w - dw) / 2, r.y + r.h - dh, dw, dh);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
    const groundY = r.y + r.h - (640 - 577) * scale;
    return { skyTop: r.y, groundY, scale };
  }

  /** Repaints the ground strip of drawWorld's background on top of pipes. */
  private drawGround(r: Rect) {
    const { ctx } = this;
    const bg = this.opts.sprites.background;
    const scale = Math.max(r.w / 360, r.h / 640);
    const srcY = 576;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 14);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, srcY, 360, 640 - srcY, r.x + (r.w - 360 * scale) / 2, r.y + r.h - (640 - srcY) * scale, 360 * scale, (640 - srcY) * scale);
    ctx.restore();
  }

  private drawPipePair(x: number, width: number, gapTop: number, gapBottom: number, clip: Rect) {
    const { ctx } = this;
    const { topPipe, bottomPipe } = this.opts.sprites;
    const pipeH = width * 8;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(clip.x, clip.y, clip.w, clip.h, 14);
    ctx.clip();
    ctx.drawImage(topPipe, x, gapTop - pipeH, width, pipeH);
    ctx.drawImage(bottomPipe, x, gapBottom, width, pipeH);
    ctx.restore();
  }

  private drawSees(t: number, now: number) {
    const { ctx } = this;
    const c = this.content();
    const world = this.drawWorld(c);
    const sky = world.groundY - c.y;
    const S = this.birdSize() * 1.25;
    const pipeX = c.x + c.w * 0.64;
    const pipeW = S * 1.7;
    const gapTop = c.y + sky * 0.3;
    const gapBottom = gapTop + sky * 0.34;
    this.drawPipePair(pipeX, pipeW, gapTop, gapBottom, c);
    this.drawGround(c);

    const bob = Math.sin(now / 420) * sky * 0.05;
    const vel = Math.cos(now / 420);
    const bx = c.x + c.w * 0.2;
    const by = c.y + sky * 0.56 + bob;
    this.drawBird({ x: bx, y: by, size: S, alpha: 1, rot: -vel * 0.25 }, Math.floor(now / 90), 50);

    const font = `600 ${Math.round(Math.max(11, Math.min(14, c.w * 0.026)))}px ${this.opts.sansFont}`;
    const reveal = (k: number) => easeOut(clamp01((t - 0.25 - k * 0.32) / 0.45));
    const right = bx + S * 0.5 + 6;

    // 1: height (distance from the top of the screen)
    this.measure(reveal(0), SENSE_COLORS[0], [bx, c.y + 4], [bx, by - S * 0.4], `① ${SENSE_NAMES[0]}`, "right", font);
    // 2: velocity arrow
    if (reveal(1) > 0) {
      ctx.save();
      ctx.globalAlpha *= reveal(1);
      const len = vel * sky * 0.12;
      this.arrow(bx - S * 0.75, by, bx - S * 0.75, by - len, SENSE_COLORS[1]);
      this.pill(`② ${SENSE_NAMES[1]}`, bx - S * 0.75, vel > 0 ? by + S * 0.95 : by - S * 0.95, SENSE_COLORS[1], font, "center");
      ctx.restore();
    }
    // 3: horizontal distance to the pipe
    this.measure(reveal(2), SENSE_COLORS[2], [right, by], [pipeX - 4, by], `③ ${SENSE_NAMES[2]}`, "above", font);
    // 4 & 5: gap edges
    this.measure(reveal(3), SENSE_COLORS[3], [right, gapTop], [pipeX + pipeW, gapTop], `④ ${SENSE_NAMES[3]}`, "above", font);
    this.measure(reveal(4), SENSE_COLORS[4], [right, gapBottom], [pipeX + pipeW, gapBottom], `⑤ ${SENSE_NAMES[4]}`, "below", font);
  }

  private measure(alpha: number, color: string, a: [number, number], b: [number, number], label: string, place: "above" | "below" | "right", font: string) {
    if (alpha <= 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    const bx = lerp(a[0], b[0], alpha);
    const by = lerp(a[1], b[1], alpha);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    for (const [x, y] of [a, [bx, by]]) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (place === "right") this.pill(label, a[0] + 10, my, color, font, "left");
    else this.pill(label, mx, my + (place === "above" ? -16 : 16), color, font, "center");
    ctx.restore();
  }

  private arrow(x1: number, y1: number, x2: number, y2: number, color: string) {
    const { ctx } = this;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2 + Math.cos(angle) * 4, y2 + Math.sin(angle) * 4);
    ctx.lineTo(x2 + Math.cos(angle + 2.5) * 10, y2 + Math.sin(angle + 2.5) * 10);
    ctx.lineTo(x2 + Math.cos(angle - 2.5) * 10, y2 + Math.sin(angle - 2.5) * 10);
    ctx.closePath();
    ctx.fill();
  }

  private pill(text: string, x: number, y: number, color: string, font: string, align: "left" | "center" | "right") {
    const { ctx } = this;
    ctx.font = font;
    const tw = ctx.measureText(text).width;
    const ph = 22;
    const pw = tw + 14;
    let left = align === "left" ? x : align === "right" ? x - pw : x - pw / 2;
    left = Math.max(4, Math.min(this.w - pw - 4, left));
    ctx.fillStyle = "rgba(11,20,51,0.88)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(left, y - ph / 2, pw, ph, 11);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, left + 7, y + 0.5);
  }

  // -------------------------------------------------------------------------
  // Scenes 1 & 2: the brain, unravelled into DNA
  // -------------------------------------------------------------------------

  private brainGeometry(): NetGeometry {
    const c = this.content();
    const labelW = Math.max(78, Math.min(132, c.w * 0.27));
    const outW = Math.max(64, Math.min(96, c.w * 0.18));
    const netH = Math.min(c.h * 0.8, c.w * 0.82);
    return networkGeometry(c.x + labelW, c.y + (c.h - netH) / 2 - 8, c.w - labelW - outW, netH);
  }

  private stripRect(): Rect {
    const c = this.content();
    const h = Math.max(48, Math.min(120, c.h * 0.24));
    // Centre the strip plus its title (~34px) and annotations (~150px) vertically.
    const group = 34 + h + 150;
    return { x: c.x, y: c.y + Math.max(30, (c.h - group) / 2 + 34), w: c.w, h };
  }

  private drawBrainDna(now: number) {
    const { ctx } = this;
    const genes = this.birds[0].genes;
    const geo = this.brainGeometry();
    const strip = this.stripRect();
    const gap = Math.min(2, strip.w / GENE_COUNT / 4);
    const bar = (strip.w - gap * (GENE_COUNT - 1)) / GENE_COUNT;
    const m = this.morph;
    const font = `600 ${Math.round(Math.max(10, Math.min(13, this.w * 0.024)))}px ${this.opts.sansFont}`;

    // Inputs drift smoothly so the network visibly reacts.
    const s = now / 1000;
    this.inputs[0] = 0.5 + 0.25 * Math.sin(s * 1.3);
    this.inputs[1] = 0.6 * Math.cos(s * 1.3);
    this.inputs[2] = 0.5 + 0.4 * Math.sin(s * 0.55);
    this.inputs[3] = 0.35 + 0.1 * Math.sin(s * 0.7);
    this.inputs[4] = this.inputs[3] + 0.25;
    activate(genes, this.inputs, this.hidden, this.output);

    if (m < 1) {
      const netAlpha = 1 - easeOut(m * 1.6);
      ctx.save();
      ctx.globalAlpha *= netAlpha;
      drawNetwork(
        ctx,
        geo,
        genes,
        { inputs: this.inputs, hidden: this.hidden, output: this.output },
        { pulse: m === 0 ? (s * 0.6) % 1 : undefined, edges: m === 0 },
      );
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      geo.inputs.forEach((p, i) => {
        ctx.fillStyle = SENSE_COLORS[i];
        ctx.fillText(SENSE_NAMES[i], p.x - geo.radius - 8, p.y);
      });
      const flap = this.output[0] > this.output[1];
      ctx.textAlign = "left";
      ctx.font = `${Math.round(Math.max(9, Math.min(12, this.w * 0.02)))}px ${this.opts.pixelFont}`;
      geo.outputs.forEach((p, i) => {
        const winner = i === 0 ? flap : !flap;
        ctx.fillStyle = winner ? COLORS.accent : COLORS.muted;
        ctx.fillText(i === 0 ? "FLAP" : "WAIT", p.x + geo.radius + 8, p.y);
      });
      if (m === 0) {
        const b = geo.outputs[0];
        const hop = flap ? Math.abs(Math.sin(now / 120)) * 8 : 0;
        this.drawBird({ x: b.x + geo.radius + 26, y: b.y - geo.radius - 22 - hop, size: this.birdSize() * 0.9, alpha: 1, rot: flap ? -0.35 : 0.2 }, Math.floor(now / 90), this.birds[0].hue);
      }
      ctx.restore();
    }

    if (m > 0) {
      // Morph: every connection line becomes one vertical gene bar.
      ctx.save();
      const base = ctx.globalAlpha;
      ctx.lineCap = "butt";
      for (let i = 0; i < GENE_COUNT; i++) {
        const p = easeInOut(clamp01(m * 1.7 - (i / GENE_COUNT) * 0.7));
        const anchor = geneAnchor(i, geo);
        const tx = strip.x + i * (bar + gap) + bar / 2;
        let x1: number, y1: number, x2: number, y2: number, width: number;
        if (anchor.kind === "edge") {
          [x1, y1, x2, y2] = [anchor.from.x, anchor.from.y, anchor.to.x, anchor.to.y];
          width = 0.6 + 2.4 * Math.min(1, Math.abs(genes[i]) / 2);
        } else {
          [x1, y1, x2, y2] = [anchor.at.x, anchor.at.y - geo.radius, anchor.at.x, anchor.at.y + geo.radius];
          width = geo.radius * 1.2;
        }
        ctx.globalAlpha = base * (0.35 + 0.65 * p);
        ctx.strokeStyle = p < 0.5 ? (genes[i] >= 0 ? COLORS.positive : COLORS.negative) : geneColor(genes[i]);
        ctx.lineWidth = lerp(width, bar, p);
        ctx.beginPath();
        ctx.moveTo(lerp(x1, tx, p), lerp(y1, strip.y, p));
        ctx.lineTo(lerp(x2, tx, p), lerp(y2, strip.y + strip.h, p));
        ctx.stroke();
      }
      ctx.restore();

      const done = easeOut(clamp01((m - 0.85) / 0.15));
      if (done > 0) {
        ctx.save();
        ctx.globalAlpha *= done;
        this.drawStripAnnotations(strip, bar, gap, font, now);
        ctx.restore();
      }
    }
  }

  private drawStripAnnotations(strip: Rect, bar: number, gap: number, font: string, now: number) {
    const { ctx } = this;
    const c = this.content();
    const sections: [number, number, string][] = [
      [GENE_LAYOUT.inputHidden, GENE_LAYOUT.hiddenBias, "40 weights: senses → hidden"],
      [GENE_LAYOUT.hiddenBias, GENE_LAYOUT.hiddenOutput, "8 biases"],
      [GENE_LAYOUT.hiddenOutput, GENE_LAYOUT.outputBias, "16 weights: hidden → output"],
      [GENE_LAYOUT.outputBias, GENE_COUNT, "2"],
    ];
    ctx.font = font;
    ctx.textBaseline = "top";
    sections.forEach(([from, to, label], k) => {
      const x1 = strip.x + from * (bar + gap);
      const x2 = strip.x + to * (bar + gap) - gap;
      const level = k % 2;
      const y = strip.y + strip.h + 10 + level * 30;
      ctx.strokeStyle = COLORS.muted;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y - 4);
      ctx.lineTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.lineTo(x2, y - 4);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      const tw = ctx.measureText(label).width;
      const lx = Math.max(c.x, Math.min(c.x + c.w - tw, (x1 + x2) / 2 - tw / 2));
      ctx.fillText(label, lx, y + 5);
    });

    // Title above the strip
    ctx.font = `${Math.round(Math.max(11, Math.min(16, this.w * 0.03)))}px ${this.opts.pixelFont}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = COLORS.accent;
    ctx.fillText("66 GENES", strip.x, strip.y - 12);

    // A ticker of the actual numbers, to show that genes are just numbers.
    const genes = this.birds[0].genes;
    const start = Math.floor(now / 380) % GENE_COUNT;
    const values = Array.from({ length: 8 }, (_, k) => genes[(start + k) % GENE_COUNT]);
    ctx.font = `500 ${Math.round(Math.max(11, Math.min(14, this.w * 0.026)))}px ${this.opts.monoFont}`;
    ctx.textBaseline = "top";
    let x = c.x;
    const y = strip.y + strip.h + 82;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("[", x, y);
    x += ctx.measureText("[").width + 2;
    for (const v of values) {
      const text = `${v >= 0 ? " " : "−"}${Math.abs(v).toFixed(2)}, `;
      ctx.fillStyle = v >= 0 ? COLORS.positive : COLORS.negative;
      if (x + ctx.measureText(text).width > c.x + c.w - 20) break;
      ctx.fillText(text, x, y);
      x += ctx.measureText(text).width;
    }
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("…]", x, y);

    // Legend
    const ly = y + 34;
    ctx.font = font;
    ctx.textBaseline = "middle";
    let lx = c.x;
    for (const [color, text] of [
      [COLORS.positive, "positive"],
      [COLORS.negative, "negative"],
    ] as const) {
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - 6, 12, 12);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(text, lx + 18, ly);
      lx += 18 + ctx.measureText(text).width + 18;
    }
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("brighter = stronger", lx, ly);
  }

  // -------------------------------------------------------------------------
  // Scene 3: generation 1
  // -------------------------------------------------------------------------

  private gridCell(i: number): Rect {
    const c = this.content();
    const cols = 4;
    const rows = 3;
    const cw = c.w / cols;
    const ch = (c.h - 20) / rows;
    return { x: c.x + (i % cols) * cw, y: c.y + 20 + Math.floor(i / cols) * ch, w: cw, h: ch };
  }

  private gridPose(i: number, t: number, now: number): Pose {
    const cell = this.gridCell(i);
    const pop = easeOutBack(clamp01((t - 0.15 - i * 0.07) / 0.5));
    const size = Math.min(this.birdSize() * 1.25, cell.w * 0.5);
    return {
      x: cell.x + cell.w / 2,
      y: cell.y + cell.h * 0.42 + Math.sin(now / 380 + i) * 3,
      size: size * Math.max(0.01, pop),
      alpha: clamp01(pop * 1.5),
      rot: Math.sin(now / 500 + i * 1.7) * 0.08,
    };
  }

  private drawGenerationBack(t: number) {
    const { ctx } = this;
    const c = this.content();
    ctx.font = `${Math.round(Math.max(10, Math.min(13, this.w * 0.024)))}px ${this.opts.pixelFont}`;
    ctx.fillStyle = COLORS.accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("GENERATION 1", c.x, c.y - 6);
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "right";
    ctx.fillText("12 OF 500", c.x + c.w, c.y - 6);
    this.birds.forEach((bird, i) => {
      const cell = this.gridCell(i);
      const appear = easeOut(clamp01((t - 0.35 - i * 0.07) / 0.5));
      if (appear <= 0) return;
      const sw = cell.w * 0.78;
      const sx = cell.x + (cell.w - sw) / 2;
      const sy = cell.y + cell.h * 0.7;
      ctx.save();
      ctx.globalAlpha *= appear;
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.strokeStyle = "rgba(141,155,199,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cell.x + 5, cell.y + 4, cell.w - 10, cell.h - 8, 12);
      ctx.fill();
      ctx.stroke();
      drawGenes(ctx, sx, sy, sw * appear, Math.max(8, cell.h * 0.12), bird.genes, { gap: 0.3, count: Math.ceil(GENE_COUNT * appear) });
      ctx.restore();
    });
  }

  // -------------------------------------------------------------------------
  // Scene 4: flight
  // -------------------------------------------------------------------------

  private flightTime(now: number) {
    if (this.opts.reducedMotion) return 3.3;
    return this.time(STEP.flight, now) % FLIGHT_LOOP;
  }

  private flightWorld() {
    const c = this.content();
    const S = this.birdSize() * 0.9;
    const groundY = c.y + c.h - (640 - 577) * Math.max(c.w / 360, c.h / 640);
    const sky = groundY - c.y;
    const birdX = c.x + c.w * 0.24;
    const speed = c.w * 0.34;
    const pipeW = S * 1.5;
    const gaps = [0.42, 0.62, 0.36, 0.55].map((f) => c.y + sky * f);
    const gapH = sky * 0.3;
    return { c, S, groundY, sky, birdX, speed, pipeW, gaps, gapH };
  }

  /** Where the flock is heading: eases from one gap centre to the next. */
  private flightTarget(t: number, gaps: number[], startY: number) {
    let prevT = 0;
    let prevY = startY;
    for (let k = 0; k < PIPE_TIMES.length; k++) {
      if (t <= PIPE_TIMES[k]) return lerp(prevY, gaps[k], easeInOut(clamp01((t - prevT) / (PIPE_TIMES[k] - prevT))));
      prevT = PIPE_TIMES[k];
      prevY = gaps[k];
    }
    return prevY;
  }

  private flightPose(i: number, t: number): Pose {
    const f = this.flightWorld();
    const bird = this.birds[i];
    const x = f.birdX + ((i % 4) - 1.5) * f.S * 0.32;
    const startY = f.c.y + f.sky * 0.5;
    const alive = t < bird.deathTime;
    const at = alive ? t : bird.deathTime;

    let y: number;
    if (bird.cause === "ground") {
      y = startY + (f.groundY - f.S * 0.35 - startY) * Math.pow(at / bird.deathTime, 2) - Math.sin(at * 9 + bird.phase) * f.S * 0.15 * (1 - at / bird.deathTime);
    } else {
      const base = this.flightTarget(at, f.gaps, startY);
      const wob = Math.sin(at * (3 + bird.wobble * 2) + bird.phase) * f.gapH * 0.18 * bird.wobble;
      // Doomed birds drift out of the gap as their fatal pipe approaches.
      const drift = bird.side * f.gapH * 0.85 * easeInOut(clamp01((at - (bird.deathTime - 0.7)) / 0.7));
      y = base + wob * (1 - clamp01((at - (bird.deathTime - 0.7)) / 0.7)) + drift;
    }
    let rot = Math.sin(at * 6 + bird.phase) * 0.18;
    let alpha = 1;
    let px = x;
    if (!alive) {
      const dt = t - bird.deathTime;
      y = Math.min(f.groundY - f.S * 0.3, y + 0.5 * f.sky * 2.2 * dt * dt);
      rot = Math.min(1.4, 0.3 + dt * 4);
      px = x - f.speed * dt;
      alpha = clamp01(1 - (dt - 0.6) / 0.6) * clamp01((px - f.c.x - f.S * 0.3) / f.S);
    }
    return { x: px, y, size: f.S, alpha, rot };
  }

  private drawFlightBack(t: number) {
    const f = this.flightWorld();
    this.drawWorld(f.c);
    for (let k = 0; k < PIPE_TIMES.length; k++) {
      const x = f.birdX + (PIPE_TIMES[k] - t) * f.speed - f.pipeW / 2;
      if (x > f.c.x + f.c.w || x < f.c.x - f.pipeW) continue;
      this.drawPipePair(x, f.pipeW, f.gaps[k] - f.gapH / 2, f.gaps[k] + f.gapH / 2, f.c);
    }
    this.drawGround(f.c);
  }

  private drawFlightFront(t: number) {
    const { ctx } = this;
    const f = this.flightWorld();
    const alive = this.birds.filter((b) => t < b.deathTime).length;
    const pipes = PIPE_TIMES.filter((pt) => t > pt + 0.15).length;
    const size = Math.round(Math.max(9, Math.min(12, this.w * 0.022)));
    ctx.font = `${size}px ${this.opts.pixelFont}`;
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.strokeText(`ALIVE ${alive}/12`, f.c.x + 12, f.c.y + 12);
    ctx.fillText(`ALIVE ${alive}/12`, f.c.x + 12, f.c.y + 12);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.accent;
    ctx.strokeText(`PIPES ${pipes}`, f.c.x + f.c.w - 12, f.c.y + 12);
    ctx.fillText(`PIPES ${pipes}`, f.c.x + f.c.w - 12, f.c.y + 12);

    // A red cross where each bird crashed.
    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i];
      const dt = t - bird.deathTime;
      if (dt < 0 || dt > 1.2) continue;
      const pose = this.flightPose(i, bird.deathTime);
      const r = 6 + dt * 6;
      const x = pose.x - f.speed * dt;
      const a = (1 - dt / 1.2) * clamp01((x - f.c.x - r) / 20);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.strokeStyle = "#ff3b3b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - r, pose.y - r);
      ctx.lineTo(x + r, pose.y + r);
      ctx.moveTo(x + r, pose.y - r);
      ctx.lineTo(x - r, pose.y + r);
      ctx.stroke();
      ctx.restore();
    }

    if (t > PIPE_TIMES[3] + 0.4) {
      const a = easeOut(clamp01((t - PIPE_TIMES[3] - 0.4) / 0.4));
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.fillStyle = "rgba(11,20,51,0.6)";
      ctx.fillRect(f.c.x, f.c.y + f.sky * 0.42, f.c.w, 44);
      ctx.font = `${size + 2}px ${this.opts.pixelFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText("ALL BIRDS DOWN", f.c.x + f.c.w / 2, f.c.y + f.sky * 0.42 + 22);
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Scene 5: fitness ranking
  // -------------------------------------------------------------------------

  private rankLayout() {
    const c = this.content();
    const top = c.y + 44;
    const rowH = Math.min((c.h - 50) / 12, this.birdSize() * 1.15);
    const birdX = c.x + rowH * 0.7;
    const barX = c.x + rowH * 1.55;
    const maxLen = c.w - (barX - c.x) - 64;
    return { c, top, rowH, birdX, barX, maxLen };
  }

  private rankPose(i: number): Pose {
    const L = this.rankLayout();
    const rank = this.birds[i].rank;
    return { x: L.birdX, y: L.top + rank * L.rowH + L.rowH / 2, size: Math.min(this.birdSize(), L.rowH * 1.05), alpha: 1, rot: 0 };
  }

  private drawFitnessBack(t: number) {
    const { ctx } = this;
    const L = this.rankLayout();
    const max = this.birds[this.ranked[0]].fitness;
    const font = `600 ${Math.round(Math.max(10, Math.min(13, L.rowH * 0.42)))}px ${this.opts.monoFont}`;

    ctx.font = `500 ${Math.round(Math.max(11, Math.min(15, this.w * 0.027)))}px ${this.opts.monoFont}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("fitness = frames + 1000 × 2", L.c.x, L.c.y);
    const baseW = ctx.measureText("fitness = frames + 1000 × 2").width;
    ctx.font = `500 ${Math.round(Math.max(9, Math.min(11, this.w * 0.02)))}px ${this.opts.monoFont}`;
    ctx.fillStyle = COLORS.accent;
    ctx.fillText("pipes", L.c.x + baseW + 1, L.c.y - 4);

    this.ranked.forEach((birdIndex, rank) => {
      const bird = this.birds[birdIndex];
      const grow = easeOut(clamp01((t - 0.35 - rank * 0.06) / 0.8));
      const y = L.top + rank * L.rowH;
      const barH = L.rowH * 0.56;
      const len = Math.max(4, (bird.fitness / max) * L.maxLen * grow);
      ctx.fillStyle = hueColor(bird.hue, 58, 0.9);
      ctx.beginPath();
      ctx.roundRect(L.barX, y + (L.rowH - barH) / 2, len, barH, barH / 2);
      ctx.fill();
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = rank === 0 ? COLORS.accent : COLORS.text;
      ctx.save();
      ctx.globalAlpha *= clamp01(grow * 2);
      ctx.fillText(Math.round(bird.fitness * grow).toLocaleString("en-US"), L.barX + len + 8, y + L.rowH / 2);
      if (bird.pipes > 0 && len > 70) {
        ctx.fillStyle = "rgba(11,20,51,0.85)";
        ctx.textAlign = "right";
        ctx.fillText(`${bird.pipes} pipe${bird.pipes > 1 ? "s" : ""}`, L.barX + len - 8, y + L.rowH / 2);
      }
      ctx.restore();
    });

    const crown = this.rankPose(this.ranked[0]);
    if (t > 1.2) this.crown(crown.x, crown.y - crown.size * 0.42, crown.size * 0.3, easeOutBack(clamp01((t - 1.2) / 0.4)));
  }

  private crown(cx: number, y: number, s: number, scale = 1) {
    if (scale <= 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = COLORS.accent;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.lineTo(-s, -s);
    ctx.lineTo(-s / 2, -s * 0.45);
    ctx.lineTo(0, -s * 1.2);
    ctx.lineTo(s / 2, -s * 0.45);
    ctx.lineTo(s, -s);
    ctx.lineTo(s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Scene 6: roulette-wheel selection
  // -------------------------------------------------------------------------

  private wheelLayout() {
    const c = this.content();
    const S = this.birdSize();
    if (this.wide) {
      const r = Math.min(c.w * 0.27, c.h * 0.36);
      return { cx: c.x + c.w * 0.36, cy: c.y + c.h * 0.5, r, tray: { x: c.x + c.w * 0.72, y: c.y + c.h * 0.12, vertical: true }, S };
    }
    const r = Math.min(c.w * 0.31, c.h * 0.29);
    return { cx: c.x + c.w / 2, cy: c.y + c.h * 0.4, r, tray: { x: c.x, y: c.y + c.h * 0.83, vertical: false }, S };
  }

  /** Slice boundaries in radians, in bird order, proportional to fitness. */
  private slices() {
    const total = this.birds.reduce((sum, b) => sum + b.fitness, 0);
    let a = 0;
    return this.birds.map((b) => {
      const start = a;
      a += (b.fitness / total) * Math.PI * 2;
      return { start, end: a, mid: (start + a) / 2 };
    });
  }

  /** Wheel rotation at time t: still during the elite step, then three spins that land on WHEEL_PICKS. */
  private wheelAngle(t: number) {
    const slices = this.slices();
    let angle = 0.3;
    let local = t - ELITE_TIME;
    for (const pick of WHEEL_PICKS) {
      // Land the pick's slice centre under the pointer at the top (-PI/2).
      const target = -Math.PI / 2 - slices[pick].mid;
      const base = angle;
      let end = target;
      while (end < base + Math.PI * 4) end += Math.PI * 2;
      if (local < SPIN_TIME) return local <= 0 ? base : lerp(base, end, 1 - Math.pow(1 - local / SPIN_TIME, 4));
      angle = end;
      local -= SPIN_TIME + SPIN_PAUSE;
    }
    return angle;
  }

  private selectionCycle() {
    return ELITE_TIME + WHEEL_PICKS.length * (SPIN_TIME + SPIN_PAUSE) + 2.2;
  }

  private selectionTime(t: number) {
    return this.opts.reducedMotion ? t : t % this.selectionCycle();
  }

  /** Fades the tray out and back in when the selection loop restarts. */
  private selectionFade(t: number) {
    if (this.opts.reducedMotion || t < this.selectionCycle()) return 1;
    const st = this.selectionTime(t);
    return Math.min(1, st / 0.35, (this.selectionCycle() - st) / 0.45);
  }

  private wheelPose(i: number, t: number): Pose {
    const W = this.wheelLayout();
    const angle = this.wheelAngle(this.selectionTime(t)) + this.slices()[i].mid;
    const r = W.r + W.S * 0.62;
    return { x: W.cx + Math.cos(angle) * r, y: W.cy + Math.sin(angle) * r, size: W.S * 0.78, alpha: Math.max(0.4, this.selectionFade(t)), rot: 0 };
  }

  private drawWheel(t: number) {
    const { ctx } = this;
    const W = this.wheelLayout();
    const angle = this.wheelAngle(this.selectionTime(t));
    const slices = this.slices();
    ctx.save();
    ctx.translate(W.cx, W.cy);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#0b1433";
    ctx.beginPath();
    ctx.arc(0, 0, W.r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    slices.forEach((s, i) => {
      ctx.fillStyle = hueColor(this.birds[i].hue, 56, 0.95);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, W.r, angle + s.start, angle + s.end);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#0b1433";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.fillStyle = "#0b1433";
    ctx.beginPath();
    ctx.arc(0, 0, W.r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // The champion's slice label
    const champ = slices[0];
    const a = angle + champ.mid;
    ctx.font = `${Math.round(Math.max(9, Math.min(12, W.r * 0.09)))}px ${this.opts.pixelFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0b1433";
    ctx.fillText(`${Math.round(((champ.end - champ.start) / (Math.PI * 2)) * 100)}%`, W.cx + Math.cos(a) * W.r * 0.62, W.cy + Math.sin(a) * W.r * 0.62);

    // Pointer
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W.cx, W.cy - W.r + 14);
    ctx.lineTo(W.cx - 11, W.cy - W.r - 12);
    ctx.lineTo(W.cx + 11, W.cy - W.r - 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private trayPositions() {
    const W = this.wheelLayout();
    const c = this.content();
    const slot = W.tray.vertical ? Math.min((c.h * 0.8) / 4, c.w * 0.24) : c.w / 4;
    return Array.from({ length: 4 }, (_, k) =>
      W.tray.vertical
        ? { x: W.tray.x, y: W.tray.y + k * slot, w: c.x + c.w - W.tray.x, h: slot }
        : { x: W.tray.x + k * slot, y: W.tray.y, w: slot, h: c.y + c.h - W.tray.y },
    );
  }

  private drawTray(t: number, now: number) {
    const { ctx } = this;
    const st = this.selectionTime(t);
    const slots = this.trayPositions();
    ctx.globalAlpha *= this.selectionFade(t);
    const picks = [0, ...WHEEL_PICKS];
    const font = `${Math.round(Math.max(7, Math.min(10, this.w * 0.018)))}px ${this.opts.pixelFont}`;
    slots.forEach((slot, k) => {
      const appearAt = k === 0 ? 0.3 : ELITE_TIME + (k - 1) * (SPIN_TIME + SPIN_PAUSE) + SPIN_TIME;
      const p = easeOutBack(clamp01((st - appearAt) / 0.45));
      ctx.save();
      ctx.strokeStyle = k === 0 ? COLORS.accent : "rgba(141,155,199,0.45)";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(slot.x + 4, slot.y + 4, slot.w - 8, slot.h - 8, 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = k === 0 ? COLORS.accent : COLORS.muted;
      ctx.fillText(k === 0 ? "ELITE" : `PARENT ${k}`, slot.x + slot.w / 2, slot.y + slot.h - 10);
      if (p > 0) {
        const bird = this.birds[picks[k]];
        const size = Math.min(this.birdSize() * 0.95, slot.w * 0.5, slot.h * 0.5);
        const cx = slot.x + slot.w / 2;
        const cy = slot.y + slot.h * 0.44;
        this.drawBird({ x: cx, y: cy, size: size * p, alpha: clamp01(p), rot: 0 }, Math.floor(now / 90) + k, bird.hue);
        if (k === 0) this.crown(cx, cy - size * 0.4, size * 0.28, p);
      }
      ctx.restore();
    });
  }

  // -------------------------------------------------------------------------
  // Scenes 7 & 8: copying, mutating and mixing DNA
  // -------------------------------------------------------------------------

  /** Row k of a DNA comparison with `rows` rows (2 rows for mutation, 3 for crossover). */
  private dnaRow(k: number, rows: number) {
    const c = this.content();
    const S = this.birdSize();
    const stripX = c.x + S * 1.5;
    const stripW = c.w - S * 1.5;
    const stripH = Math.max(26, Math.min(54, c.h * (rows === 2 ? 0.14 : 0.11)));
    const spacing = rows === 2 ? c.h * 0.36 : c.h * 0.27;
    const top = c.y + (rows === 2 ? c.h * 0.16 : c.h * 0.1);
    const y = top + k * spacing;
    return { stripX, stripW, stripH, y, birdX: c.x + S * 0.6, birdY: y + 18 + stripH / 2, S };
  }

  /** Pose for a bird sitting at the left of DNA row k (rows = 0 for mutation layout, 1 for crossover). */
  private rowPose(k: number, layout: 0 | 1): Pose {
    const row = this.dnaRow(k, layout === 0 ? 2 : 3);
    return { x: row.birdX, y: row.birdY, size: row.S, alpha: 1, rot: 0 };
  }

  private rowLabel(text: string, x: number, y: number, color: string) {
    const { ctx } = this;
    ctx.font = `${Math.round(Math.max(8, Math.min(11, this.w * 0.02)))}px ${this.opts.pixelFont}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private geneSlots(stripX: number, stripW: number) {
    const gap = Math.min(1.5, stripW / GENE_COUNT / 5);
    const bar = (stripW - gap * (GENE_COUNT - 1)) / GENE_COUNT;
    return { gap, bar, x: (i: number) => stripX + i * (bar + gap) };
  }

  private drawMutation(t: number, now: number) {
    const { ctx } = this;
    const loop = this.opts.reducedMotion ? t : t % 7.5;
    const parent = this.birds[0];
    const top = this.dnaRow(0, 2);
    const bottom = this.dnaRow(1, 2);
    const slots = this.geneSlots(top.stripX, top.stripW);
    const stripTop = (row: typeof top) => row.y + 18;

    this.rowLabel("PARENT · CHAMPION", top.stripX, stripTop(top) - 6, COLORS.accent);
    drawGenes(ctx, top.stripX, stripTop(top), top.stripW, top.stripH, parent.genes, { gap: slots.gap });

    // 1) genes stream down into the child
    const copyDur = 1.6;
    const scanStart = 2.1;
    const scanDur = 1.6;
    const scanX = bottom.stripX + bottom.stripW * clamp01((loop - scanStart) / scanDur);
    this.rowLabel("CHILD", bottom.stripX, stripTop(bottom) - 6, COLORS.text);
    const highlight = new Float64Array(GENE_COUNT);
    const shown = new Float64Array(GENE_COUNT);
    for (let i = 0; i < GENE_COUNT; i++) {
      const p = clamp01((loop - (i / GENE_COUNT) * copyDur) / 0.45);
      const gx = slots.x(i);
      const mutIndex = this.child.mutated.indexOf(i);
      const mutated = mutIndex >= 0 && scanX > gx + slots.bar;
      shown[i] = mutated ? this.child.genes[i] : parent.genes[i];
      if (mutIndex >= 0 && mutated) {
        const since = loop - (scanStart + ((gx - bottom.stripX) / bottom.stripW) * scanDur);
        highlight[i] = clamp01(1 - since / 0.5);
      }
      if (p <= 0) continue;
      if (p < 1) {
        const e = easeInOut(p);
        const y = lerp(stripTop(top), stripTop(bottom), e) - Math.sin(e * Math.PI) * 18;
        ctx.fillStyle = geneColor(parent.genes[i]);
        ctx.fillRect(gx, y, slots.bar, bottom.stripH);
      }
    }
    const landed = (i: number) => loop >= (i / GENE_COUNT) * copyDur + 0.45;
    let count = 0;
    while (count < GENE_COUNT && landed(count)) count++;
    drawGenes(ctx, bottom.stripX, stripTop(bottom), bottom.stripW, bottom.stripH, shown, { gap: slots.gap, highlight, count });

    // 2) a scanner sweeps the child; each gene has a 10% chance to be nudged
    if (loop > scanStart && loop < scanStart + scanDur + 0.2) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(scanX - 1, stripTop(bottom) - 8, 2, bottom.stripH + 16);
    }
    const font = `600 ${Math.round(Math.max(10, Math.min(12, this.w * 0.022)))}px ${this.opts.monoFont}`;
    let mutations = 0;
    this.child.mutated.forEach((g, k) => {
      const gx = slots.x(g);
      if (scanX <= gx + slots.bar) return;
      mutations++;
      const since = loop - (scanStart + ((gx - bottom.stripX) / bottom.stripW) * scanDur);
      const rise = easeOut(clamp01(since / 0.5));
      const d = this.child.deltas[k];
      // Persistent marker so mutated genes stay identifiable after the flash.
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(gx + slots.bar / 2, stripTop(bottom) - 3);
      ctx.lineTo(gx + slots.bar / 2 - 4, stripTop(bottom) - 10);
      ctx.lineTo(gx + slots.bar / 2 + 4, stripTop(bottom) - 10);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.globalAlpha *= clamp01(since * 3);
      ctx.fillStyle = d >= 0 ? COLORS.positive : COLORS.negative;
      const lift = k % 2 === 0 ? 0 : 16;
      ctx.fillText(`${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`, gx + slots.bar / 2, stripTop(bottom) + bottom.stripH + 22 + lift - rise * 4);
      ctx.restore();
    });

    // Child bird: same colour as the parent until it mutates.
    const childHue = mutations === 0 ? this.child.hueBefore : lerp(this.child.hueBefore, this.child.hueAfter, mutations / this.child.mutated.length);
    const appear = easeOutBack(clamp01((loop - copyDur * 0.6) / 0.5));
    this.drawBird({ x: bottom.birdX, y: bottom.birdY, size: bottom.S * appear, alpha: clamp01(appear), rot: 0 }, Math.floor(now / 90), childHue);

    // Footer stats
    const c = this.content();
    ctx.font = `500 ${Math.round(Math.max(11, Math.min(14, this.w * 0.026)))}px ${this.opts.monoFont}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`mutated ${mutations}/66 genes · rate 10% · ±0.5 max`, c.x, c.y + c.h - 4);
  }

  private drawCrossover(t: number, now: number) {
    const { ctx } = this;
    const loop = this.opts.reducedMotion ? t : t % 6.5;
    const A = this.birds[0];
    const B = this.birds[WHEEL_PICKS[1]];
    const rows = [this.dnaRow(0, 3), this.dnaRow(1, 3), this.dnaRow(2, 3)];
    const slots = this.geneSlots(rows[0].stripX, rows[0].stripW);
    const top = (k: number) => rows[k].y + 18;

    this.rowLabel("PARENT A", rows[0].stripX, top(0) - 6, hueColor(A.hue, 68));
    this.rowLabel("PARENT B", rows[1].stripX, top(1) - 6, hueColor(B.hue, 68));
    this.rowLabel("CHILD", rows[2].stripX, top(2) - 6, COLORS.text);
    drawGenes(ctx, rows[0].stripX, top(0), rows[0].stripW, rows[0].stripH, A.genes, { gap: slots.gap });
    drawGenes(ctx, rows[1].stripX, top(1), rows[1].stripW, rows[1].stripH, B.genes, { gap: slots.gap });

    const dur = 2.2;
    let landedCount = 0;
    for (let i = 0; i < GENE_COUNT; i++) {
      const fromB = this.cross.fromB[i];
      const p = clamp01((loop - 0.3 - (i / GENE_COUNT) * dur) / 0.5);
      if (p <= 0) continue;
      const gx = slots.x(i);
      const y0 = top(fromB ? 1 : 0);
      const e = easeInOut(p);
      ctx.fillStyle = geneColor(this.cross.genes[i]);
      ctx.fillRect(gx, lerp(y0, top(2), e), slots.bar, rows[2].stripH);
      // A coloured tick shows which parent each gene came from.
      if (p >= 1) {
        landedCount++;
        ctx.fillStyle = hueColor(fromB ? B.hue : A.hue, 62);
        ctx.fillRect(gx, top(2) + rows[2].stripH + 4, slots.bar, 5);
      }
    }

    const appear = easeOutBack(clamp01((loop - 1.2) / 0.5));
    const childHue = lerp(A.hue, this.cross.hue, clamp01(landedCount / GENE_COUNT));
    this.drawBird({ x: rows[2].birdX, y: rows[2].birdY, size: rows[2].S * appear, alpha: clamp01(appear), rot: 0 }, Math.floor(now / 90), childHue);

    const c = this.content();
    const fromBCount = this.cross.fromB.filter(Boolean).length;
    ctx.font = `500 ${Math.round(Math.max(11, Math.min(14, this.w * 0.026)))}px ${this.opts.monoFont}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`coin flip per gene · ${GENE_COUNT - fromBCount} from A, ${fromBCount} from B`, c.x, c.y + c.h - 4);
  }

  // -------------------------------------------------------------------------
  // Scene 9: repeat (fast-forward through a real run)
  // -------------------------------------------------------------------------

  private drawRepeat(t: number, now: number) {
    const { ctx } = this;
    const c = this.content();
    const perGen = 0.34;
    const solvedAt = RECORDED_RUN.length;
    const cycle = solvedAt * perGen + 3.4;
    const loop = this.opts.reducedMotion ? cycle - 1 : t % cycle;
    const gen = Math.min(solvedAt + 1, Math.floor(loop / perGen) + 1);
    const solved = gen > solvedAt;
    const best = solved ? "150+" : String(Math.max(0, ...RECORDED_RUN.slice(0, gen - 1)));

    // Counters: generation on the left, best score so far on the right.
    const big = Math.round(Math.max(20, Math.min(38, this.w * 0.065)));
    const small = `500 ${Math.round(Math.max(11, Math.min(14, this.w * 0.026)))}px ${this.opts.monoFont}`;
    ctx.textBaseline = "top";
    ctx.font = `${big}px ${this.opts.pixelFont}`;
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(`GEN ${gen}`, c.x, c.y);
    ctx.textAlign = "right";
    ctx.fillStyle = solved ? COLORS.accent : COLORS.text;
    ctx.fillText(best, c.x + c.w, c.y);
    ctx.font = small;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("best (pipes)", c.x + c.w, c.y + big + 10);
    ctx.textAlign = "left";
    ctx.fillText("real run · 500 birds", c.x, c.y + big + 10);

    // The flock converges on one family's colours as evolution proceeds.
    const flockY = c.y + big + 48;
    const flockN = this.wide ? 14 : 10;
    const S = Math.min(this.birdSize() * 0.85, c.w / flockN - 4);
    const convergence = Math.pow(clamp01((gen - 1) / solvedAt), 1.6);
    const finalHue = this.child.hueAfter;
    for (let j = 0; j < flockN; j++) {
      const startHue = this.birds[j % 12].hue + (j >= 12 ? 25 : 0);
      const diff = (((finalHue - startHue + 540) % 360) - 180) * convergence;
      const x = c.x + (c.w / flockN) * (j + 0.5);
      const y = flockY + S * 0.4 + Math.sin(now / 300 + j) * 3;
      this.drawBird({ x, y, size: S, alpha: 1, rot: 0 }, Math.floor(now / 90) + j, startHue + diff + (j % 3) * 4 * (1 - convergence));
    }

    // Chart of best score per generation, with gridlines for scale.
    const axisW = 30;
    const chartTop = flockY + S + 30;
    const chart = { x: c.x + axisW, y: chartTop, w: c.w - axisW, h: c.y + c.h - chartTop - 24 };
    const max = 60;
    const slots = solvedAt + 1;
    const bw = chart.w / slots;
    const yOf = (v: number) => chart.y + chart.h - (Math.min(v, max) / max) * chart.h;
    ctx.font = `500 ${Math.round(Math.max(10, Math.min(12, this.w * 0.022)))}px ${this.opts.monoFont}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (const v of [0, 10, 25, 50]) {
      ctx.strokeStyle = v === 0 ? "rgba(141,155,199,0.45)" : "rgba(141,155,199,0.16)";
      ctx.setLineDash(v === 0 ? [] : [4, 5]);
      ctx.beginPath();
      ctx.moveTo(chart.x, yOf(v));
      ctx.lineTo(chart.x + chart.w, yOf(v));
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(v), chart.x - 8, yOf(v));
    }
    ctx.setLineDash([]);

    for (let g = 1; g <= Math.min(gen, slots); g++) {
      const isLast = g === slots;
      const score = isLast ? max : RECORDED_RUN[g - 1];
      const grow = easeOut(clamp01((loop - (g - 1) * perGen) / 0.3));
      const bh = Math.max(2, (Math.min(score, max) / max) * chart.h * grow);
      ctx.fillStyle = isLast ? COLORS.accent : g === gen && !solved ? "#ffffff" : COLORS.positive;
      ctx.beginPath();
      ctx.roundRect(chart.x + (g - 1) * bw + bw * 0.15, chart.y + chart.h - bh, bw * 0.7, bh, 2);
      ctx.fill();
      if ((score >= 20 || isLast) && grow > 0.5) {
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = isLast ? COLORS.accent : COLORS.text;
        ctx.fillText(isLast ? "150+ ▲" : String(score), chart.x + (g - 0.5) * bw, chart.y + chart.h - bh - 4);
      }
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("pipes passed, per generation →", chart.x, chart.y + chart.h + 6);

    if (solved) {
      const p = easeOutBack(clamp01((loop - solvedAt * perGen) / 0.5));
      ctx.save();
      ctx.translate(chart.x + chart.w * 0.42, chart.y + chart.h * 0.3);
      ctx.scale(p, p);
      ctx.font = `${Math.round(Math.max(10, Math.min(14, this.w * 0.026)))}px ${this.opts.pixelFont}`;
      const label = "MASTERED!";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = COLORS.accent;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-tw / 2 - 14, -19, tw + 28, 38, 19);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1a1400";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 1);
      ctx.restore();
    }
  }
}
