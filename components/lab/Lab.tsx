"use client";

import { sendGameCommand, type GameCommand } from "@/lib/commands";
import { DEFAULT_POPULATION, DEFAULT_SETTINGS } from "@/lib/flappy/sim";
import styles from "./Lab.module.css";

interface Experiment {
  emoji: string;
  title: string;
  body: string;
  command: GameCommand;
}

const DEFAULTS: GameCommand = {
  population: DEFAULT_POPULATION,
  mutationRate: DEFAULT_SETTINGS.mutationRate,
  crossover: DEFAULT_SETTINGS.crossover,
};

const EXPERIMENTS: Experiment[] = [
  {
    emoji: "🧊",
    title: "No mutation",
    body: "Children become perfect clones. Nothing new can ever appear, so the flock stops improving after the first few generations.",
    command: { ...DEFAULTS, mutationRate: 0, speed: 5, reset: true },
  },
  {
    emoji: "🌪️",
    title: "Mutation chaos",
    body: "Half of every child's genes get scrambled. Good parents can't pass on what made them good, so learning turns noisy and slow.",
    command: { ...DEFAULTS, mutationRate: 0.5, speed: 5, reset: true },
  },
  {
    emoji: "🐣",
    title: "Tiny flock",
    body: "Just 10 birds means 10 lottery tickets per generation. It can take hundreds of generations to get lucky.",
    command: { ...DEFAULTS, population: 10, speed: 10 },
  },
  {
    emoji: "🌍",
    title: "Giant flock",
    body: "5,000 random brains at once. With that many tickets, a decent flyer often shows up within a handful of generations.",
    command: { ...DEFAULTS, population: 5000, speed: 3 },
  },
  {
    emoji: "🧬",
    title: "Crossover on",
    body: "Each child mixes two parents. Our benchmarks say it helps tiny flocks but slows big ones. Run it against the default and judge yourself.",
    command: { ...DEFAULTS, crossover: true, speed: 5, reset: true },
  },
  {
    emoji: "↺",
    title: "Back to defaults",
    body: "500 birds, 10% mutation, no crossover, real-time speed. The settings the explainer above describes.",
    command: { ...DEFAULTS, speed: 1, reset: true },
  },
];

const FAQ = [
  {
    q: "Is this real AI?",
    a: "Yes. Each bird is driven by a genuine neural network. What's unusual is how it learns: there's no training data and no backpropagation, only random variation plus selection. This family of methods is called neuroevolution.",
  },
  {
    q: "Why do the birds change colour over time?",
    a: "Each bird's colour is computed from its DNA, so relatives look alike. Early generations are a rainbow of unrelated random brains. As one family out-breeds the rest, the flock converges on its colour.",
  },
  {
    q: "Why does progress come in sudden jumps?",
    a: "For a while every bird fails at the same hurdle and fitness barely moves. Then one mutation cracks it, that bird scores exponentially higher, wins most roulette spins, and its descendants flood the next generation.",
  },
  {
    q: "Why does the best bird sometimes do worse next time?",
    a: "Pipe heights are random every run. A champion that got lucky once may crash on a harder layout. That's why evolution works with a whole population rather than a single star.",
  },
];

export default function Lab() {
  return (
    <section id="lab" className={styles.lab} aria-labelledby="lab-title">
      <div className={styles.cta}>
        <p className={styles.kicker}>Your turn</p>
        <h2 id="lab-title" className={styles.title}>
          Run evolution yourself
        </h2>
        <p className={styles.lead}>
          Every experiment below reconfigures the game at the top of the page and starts a fresh flock. Watch the score
          chart and the colours of the birds.
        </p>
        <div className={styles.ctaButtons}>
          <button className={styles.primary} onClick={() => sendGameCommand({ mode: "ai" })}>
            🧬 Train the AI
          </button>
          <button className={styles.secondary} onClick={() => sendGameCommand({ mode: "human" })}>
            🎮 Play yourself
          </button>
        </div>
      </div>

      <ul className={styles.grid}>
        {EXPERIMENTS.map((exp) => (
          <li key={exp.title}>
            <button className={styles.experiment} onClick={() => sendGameCommand({ ...exp.command, mode: "ai" })}>
              <span className={styles.emoji} aria-hidden>
                {exp.emoji}
              </span>
              <span className={styles.expTitle}>{exp.title}</span>
              <span className={styles.expBody}>{exp.body}</span>
              <span className={styles.expRun}>Run experiment ↑</span>
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.faq}>
        <h2 className={styles.faqTitle}>Good to know</h2>
        {FAQ.map((item) => (
          <details key={item.q} className={styles.faqItem}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
