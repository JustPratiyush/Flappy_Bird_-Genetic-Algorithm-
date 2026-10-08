/*
 * Flappy Bird simulation core: physics, pipes, the neural-network brain and the
 * genetic algorithm. Pure TypeScript with no DOM access, so it runs headless too.
 *
 * Everything advances in fixed 60 Hz ticks. Rendering code decides how many
 * ticks to run per frame, so the game plays at the same speed on 60 Hz, 120 Hz
 * and 144 Hz displays.
 */

// ---------------------------------------------------------------------------
// World constants (game units: the board is always 360 x 640)
// ---------------------------------------------------------------------------

export const BOARD_WIDTH = 360;
export const BOARD_HEIGHT = 640;
/** Top of the grass strip in flappybirdbg.png. */
export const GROUND_Y = 577;

export const BIRD_X = BOARD_WIDTH / 8;
export const BIRD_START_Y = BOARD_HEIGHT / 2;
export const BIRD_WIDTH = 34;
export const BIRD_HEIGHT = 24;
/** Shrinks the hitbox a little so near-misses feel fair. */
export const HITBOX_PADDING = 4;

export const PIPE_WIDTH = 64;
export const PIPE_HEIGHT = 512;
export const PIPE_GAP = BOARD_HEIGHT / 4;
export const PIPE_SPEED = 2;
/** Ticks between pipe spawns (1.5 s). */
export const PIPE_INTERVAL = 90;

export const GRAVITY = 0.4;
export const FLAP_VELOCITY = -6;

export const TICKS_PER_SECOND = 60;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

// ---------------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------------

export type Rng = () => number;

/** Small deterministic PRNG, used where we want repeatable randomness. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Pipes
// ---------------------------------------------------------------------------

export interface Pipe {
  id: number;
  x: number;
  /** x on the previous tick, used to interpolate rendering between ticks. */
  prevX: number;
  /** y of the bottom edge of the top pipe. The gap spans gapTop..gapTop+PIPE_GAP. */
  gapTop: number;
  passed: boolean;
}

export class PipeField {
  pipes: Pipe[] = [];
  private timer = 0;
  private nextId = 0;
  private rng: Rng;

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
  }

  /** Clears the field and immediately spawns the first pipe at the right edge. */
  reset() {
    this.pipes = [];
    this.timer = 0;
    this.spawn();
  }

  /** Moves the pipes one tick. Returns how many pipes the birds' column just passed. */
  step(): number {
    let passed = 0;
    for (const pipe of this.pipes) {
      pipe.prevX = pipe.x;
      pipe.x -= PIPE_SPEED;
      if (!pipe.passed && pipe.x + PIPE_WIDTH < BIRD_X) {
        pipe.passed = true;
        passed++;
      }
    }
    while (this.pipes.length > 0 && this.pipes[0].x < -PIPE_WIDTH) {
      this.pipes.shift();
    }
    if (++this.timer >= PIPE_INTERVAL) {
      this.timer = 0;
      this.spawn();
    }
    return passed;
  }

  /** The first pipe whose right edge is still ahead of the birds. */
  next(): Pipe | null {
    for (const pipe of this.pipes) {
      if (pipe.x + PIPE_WIDTH > BIRD_X) return pipe;
    }
    return null;
  }

  private spawn() {
    // Same range as the original game: the gap's top edge lands between 128 and 384.
    const gapTop = PIPE_HEIGHT * 0.75 - this.rng() * (PIPE_HEIGHT / 2);
    this.pipes.push({ id: this.nextId++, x: BOARD_WIDTH, prevX: BOARD_WIDTH, gapTop, passed: false });
  }
}

export function hitsPipe(y: number, pipe: Pipe): boolean {
  const left = BIRD_X + HITBOX_PADDING;
  const right = BIRD_X + BIRD_WIDTH - HITBOX_PADDING;
  if (right <= pipe.x || left >= pipe.x + PIPE_WIDTH) return false;
  const top = y + HITBOX_PADDING;
  const bottom = y + BIRD_HEIGHT - HITBOX_PADDING;
  return top < pipe.gapTop || bottom > pipe.gapTop + PIPE_GAP;
}

export function hitsGround(y: number): boolean {
  return y + BIRD_HEIGHT - HITBOX_PADDING >= GROUND_Y;
}

/** Shared bird physics: gravity, then clamp to the ceiling like the original game. */
export function fall(body: { y: number; prevY: number; vy: number }) {
  body.prevY = body.y;
  body.vy += GRAVITY;
  body.y = Math.max(body.y + body.vy, 0);
}

// ---------------------------------------------------------------------------
// Human run: one bird, one pipe field
// ---------------------------------------------------------------------------

export type DeathCause = "pipe" | "ground";

export interface FlightEvents {
  scored: boolean;
  died: DeathCause | null;
}

export class Flight {
  field: PipeField;
  y = BIRD_START_Y;
  prevY = BIRD_START_Y;
  vy = 0;
  score = 0;
  alive = true;

  constructor(rng: Rng = Math.random) {
    this.field = new PipeField(rng);
  }

  reset() {
    this.y = this.prevY = BIRD_START_Y;
    this.vy = 0;
    this.score = 0;
    this.alive = true;
    this.field.reset();
  }

  flap() {
    if (this.alive) this.vy = FLAP_VELOCITY;
  }

  step(): FlightEvents {
    const events: FlightEvents = { scored: false, died: null };
    if (!this.alive) {
      // Let the body drop to the ground after a crash, like the original game.
      if (!hitsGround(this.y)) fall(this);
      else this.prevY = this.y;
      return events;
    }
    const passed = this.field.step();
    fall(this);
    if (hitsGround(this.y)) {
      this.y = GROUND_Y - BIRD_HEIGHT + HITBOX_PADDING;
      events.died = "ground";
    } else {
      for (const pipe of this.field.pipes) {
        if (hitsPipe(this.y, pipe)) {
          events.died = "pipe";
          break;
        }
      }
    }
    if (events.died) {
      this.alive = false;
      this.vy = Math.max(this.vy, 0);
    } else if (passed > 0) {
      this.score += passed;
      events.scored = true;
    }
    return events;
  }
}

// ---------------------------------------------------------------------------
// Brain: a 5 -> 8 -> 2 feed-forward network whose weights are the bird's genes
// ---------------------------------------------------------------------------

export const INPUT_COUNT = 5;
export const HIDDEN_COUNT = 8;
export const OUTPUT_COUNT = 2;

export const INPUT_LABELS = ["Height", "Velocity", "Pipe dist", "Gap top", "Gap bottom"] as const;
export const OUTPUT_LABELS = ["Flap", "Wait"] as const;

/**
 * The genome is a flat list of numbers, laid out as:
 *   [ input->hidden weights (8x5) | hidden biases (8) | hidden->output weights (2x8) | output biases (2) ]
 */
export const GENE_LAYOUT = {
  inputHidden: 0,
  hiddenBias: HIDDEN_COUNT * INPUT_COUNT,
  hiddenOutput: HIDDEN_COUNT * INPUT_COUNT + HIDDEN_COUNT,
  outputBias: HIDDEN_COUNT * INPUT_COUNT + HIDDEN_COUNT + OUTPUT_COUNT * HIDDEN_COUNT,
} as const;

export const GENE_COUNT = GENE_LAYOUT.outputBias + OUTPUT_COUNT; // 66

export type Genes = Float64Array;

export function randomGenes(rng: Rng = Math.random): Genes {
  const genes = new Float64Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) genes[i] = rng() * 2 - 1;
  return genes;
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

/** Runs the network, writing every layer's activations into the given arrays. */
export function activate(genes: Genes, inputs: ArrayLike<number>, hidden: Float64Array, output: Float64Array) {
  const { hiddenBias, hiddenOutput, outputBias } = GENE_LAYOUT;
  for (let h = 0; h < HIDDEN_COUNT; h++) {
    let sum = genes[hiddenBias + h];
    const row = h * INPUT_COUNT;
    for (let i = 0; i < INPUT_COUNT; i++) sum += genes[row + i] * inputs[i];
    hidden[h] = sigmoid(sum);
  }
  for (let o = 0; o < OUTPUT_COUNT; o++) {
    let sum = genes[outputBias + o];
    const row = hiddenOutput + o * HIDDEN_COUNT;
    for (let h = 0; h < HIDDEN_COUNT; h++) sum += genes[row + h] * hidden[h];
    output[o] = sigmoid(sum);
  }
}

/** The 5 things a bird can see, normalised to roughly 0..1. */
export function sense(y: number, vy: number, pipe: Pipe, out: Float64Array) {
  out[0] = y / BOARD_HEIGHT;
  out[1] = vy / 10;
  out[2] = (pipe.x - BIRD_X) / BOARD_WIDTH;
  out[3] = pipe.gapTop / BOARD_HEIGHT;
  out[4] = (pipe.gapTop + PIPE_GAP) / BOARD_HEIGHT;
}

const scratchInputs = new Float64Array(INPUT_COUNT);
const scratchHidden = new Float64Array(HIDDEN_COUNT);
const scratchOutput = new Float64Array(OUTPUT_COUNT);

/** True when the "flap" output beats the "wait" output. */
export function wantsToFlap(genes: Genes, y: number, vy: number, pipe: Pipe): boolean {
  sense(y, vy, pipe, scratchInputs);
  activate(genes, scratchInputs, scratchHidden, scratchOutput);
  return scratchOutput[0] > scratchOutput[1];
}

/**
 * Projects a genome onto two fixed random directions and turns the angle into a
 * hue. Similar genomes get similar colours, so relatives look alike and you can
 * watch one family take over the flock as evolution converges.
 */
const HUE_AXES = (() => {
  const rng = mulberry32(20240607);
  const axis = () => Float64Array.from({ length: GENE_COUNT }, () => rng() * 2 - 1);
  return [axis(), axis()] as const;
})();

export function genesHue(genes: Genes): number {
  let a = 0;
  let b = 0;
  for (let i = 0; i < GENE_COUNT; i++) {
    a += genes[i] * HUE_AXES[0][i];
    b += genes[i] * HUE_AXES[1][i];
  }
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
}

// ---------------------------------------------------------------------------
// Genetic algorithm
// ---------------------------------------------------------------------------

export interface Agent {
  genes: Genes;
  hue: number;
  /** Copied unchanged from the best bird of the previous generation. */
  elite: boolean;
  y: number;
  prevY: number;
  vy: number;
  alive: boolean;
  framesAlive: number;
  score: number;
  fitness: number;
}

export interface EvolutionSettings {
  /** Chance that each gene gets nudged when a child is born (0..1). */
  mutationRate: number;
  /** Largest nudge a mutation can apply, in either direction. */
  mutationAmount: number;
  /**
   * Mix two parents' genes (true) or clone a single parent (false). Headless
   * benchmarks show crossover helps tiny flocks (~12 birds) but slows down big
   * ones, so it is off by default and exposed as an experiment in the UI.
   */
  crossover: boolean;
}

export const DEFAULT_SETTINGS: EvolutionSettings = {
  mutationRate: 0.1,
  mutationAmount: 0.5,
  crossover: false,
};

/** Median generations to reach 100 pipes: ~43 with 100 birds, ~19 with 500. */
export const DEFAULT_POPULATION = 500;

/** 2^pipes grows fast; cap the exponent so fitness never overflows to Infinity. */
const MAX_SCORE_EXPONENT = 40;

export function fitnessOf(framesAlive: number, score: number) {
  return framesAlive + 1000 * Math.pow(2, Math.min(score, MAX_SCORE_EXPONENT));
}

function createAgent(genes: Genes, elite = false): Agent {
  return {
    genes,
    hue: genesHue(genes),
    elite,
    y: BIRD_START_Y,
    prevY: BIRD_START_Y,
    vy: 0,
    alive: true,
    framesAlive: 0,
    score: 0,
    fitness: 0,
  };
}

export interface GenerationSummary {
  generation: number;
  score: number;
}

export class Population {
  agents: Agent[] = [];
  field: PipeField;
  settings: EvolutionSettings;
  generation = 1;
  /** Pipes passed by the current generation so far. */
  runScore = 0;
  /** Best score of any generation, updated live. */
  bestScore = 0;
  aliveCount = 0;
  /** Final score of every finished generation. */
  history: GenerationSummary[] = [];
  /** The bird the UI follows: the elite while it lives, else the first survivor. */
  leader: Agent | null = null;
  private rng: Rng;

  constructor(size: number, settings: EvolutionSettings = DEFAULT_SETTINGS, rng: Rng = Math.random) {
    this.rng = rng;
    this.settings = { ...settings };
    this.field = new PipeField(rng);
    for (let i = 0; i < size; i++) this.agents.push(createAgent(randomGenes(rng)));
    this.startRun();
  }

  get size() {
    return this.agents.length;
  }

  /**
   * Advances one tick. Calls onDeath for every bird that crashes this tick.
   * Returns true when the whole flock died and a new generation was bred.
   */
  step(onDeath?: (agent: Agent) => void): boolean {
    const passed = this.field.step();
    const pipes = this.field.pipes;
    const next = this.field.next();

    for (const agent of this.agents) {
      if (!agent.alive) continue;
      if (next && wantsToFlap(agent.genes, agent.y, agent.vy, next)) agent.vy = FLAP_VELOCITY;
      fall(agent);
      agent.framesAlive++;

      let dead = hitsGround(agent.y);
      for (let i = 0; !dead && i < pipes.length; i++) dead = hitsPipe(agent.y, pipes[i]);
      if (dead) {
        agent.alive = false;
        agent.score = this.runScore;
        this.aliveCount--;
        onDeath?.(agent);
      }
    }

    if (this.aliveCount > 0 && passed > 0) {
      this.runScore += passed;
      if (this.runScore > this.bestScore) this.bestScore = this.runScore;
    }

    if (this.aliveCount === 0) {
      this.evolve();
      return true;
    }
    if (!this.leader?.alive) this.leader = this.agents.find((a) => a.alive) ?? null;
    return false;
  }

  /** Scores every bird, breeds the next generation and restarts the run. */
  evolve() {
    const agents = this.agents;
    for (const agent of agents) {
      if (agent.alive) agent.score = this.runScore;
      agent.fitness = fitnessOf(agent.framesAlive, agent.score);
    }
    this.history.push({ generation: this.generation, score: this.runScore });

    // Roulette wheel: each bird owns a slice proportional to its fitness.
    const cumulative = new Float64Array(agents.length);
    let total = 0;
    let best = agents[0];
    for (let i = 0; i < agents.length; i++) {
      total += agents[i].fitness;
      cumulative[i] = total;
      if (agents[i].fitness > best.fitness) best = agents[i];
    }
    const pick = (): Agent => {
      const r = this.rng() * total;
      let lo = 0;
      let hi = cumulative.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumulative[mid] > r) hi = mid;
        else lo = mid + 1;
      }
      return agents[lo];
    };

    const { crossover, mutationRate, mutationAmount } = this.settings;
    // Elitism: the champion survives into the next generation unchanged.
    const next: Agent[] = [createAgent(best.genes.slice(), true)];
    while (next.length < agents.length) {
      const mom = pick();
      const genes = mom.genes.slice();
      if (crossover) {
        const dad = pick();
        for (let i = 0; i < GENE_COUNT; i++) if (this.rng() < 0.5) genes[i] = dad.genes[i];
      }
      for (let i = 0; i < GENE_COUNT; i++) {
        if (this.rng() < mutationRate) genes[i] += (this.rng() * 2 - 1) * mutationAmount;
      }
      next.push(createAgent(genes));
    }

    this.agents = next;
    this.generation++;
    this.startRun();
  }

  private startRun() {
    this.field.reset();
    this.runScore = 0;
    this.aliveCount = this.agents.length;
    this.leader = this.agents[0] ?? null;
  }
}
