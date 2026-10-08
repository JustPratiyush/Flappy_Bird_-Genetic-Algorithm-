import styles from "./Playground.module.css";

interface Props {
  best: number;
  aiBest: number;
  onTrain: () => void;
}

export default function HumanPanel({ best, aiBest, onTrain }: Props) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>How to play</h2>
      <ul className={styles.keys}>
        <li>
          <span>
            <kbd>Space</kbd> <kbd>↑</kbd> or tap
          </span>
          <span>flap</span>
        </li>
        <li>
          <span>
            <kbd>A</kbd>
          </span>
          <span>switch to AI mode</span>
        </li>
        <li>
          <span>
            <kbd>M</kbd>
          </span>
          <span>mute</span>
        </li>
      </ul>

      <dl className={styles.stats}>
        <div>
          <dt>Your best</dt>
          <dd className={styles.statAccent}>{best}</dd>
        </div>
        <div>
          <dt>AI best</dt>
          <dd>{aiBest > 0 ? aiBest : "–"}</dd>
        </div>
      </dl>

      <div className={styles.challenge}>
        <p>
          The AI starts out <em>terrible</em>. Hundreds of birds with random brains crash within seconds. Give evolution a
          minute and see who wins.
        </p>
        <button className={styles.primaryButton} onClick={onTrain}>
          🧬 Train the AI
        </button>
      </div>
    </div>
  );
}
