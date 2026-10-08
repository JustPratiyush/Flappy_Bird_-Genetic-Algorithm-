"use client";

import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { POPULATION_STEPS, SPEED_STEPS, type GameEngine, type Snapshot } from "@/lib/flappy/engine";
import HistoryChart from "./HistoryChart";
import { PauseIcon, PlayIcon, ResetIcon } from "./icons";
import styles from "./Playground.module.css";

interface Props {
  snap: Snapshot;
  engineRef: RefObject<GameEngine | null>;
  speedIndex: number;
  setSpeedIndex: Dispatch<SetStateAction<number>>;
  populationIndex: number;
  setPopulationIndex: Dispatch<SetStateAction<number>>;
  mutationPercent: number;
  setMutationPercent: Dispatch<SetStateAction<number>>;
}

const formatCount = (n: number) => n.toLocaleString("en-US");

export default function AiPanel(props: Props) {
  const { snap, engineRef, speedIndex, setSpeedIndex, populationIndex, setPopulationIndex, mutationPercent, setMutationPercent } = props;
  const { ai } = snap;
  const populationTimer = useRef<number | undefined>(undefined);

  const brainRef = useCallback((canvas: HTMLCanvasElement | null) => engineRef.current?.setBrainCanvas(canvas), [engineRef]);

  const onPopulation = (index: number) => {
    setPopulationIndex(index);
    // Changing the flock restarts evolution, so wait until the slider settles.
    window.clearTimeout(populationTimer.current);
    populationTimer.current = window.setTimeout(() => engineRef.current?.setPopulationSize(POPULATION_STEPS[index]), 350);
  };

  const cpuLimited = ai.speed > 1 && ai.effectiveSpeed < ai.speed * 0.85;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Evolution lab</h2>
        <div className={styles.panelActions}>
          <button
            className={styles.iconButton}
            onClick={() => engineRef.current?.setPaused(!ai.paused)}
            aria-label={ai.paused ? "Resume" : "Pause"}
            title={ai.paused ? "Resume (Space)" : "Pause (Space)"}
          >
            {ai.paused ? <PlayIcon /> : <PauseIcon />}
          </button>
          <button
            className={styles.iconButton}
            onClick={() => engineRef.current?.resetEvolution()}
            aria-label="Restart evolution from generation 1"
            title="Restart from generation 1"
          >
            <ResetIcon />
          </button>
        </div>
      </div>

      <dl className={styles.stats}>
        <div>
          <dt>Generation</dt>
          <dd>{formatCount(ai.generation)}</dd>
        </div>
        <div>
          <dt>Alive</dt>
          <dd>
            {formatCount(ai.alive)}
            <small>/{formatCount(ai.population)}</small>
          </dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd className={styles.statAccent}>{formatCount(ai.score)}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd>{formatCount(ai.best)}</dd>
        </div>
      </dl>

      <div className={styles.controls}>
        <label className={styles.slider}>
          <span className={styles.sliderLabel}>Speed</span>
          <input
            type="range"
            min={0}
            max={SPEED_STEPS.length - 1}
            step={1}
            value={speedIndex}
            onChange={(e) => {
              const i = Number(e.target.value);
              setSpeedIndex(i);
              engineRef.current?.setSpeed(SPEED_STEPS[i]);
            }}
          />
          <span className={styles.sliderValue}>{SPEED_STEPS[speedIndex]}x</span>
        </label>
        {cpuLimited && <p className={styles.note}>Your device is maxed out at ≈{ai.effectiveSpeed.toFixed(0)}x.</p>}

        <label className={styles.slider}>
          <span className={styles.sliderLabel}>Birds</span>
          <input
            type="range"
            min={0}
            max={POPULATION_STEPS.length - 1}
            step={1}
            value={populationIndex}
            onChange={(e) => onPopulation(Number(e.target.value))}
          />
          <span className={styles.sliderValue}>{formatCount(POPULATION_STEPS[populationIndex])}</span>
        </label>

        <label className={styles.slider}>
          <span className={styles.sliderLabel}>Mutation</span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={mutationPercent}
            onChange={(e) => {
              const pct = Number(e.target.value);
              setMutationPercent(pct);
              engineRef.current?.setSettings({ mutationRate: pct / 100 });
            }}
          />
          <span className={styles.sliderValue}>{mutationPercent}%</span>
        </label>

        <div className={styles.toggles}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={ai.settings.crossover}
              onChange={(e) => engineRef.current?.setSettings({ crossover: e.target.checked })}
            />
            <span className={styles.switch} aria-hidden />
            Crossover
          </label>
          <label className={styles.toggle}>
            <input type="checkbox" checked={ai.dnaColors} onChange={(e) => engineRef.current?.setDnaColors(e.target.checked)} />
            <span className={styles.switch} aria-hidden />
            DNA colours
          </label>
        </div>
      </div>

      <figure className={styles.brain}>
        <figcaption className={styles.figCaption}>
          <span>Live brain</span>
          <span className={styles.figMeta}>{ai.leaderElite ? "👑 last gen's champion" : "a surviving bird"}</span>
        </figcaption>
        <canvas ref={brainRef} className={styles.brainCanvas} aria-label="Live neural network of the highlighted bird" role="img" />
        <p className={styles.legend}>
          <span className={styles.legendPos}>■</span> positive <span className={styles.legendNeg}>■</span> negative weight · strip
          = its 66 genes
        </p>
      </figure>

      <figure className={styles.history}>
        <figcaption className={styles.figCaption}>
          <span>Score per generation</span>
          <span className={styles.figMeta}>{ai.history.length > 0 ? `${ai.history.length} done` : ""}</span>
        </figcaption>
        <HistoryChart history={ai.history} current={ai.score} generation={ai.generation} />
      </figure>
    </div>
  );
}
