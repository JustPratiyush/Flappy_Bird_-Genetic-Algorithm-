"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onGameCommand } from "@/lib/commands";
import { GameEngine, POPULATION_STEPS, SPEED_STEPS, type Mode, type Snapshot } from "@/lib/flappy/engine";
import { DEFAULT_POPULATION, DEFAULT_SETTINGS } from "@/lib/flappy/sim";
import { loadSprites } from "@/lib/flappy/sprites";
import { monoFont, pixelFont } from "@/lib/fonts";
import AiPanel from "./AiPanel";
import HumanPanel from "./HumanPanel";
import { BrainIcon, GamepadIcon, SoundOffIcon, SoundOnIcon } from "./icons";
import styles from "./Playground.module.css";

const nearestIndex = (steps: readonly number[], value: number) =>
  steps.reduce((best, step, i) => (Math.abs(step - value) < Math.abs(steps[best] - value) ? i : best), 0);

export default function Playground() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const keysActiveRef = useRef(true);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  const [speedIndex, setSpeedIndex] = useState(0);
  const [populationIndex, setPopulationIndex] = useState(() => nearestIndex(POPULATION_STEPS, DEFAULT_POPULATION));
  const [mutationPercent, setMutationPercent] = useState(DEFAULT_SETTINGS.mutationRate * 100);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let engine: GameEngine | null = null;
    let cancelled = false;
    const resize = () => engine?.resize(canvas.clientWidth, Math.min(window.devicePixelRatio || 1, 3));
    const resizeObserver = new ResizeObserver(resize);
    const visibility = new IntersectionObserver(
      ([entry]) => {
        engine?.setVisible(entry.isIntersecting);
        keysActiveRef.current = entry.intersectionRatio >= 0.35;
      },
      { threshold: [0, 0.35, 0.6] },
    );

    loadSprites()
      .then((sprites) => {
        if (cancelled) return;
        engine = new GameEngine(canvas, {
          sprites,
          pixelFont: pixelFont.style.fontFamily,
          monoFont: monoFont.style.fontFamily,
          onChange: (next) => {
            snapRef.current = next;
            setSnap(next);
          },
        });
        engineRef.current = engine;
        resize();
        resizeObserver.observe(canvas);
        visibility.observe(canvas);
        engine.start();
        // Repaint text once the pixel font has arrived.
        void document.fonts?.ready.then(resize);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      visibility.disconnect();
      engine?.destroy();
      engineRef.current = null;
    };
  }, []);

  const setMode = useCallback((mode: Mode) => engineRef.current?.setMode(mode), []);

  // Keyboard: Space/Up/W/X flap, A toggles AI, P pauses, M mutes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      const current = snapRef.current;
      if (!engine || !current || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!keysActiveRef.current) return;

      switch (e.code) {
        case "Space":
        case "ArrowUp":
        case "KeyW":
        case "KeyX":
          e.preventDefault();
          if (e.repeat) return;
          if (current.mode === "human") engine.press();
          else if (e.code === "Space") engine.setPaused(!current.ai.paused);
          break;
        case "Enter":
          if (current.mode === "human" && current.phase === "over") {
            e.preventDefault();
            engine.press();
          }
          break;
        case "KeyA":
          engine.setMode(current.mode === "ai" ? "human" : "ai");
          break;
        case "KeyP":
          if (current.mode === "ai") engine.setPaused(!current.ai.paused);
          break;
        case "KeyM":
          engine.setMuted(!current.muted);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Commands from the explainer and experiment cards further down the page.
  useEffect(
    () =>
      onGameCommand((command) => {
        const engine = engineRef.current;
        if (!engine) return;
        if (command.speed !== undefined) {
          const i = nearestIndex(SPEED_STEPS, command.speed);
          setSpeedIndex(i);
          engine.setSpeed(SPEED_STEPS[i]);
        }
        const settings: { mutationRate?: number; crossover?: boolean } = {};
        if (command.mutationRate !== undefined) {
          settings.mutationRate = command.mutationRate;
          setMutationPercent(Math.round(command.mutationRate * 100));
        }
        if (command.crossover !== undefined) settings.crossover = command.crossover;
        engine.setSettings(settings);
        if (command.population !== undefined) {
          const i = nearestIndex(POPULATION_STEPS, command.population);
          setPopulationIndex(i);
          engine.setPopulationSize(POPULATION_STEPS[i]);
        } else if (command.reset) {
          engine.resetEvolution();
        }
        if (command.mode) engine.setMode(command.mode);
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    [],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (snapRef.current?.mode !== "human") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    engineRef.current?.press();
  };

  const mode = snap?.mode ?? "human";
  const phase = snap?.phase ?? "menu";
  const playing = mode === "human" && phase === "playing";

  return (
    <section id="play" ref={sectionRef} className={styles.playground} aria-label="Flappy Bird game">
      <aside className={styles.intro}>
        <p className={styles.kicker}>Neuroevolution</p>
        <h1 className={styles.introTitle}>Birds that learn by crashing</h1>
        <p>
          Every AI bird gets a tiny neural-network brain wired completely at random. Nobody teaches it to dodge pipes.
          Evolution does:
        </p>
        <ol className={styles.steps}>
          <li>
            <strong>Fly.</strong> The whole flock plays at once.
          </li>
          <li>
            <strong>Select.</strong> Birds that last longest become parents.
          </li>
          <li>
            <strong>Mutate.</strong> Their DNA is copied with tiny random tweaks.
          </li>
          <li>
            <strong>Repeat.</strong> Each generation flies a little better.
          </li>
        </ol>
        <a className={styles.introLink} href="#how">
          Watch it explained ↓
        </a>
      </aside>

      <div className={styles.gameColumn}>
        <div className={styles.toolbar}>
          <div className={styles.segmented} role="group" aria-label="Game mode">
            <button
              aria-pressed={mode === "human"}
              className={mode === "human" ? styles.segmentActive : styles.segment}
              onClick={() => setMode("human")}
            >
              <GamepadIcon /> You play
            </button>
            <button
              aria-pressed={mode === "ai"}
              className={mode === "ai" ? styles.segmentActive : styles.segment}
              onClick={() => setMode("ai")}
            >
              <BrainIcon /> AI learns
            </button>
          </div>
          <button
            className={styles.iconButton}
            onClick={() => engineRef.current?.setMuted(!snap?.muted)}
            aria-label={snap?.muted ? "Unmute sound" : "Mute sound"}
            title={snap?.muted ? "Unmute (M)" : "Mute (M)"}
          >
            {snap?.muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
        </div>

        <div className={styles.stage}>
          <canvas
            ref={canvasRef}
            className={playing ? `${styles.canvas} ${styles.canvasPlaying}` : styles.canvas}
            onPointerDown={onPointerDown}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={mode === "ai" ? "AI birds training" : "Flappy Bird. Tap or press space to flap."}
            role="img"
          />

          {failed && <div className={styles.overlay}>Couldn&apos;t load the game assets. Please refresh.</div>}

          {snap && mode === "human" && phase === "menu" && (
            <div className={styles.overlay}>
              <div className={styles.card}>
                <p className={styles.cardTitle}>Flappy Bird</p>
                <p className={styles.cardSubtitle}>AI edition</p>
                <button className={styles.primaryButton} onClick={() => engineRef.current?.play()} autoFocus>
                  ▶ Play
                </button>
                <button className={styles.secondaryButton} onClick={() => setMode("ai")}>
                  🧬 Watch AI learn
                </button>
                <p className={styles.cardHint}>Tap · Space · ↑ to flap</p>
              </div>
            </div>
          )}

          {snap && mode === "human" && phase === "over" && (
            <div className={`${styles.overlay} ${styles.overlayDim}`}>
              <div className={`${styles.card} ${styles.cardPop}`}>
                <p className={styles.cardTitle}>Game over</p>
                <div className={styles.scoreRow}>
                  <div>
                    <span className={styles.scoreLabel}>Score</span>
                    <span className={styles.scoreValue}>{snap.score}</span>
                  </div>
                  <div>
                    <span className={styles.scoreLabel}>Best</span>
                    <span className={styles.scoreValue}>{snap.best}</span>
                  </div>
                </div>
                {snap.newBest && snap.best > 0 && <p className={styles.newBest}>New best!</p>}
                <button className={styles.primaryButton} onClick={() => engineRef.current?.press()} autoFocus>
                  ↻ Retry
                </button>
                <button className={styles.secondaryButton} onClick={() => setMode("ai")}>
                  🧬 Can AI beat {snap.best}?
                </button>
              </div>
            </div>
          )}
        </div>

        <a className={styles.scrollCue} href="#how">
          <span>How do they learn?</span>
          <span className={styles.scrollArrow} aria-hidden>
            ↓
          </span>
        </a>
      </div>

      <div className={styles.panelColumn}>
        {mode === "ai" && snap ? (
          <AiPanel
            snap={snap}
            engineRef={engineRef}
            speedIndex={speedIndex}
            setSpeedIndex={setSpeedIndex}
            populationIndex={populationIndex}
            setPopulationIndex={setPopulationIndex}
            mutationPercent={mutationPercent}
            setMutationPercent={setMutationPercent}
          />
        ) : (
          <HumanPanel best={snap?.best ?? 0} aiBest={snap?.ai.best ?? 0} onTrain={() => setMode("ai")} />
        )}
      </div>
    </section>
  );
}
