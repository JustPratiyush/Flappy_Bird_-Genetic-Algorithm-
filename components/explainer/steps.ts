export interface ExplainerStep {
  /** Short label for the stage HUD. */
  label: string;
  title: string;
  body: string;
  code: string;
}

/** One entry per stage scene, in the same order as STEP in lib/explainer/stage.ts. */
export const STEPS: ExplainerStep[] = [
  {
    label: "Senses",
    title: "What a bird sees",
    body: "Every frame, each bird measures five things: its height, how fast it's rising or falling, the distance to the next pipe, and where that pipe's gap starts and ends.",
    code: "inputs = [y, velocity, pipeDist, gapTop, gapBottom]",
  },
  {
    label: "Brain",
    title: "A tiny brain decides",
    body: "Those five numbers flow through a small neural network: 5 inputs, 8 hidden neurons, 2 outputs. If FLAP scores higher than WAIT, the bird flaps. That's the whole brain.",
    code: "if (flap > wait) jump()",
  },
  {
    label: "DNA",
    title: "The brain is just numbers",
    body: "Every connection has a strength (a weight) and every neuron a bias. Line all 66 numbers up and you have the bird's DNA. Different numbers, different behaviour.",
    code: "genes.length === 66 // 40 + 8 + 16 + 2",
  },
  {
    label: "Generation 1",
    title: "Generation 1: pure chaos",
    body: "We hatch 500 birds with completely random DNA. None of them know what a pipe is. Each bird is coloured by its DNA, so relatives look alike.",
    code: "new Bird(randomGenes())",
  },
  {
    label: "Flight",
    title: "Let them all fly",
    body: "The whole flock plays at once. Some never flap and drop like stones, others flap into the ceiling. Most crash within seconds; a lucky few slip through a pipe or two.",
    code: "framesAlive++",
  },
  {
    label: "Fitness",
    title: "Score every bird",
    body: "When the last bird falls, each one gets a fitness score: frames survived, plus a bonus that doubles with every pipe cleared. One more pipe beats any amount of hovering.",
    code: "fitness = frames + 1000 * 2 ** pipes",
  },
  {
    label: "Selection",
    title: "Spin for parents",
    body: "Parents are picked on a roulette wheel where fitter birds own bigger slices: likely to win, never guaranteed. The champion also skips the wheel and is copied into the next generation untouched. That's elitism.",
    code: "parent = spinWheel(fitness)",
  },
  {
    label: "Mutation",
    title: "Copy, then mutate",
    body: "Each child starts as an exact copy of its parent's DNA. Then every gene has a 10% chance of being nudged by up to ±0.5. Most nudges hurt, a few help, and selection keeps the helpful ones.",
    code: "if (rand() < 0.1) gene += rand(-0.5, 0.5)",
  },
  {
    label: "Crossover",
    title: "Bonus: crossover",
    body: "Nature also mixes two parents. Switch on crossover in the lab and each child takes every gene from one parent or the other on a coin flip. In our tests it helps tiny flocks but slows big ones. Try it!",
    code: "child[i] = coin() ? mom[i] : dad[i]",
  },
  {
    label: "Repeat",
    title: "Repeat until it masters the game",
    body: "Fly, score, select, mutate, repeat. Progress stalls for a while, then one lucky mutation cracks it and its descendants take over the flock. In this recorded run, generation 19 sailed past 150 pipes.",
    code: "generation++",
  },
];
