/*
 * Browser game engine: owns the canvas, the fixed-timestep loop, input, sound
 * and all rendering. Game rules live in ./sim; React only talks to this class.
 */

import {
  BIRD_HEIGHT,
  BIRD_START_Y,
  BIRD_WIDTH,
  BIRD_X,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEFAULT_POPULATION,
  DEFAULT_SETTINGS,
  Flight,
  GRAVITY,
  GROUND_Y,
  HIDDEN_COUNT,
  INPUT_COUNT,
  INPUT_LABELS,
  OUTPUT_COUNT,
  PIPE_GAP,
  PIPE_HEIGHT,
  PIPE_SPEED,
  PIPE_WIDTH,
  Population,
  TICK_MS,
  activate,
  sense,
  type Agent,
  type EvolutionSettings,
  type GenerationSummary,
} from "./sim";
import { SoundBank } from "./sound";
import { TintCache, type Sprites } from "./sprites";
import { COLORS, drawGenes, drawNetwork, hueColor, networkGeometry } from "./viz";

export type Mode = "human" | "ai";
/** Human-mode flow: menu -> ready -> playing -> over -> ready ... */
export type Phase = "menu" | "ready" | "playing" | "over";

export const SPEED_STEPS = [1, 2, 3, 5, 10, 20, 50, 100] as const;
export const POPULATION_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

export interface AiSnapshot {
  generation: number;
  alive: number;
  population: number;
  score: number;
  best: number;
  history: GenerationSummary[];
  /** Real simulation speed achieved, which drops below the target when the CPU can't keep up. */
  effectiveSpeed: number;
  speed: number;
  settings: EvolutionSettings;
  dnaColors: boolean;
  paused: boolean;
  /** Whether the bird shown in the live brain panel is last generation's champion. */
  leaderElite: boolean;
}

export interface Snapshot {
  mode: Mode;
  phase: Phase;
  score: number;
  best: number;
  newBest: boolean;
  muted: boolean;
  ai: AiSnapshot;
}

interface Corpse {
  x: number;
  y: number;
  vy: number;
  hue: number;
  age: number;
}

const BEST_KEY = "flappy-ai:best";
const MUTE_KEY = "flappy-ai:muted";
/** Ground stripes repeat every ~39px, so 9 stripes tile seamlessly. */
const GROUND_TILE = 351;
const GROUND_SRC_Y = GROUND_Y - 1;
const FRAME_MS = 85;
const MAX_CORPSES = 180;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Private mode or blocked storage: the game still works, it just forgets. */
  }
}

export interface EngineOptions {
  sprites: Sprites;
  /** CSS font-family for the pixel display font. */
  pixelFont: string;
  /** CSS font-family for small labels. */
  monoFont: string;
  onChange: (snapshot: Snapshot) => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sprites: Sprites;
  private tints: TintCache;
  private sounds = new SoundBank();
  private pixelFont: string;
  private monoFont: string;
  private onChange: (snapshot: Snapshot) => void;

  private cssWidth = BOARD_WIDTH;
  private dpr = 1;

  private mode: Mode = "human";
  private phase: Phase = "menu";
  private flight = new Flight();
  private best = 0;
  private newBest = false;
  private overAt = 0;

  private population: Population | null = null;
  private populationSize: number = DEFAULT_POPULATION;
  private settings: EvolutionSettings = { ...DEFAULT_SETTINGS };
  private speed = 1;
  private paused = false;
  private dnaColors = true;
  private corpses: Corpse[] = [];
  private ticksThisSecond = 0;
  private secondStart = 0;
  private effectiveSpeed = 1;

  private raf = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private groundOffset = 0;
  private flashUntil = 0;
  private shakeUntil = 0;
  private banner: { text: string; until: number } | null = null;
  private lastEmit = 0;

  private brainCanvas: HTMLCanvasElement | null = null;
  private brainInputs = new Float64Array(INPUT_COUNT);
  private brainHidden = new Float64Array(HIDDEN_COUNT);
  private brainOutput = new Float64Array(OUTPUT_COUNT);

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.sprites = options.sprites;
    this.tints = new TintCache(options.sprites.birdFrames);
    this.pixelFont = options.pixelFont;
    this.monoFont = options.monoFont;
    this.onChange = options.onChange;
    this.best = Number(readStorage(BEST_KEY)) || 0;
    this.sounds.muted = readStorage(MUTE_KEY) === "1";
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start() {
    this.last = performance.now();
    this.secondStart = this.last;
    this.raf = requestAnimationFrame(this.frame);
    this.emit(true);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.sounds.dispose();
  }

  resize(cssWidth: number, dpr: number) {
    this.cssWidth = cssWidth;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(((cssWidth * BOARD_HEIGHT) / BOARD_WIDTH) * dpr);
  }

  setVisible(visible: boolean) {
    this.visible = visible;
  }

  setBrainCanvas(canvas: HTMLCanvasElement | null) {
    this.brainCanvas = canvas;
  }

  // -------------------------------------------------------------------------
  // Input & controls
  // -------------------------------------------------------------------------

  /** The one-button input: flap, start, or continue depending on the phase. */
  press() {
    this.sounds.unlock();
    if (this.mode !== "human") return;
    switch (this.phase) {
      case "menu":
      case "ready":
        this.flight.reset();
        this.phase = "playing";
        this.newBest = false;
        this.flap();
        this.emit(true);
        break;
      case "playing":
        this.flap();
        break;
      case "over":
        if (performance.now() - this.overAt > 450) this.toReady();
        break;
    }
  }

  /** Menu "Play" button: show the get-ready screen without flapping yet. */
  play() {
    this.sounds.unlock();
    if (this.mode !== "human") this.setMode("human");
    this.toReady();
  }

  setMode(mode: Mode) {
    this.sounds.unlock();
    if (mode === this.mode) return;
    this.mode = mode;
    this.acc = 0;
    if (mode === "ai") {
      this.population ??= new Population(this.populationSize, this.settings);
      this.paused = false;
      this.showBanner(`GENERATION ${this.population.generation}`);
    } else {
      this.phase = "ready";
      this.flight.reset();
    }
    this.sounds.play("swoosh", 0.4);
    this.emit(true);
  }

  setSpeed(speed: number) {
    this.speed = Math.max(1, speed);
    this.emit(true);
  }

  setPopulationSize(size: number) {
    this.populationSize = size;
    this.resetEvolution();
  }

  setSettings(settings: Partial<EvolutionSettings>) {
    this.settings = { ...this.settings, ...settings };
    if (this.population) this.population.settings = { ...this.settings };
    this.emit(true);
  }

  setDnaColors(enabled: boolean) {
    this.dnaColors = enabled;
    this.emit(true);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.emit(true);
  }

  setMuted(muted: boolean) {
    this.sounds.muted = muted;
    writeStorage(MUTE_KEY, muted ? "1" : "0");
    this.emit(true);
  }

  resetEvolution() {
    this.population = new Population(this.populationSize, this.settings);
    this.corpses = [];
    this.paused = false;
    if (this.mode === "ai") this.showBanner("GENERATION 1");
    this.emit(true);
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // Clamp long gaps (background tabs, breakpoints) so we never fast-forward.
    const dt = Math.min(now - this.last, 100);
    this.last = now;
    this.acc += dt;

    if (this.mode === "human") {
      const frozen = !this.visible && this.phase === "playing";
      if (frozen) this.acc = 0;
      while (this.acc >= TICK_MS) {
        this.tickHuman();
        this.acc -= TICK_MS;
      }
    } else if (this.paused) {
      this.acc = 0;
    } else {
      this.runAiTicks(now);
    }

    if (now - this.secondStart >= 1000) {
      const target = this.mode === "ai" && !this.paused ? this.speed : 1;
      const achieved = this.ticksThisSecond / (((now - this.secondStart) / 1000) * 60);
      this.effectiveSpeed = this.mode === "ai" && !this.paused ? Math.min(target, Math.max(0.1, achieved)) : 1;
      this.ticksThisSecond = 0;
      this.secondStart = now;
    }

    if (this.visible) {
      this.render(now, Math.min(1, this.acc / TICK_MS));
      this.renderBrain();
    }
    if (now - this.lastEmit > 120) this.emit(false);
  };

  private runAiTicks(now: number) {
    // Each 60 Hz slot runs `speed` simulation ticks, within a per-frame time
    // budget so 10,000 birds at 100x can't freeze the page.
    const budget = this.visible ? 12 : 5;
    const start = performance.now();
    while (this.acc >= TICK_MS) {
      for (let i = 0; i < this.speed; i++) {
        this.tickAi(now);
        if ((i & 7) === 7 && performance.now() - start > budget) {
          this.acc = 0;
          return;
        }
      }
      this.acc -= TICK_MS;
      if (performance.now() - start > budget) {
        this.acc = 0;
        return;
      }
    }
  }

  private tickHuman() {
    if (this.phase !== "over") this.groundOffset += PIPE_SPEED;
    if (this.phase !== "playing" && this.phase !== "over") return;
    const events = this.flight.step();
    if (events.scored) this.sounds.play("point", 0.5);
    if (events.died) this.crash(events.died);
  }

  private tickAi(now: number) {
    const pop = this.population!;
    this.groundOffset += PIPE_SPEED;
    this.ticksThisSecond++;
    const keepCorpses = this.speed <= 5;
    const bred = pop.step(keepCorpses ? this.addCorpse : undefined);
    if (bred) {
      this.corpses.length = 0;
      if (this.speed <= 10) this.showBanner(`GENERATION ${pop.generation}`, now);
      this.emit(true);
      return;
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.vy += GRAVITY;
      c.y = Math.min(c.y + c.vy, GROUND_Y - BIRD_HEIGHT + 4);
      c.x -= PIPE_SPEED;
      if (++c.age > 70 || c.x < -BIRD_WIDTH) this.corpses.splice(i, 1);
    }
  }

  private addCorpse = (agent: Agent) => {
    if (this.corpses.length < MAX_CORPSES) {
      this.corpses.push({ x: BIRD_X, y: agent.y, vy: Math.min(agent.vy, 0), hue: agent.hue, age: 0 });
    }
  };

  private flap() {
    this.flight.flap();
    this.sounds.play("wing", 0.45);
  }

  private crash(cause: "pipe" | "ground") {
    const now = performance.now();
    this.phase = "over";
    this.overAt = now;
    this.flashUntil = now + 140;
    this.shakeUntil = now + 260;
    this.sounds.play("hit", 0.6);
    if (cause === "pipe") window.setTimeout(() => this.sounds.play("die", 0.5), 280);
    if (this.flight.score > this.best) {
      this.best = this.flight.score;
      this.newBest = true;
      writeStorage(BEST_KEY, String(this.best));
    }
    this.emit(true);
  }

  private toReady() {
    this.phase = "ready";
    this.flight.reset();
    this.emit(true);
  }

  private showBanner(text: string, now = performance.now()) {
    this.banner = { text, until: now + 1100 };
  }

  private emit(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 120) return;
    this.lastEmit = now;
    const pop = this.population;
    this.onChange({
      mode: this.mode,
      phase: this.phase,
      score: this.flight.score,
      best: this.best,
      newBest: this.newBest,
      muted: this.sounds.muted,
      ai: {
        generation: pop?.generation ?? 1,
        alive: pop?.aliveCount ?? this.populationSize,
        population: pop?.size ?? this.populationSize,
        score: pop?.runScore ?? 0,
        best: pop?.bestScore ?? 0,
        history: pop?.history ?? [],
        effectiveSpeed: this.effectiveSpeed,
        speed: this.speed,
        settings: this.settings,
        dnaColors: this.dnaColors,
        paused: this.paused,
        leaderElite: pop?.leader?.elite ?? false,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Rendering (in 360x640 board units)
  // -------------------------------------------------------------------------

  private render(now: number, alpha: number) {
    const { ctx, sprites } = this;
    const scale = (this.cssWidth / BOARD_WIDTH) * this.dpr;
    let shakeX = 0;
    let shakeY = 0;
    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 260;
      shakeX = (Math.random() * 2 - 1) * 5 * k;
      shakeY = (Math.random() * 2 - 1) * 5 * k;
    }
    ctx.setTransform(scale, 0, 0, scale, shakeX * scale, shakeY * scale);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprites.background, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const human = this.mode === "human";
    const showPipes = !human || this.phase === "playing" || this.phase === "over";
    if (showPipes) {
      const pipes = human ? this.flight.field.pipes : this.population!.field.pipes;
      const a = human && this.phase === "over" ? 1 : alpha;
      for (const pipe of pipes) {
        const x = pipe.prevX + (pipe.x - pipe.prevX) * a;
        ctx.drawImage(sprites.topPipe, x, pipe.gapTop - PIPE_HEIGHT, PIPE_WIDTH, PIPE_HEIGHT);
        ctx.drawImage(sprites.bottomPipe, x, pipe.gapTop + PIPE_GAP, PIPE_WIDTH, PIPE_HEIGHT);
      }
    }

    // Redraw the ground over the pipes and scroll it with the world.
    const moving = !(human && this.phase === "over") && !(this.mode === "ai" && this.paused);
    const offset = (this.groundOffset + (moving ? PIPE_SPEED * alpha : 0)) % GROUND_TILE;
    ctx.imageSmoothingEnabled = false;
    for (let x = -offset; x < BOARD_WIDTH; x += GROUND_TILE) {
      ctx.drawImage(sprites.background, 0, GROUND_SRC_Y, GROUND_TILE, BOARD_HEIGHT - GROUND_SRC_Y, x, GROUND_SRC_Y, GROUND_TILE, BOARD_HEIGHT - GROUND_SRC_Y);
    }
    ctx.imageSmoothingEnabled = true;

    const frame = Math.floor(now / FRAME_MS) % 4;
    if (human) this.renderHuman(now, alpha, frame);
    else this.renderAi(now, alpha, frame);

    if (now < this.flashUntil) {
      ctx.fillStyle = `rgba(255,255,255,${((this.flashUntil - now) / 140) * 0.75})`;
      ctx.fillRect(-10, -10, BOARD_WIDTH + 20, BOARD_HEIGHT + 20);
    }
  }

  private drawBird(x: number, y: number, vy: number, frame: number, hue: number | null, opacity = 1) {
    const { ctx } = this;
    const angle = Math.max(-0.42, Math.min(1.25, vy * 0.085));
    const img = hue === null ? this.sprites.birdFrames[frame] : this.tints.get(frame, hue);
    ctx.globalAlpha = opacity;
    ctx.save();
    ctx.translate(x + BIRD_WIDTH / 2, y + BIRD_HEIGHT / 2);
    ctx.rotate(angle);
    ctx.drawImage(img, -BIRD_WIDTH / 2, -BIRD_HEIGHT / 2, BIRD_WIDTH, BIRD_HEIGHT);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private renderHuman(now: number, alpha: number, frame: number) {
    const { ctx, flight } = this;
    if (this.phase === "menu" || this.phase === "ready") {
      const bob = Math.sin(now / 260) * 7;
      const x = this.phase === "menu" ? BOARD_WIDTH / 2 - BIRD_WIDTH / 2 : BIRD_X;
      this.drawBird(x, BIRD_START_Y + bob, 0, frame, null);
      if (this.phase === "ready") {
        this.text("GET READY", BOARD_WIDTH / 2, 170, 22, COLORS.accent);
        const pulse = 0.55 + 0.45 * Math.sin(now / 220);
        ctx.globalAlpha = pulse;
        this.text("TAP OR PRESS SPACE", BOARD_WIDTH / 2, 420, 10, "#ffffff");
        ctx.globalAlpha = 1;
        this.drawTapHint(BOARD_WIDTH / 2, 460, now);
      }
      return;
    }
    const y = flight.prevY + (flight.y - flight.prevY) * alpha;
    const birdFrame = flight.alive ? frame : 1;
    this.drawBird(BIRD_X, y, flight.alive ? flight.vy : 10, birdFrame, null);
    if (this.phase === "playing") this.text(String(flight.score), BOARD_WIDTH / 2, 82, 34, "#ffffff");
  }

  private drawTapHint(x: number, y: number, now: number) {
    const { ctx } = this;
    const press = (Math.sin(now / 220) + 1) / 2;
    ctx.save();
    ctx.translate(x, y + press * 4);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    // A tiny pixel "finger".
    ctx.beginPath();
    ctx.roundRect(-6, -14, 12, 26, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = `rgba(255,255,255,${1 - press})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 14, 10 + press * 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  private renderAi(now: number, alpha: number, frame: number) {
    const { ctx } = this;
    const pop = this.population!;
    const useHue = this.dnaColors;

    for (const c of this.corpses) {
      const fade = 1 - c.age / 70;
      this.drawBird(c.x, c.y, 12, 1, useHue ? c.hue : null, 0.5 * fade);
    }

    const crowd = pop.size > 50 ? 0.5 : 0.8;
    const leader = pop.leader;
    const a = this.paused ? 1 : alpha;
    for (const agent of pop.agents) {
      if (!agent.alive || agent === leader) continue;
      const y = agent.prevY + (agent.y - agent.prevY) * a;
      this.drawBird(BIRD_X, y, agent.vy, frame, useHue ? agent.hue : null, crowd);
    }
    if (leader?.alive) {
      const y = leader.prevY + (leader.y - leader.prevY) * a;
      const cx = BIRD_X + BIRD_WIDTH / 2;
      const cy = y + BIRD_HEIGHT / 2;
      ctx.strokeStyle = useHue ? hueColor(leader.hue, 70, 0.9) : "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 24 + Math.sin(now / 200) * 2, 0, Math.PI * 2);
      ctx.stroke();
      this.drawBird(BIRD_X, y, leader.vy, frame, useHue ? leader.hue : null, 1);
      if (leader.elite) this.drawCrown(cx, y - 10);
    }

    // HUD
    this.text(String(pop.runScore), BOARD_WIDTH / 2, 92, 34, "#ffffff");
    this.text(`GEN ${pop.generation}`, 12, 26, 11, COLORS.accent, "left");
    this.text(`ALIVE ${pop.aliveCount}/${pop.size}`, 12, 46, 9, "#ffffff", "left");
    this.text(`BEST ${pop.bestScore}`, BOARD_WIDTH - 12, 26, 11, "#ffffff", "right");
    if (this.speed > 1) this.text(`${this.speed}x`, BOARD_WIDTH - 12, 46, 9, COLORS.accent, "right");

    if (this.banner && now < this.banner.until) {
      const t = 1 - (this.banner.until - now) / 1100;
      const fade = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
      ctx.globalAlpha = fade;
      ctx.fillStyle = "rgba(11,20,51,0.55)";
      ctx.fillRect(0, 286, BOARD_WIDTH, 56);
      this.text(this.banner.text, BOARD_WIDTH / 2, 322, 16, COLORS.accent);
      ctx.globalAlpha = 1;
    }
    if (this.paused) {
      ctx.fillStyle = "rgba(11,20,51,0.45)";
      ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      this.text("PAUSED", BOARD_WIDTH / 2, 330, 22, "#ffffff");
    }
  }

  private drawCrown(cx: number, y: number) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.accent;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 9, y);
    ctx.lineTo(cx - 9, y - 9);
    ctx.lineTo(cx - 4.5, y - 4);
    ctx.lineTo(cx, y - 11);
    ctx.lineTo(cx + 4.5, y - 4);
    ctx.lineTo(cx + 9, y - 9);
    ctx.lineTo(cx + 9, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private text(value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center") {
    const { ctx } = this;
    ctx.font = `${size}px ${this.pixelFont}`;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size * 0.28);
    ctx.strokeStyle = "#000000";
    ctx.strokeText(value, x, y);
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  /** Live view of the followed bird's brain: network on top, DNA strip below. */
  private renderBrain() {
    const canvas = this.brainCanvas;
    const pop = this.population;
    if (!canvas || this.mode !== "ai" || !pop) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = this.dpr;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const leader = pop.leader;
    const pipe = pop.field.next();
    if (!leader || !pipe) return;
    sense(leader.y, leader.vy, pipe, this.brainInputs);
    activate(leader.genes, this.brainInputs, this.brainHidden, this.brainOutput);

    const stripH = 14;
    const font = `500 11px ${this.monoFont}`;
    ctx.font = font;
    const labelW = Math.max(...INPUT_LABELS.map((label) => ctx.measureText(`${label} -0.00`).width)) + 8;
    const geo = networkGeometry(labelW, 6, w - labelW - 46, h - stripH - 34);
    drawNetwork(
      ctx,
      geo,
      leader.genes,
      { inputs: this.brainInputs, hidden: this.brainHidden, output: this.brainOutput },
      { labels: true, values: true, font },
    );
    drawGenes(ctx, 0, h - stripH, w, stripH, leader.genes);
  }
}
