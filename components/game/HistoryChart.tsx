import type { GenerationSummary } from "@/lib/flappy/sim";
import styles from "./Playground.module.css";

const MAX_BARS = 40;

interface Props {
  history: GenerationSummary[];
  /** Live score of the generation in progress, drawn as the last bar. */
  current: number;
  generation: number;
}

export default function HistoryChart({ history, current, generation }: Props) {
  const bars = [...history.slice(-(MAX_BARS - 1)), { generation, score: current }];
  const max = Math.max(5, ...bars.map((b) => b.score));
  const width = 300;
  const height = 92;
  const slot = width / MAX_BARS;
  const barWidth = Math.max(2, slot * 0.72);

  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Pipes passed per generation (square-root scale), best ${max}`}>
        <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} className={styles.chartAxis} />
        {bars.map((bar, i) => {
          // Square-root scale: one breakthrough generation shouldn't flatten all the early progress.
          const h = Math.max(1.5, Math.sqrt(bar.score / max) * (height - 6));
          const live = i === bars.length - 1;
          return (
            <rect
              key={bar.generation}
              x={i * slot + (slot - barWidth) / 2}
              y={height - h}
              width={barWidth}
              height={h}
              rx={1}
              className={live ? styles.chartLive : styles.chartBar}
            />
          );
        })}
      </svg>
      <div className={styles.chartLabels}>
        <span>gen {bars[0].generation}</span>
        <span>max {max.toLocaleString("en-US")} · √ scale</span>
        <span>gen {generation}</span>
      </div>
    </div>
  );
}
