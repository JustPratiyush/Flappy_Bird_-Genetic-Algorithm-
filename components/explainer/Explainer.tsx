"use client";

import { useEffect, useRef, useState } from "react";
import { EvolutionStage } from "@/lib/explainer/stage";
import { TintCache, loadSprites } from "@/lib/flappy/sprites";
import { monoFont, pixelFont, sansFont } from "@/lib/fonts";
import styles from "./Explainer.module.css";
import { STEPS } from "./steps";

const MOBILE_QUERY = "(max-width: 860px)";

/** Where a step card becomes active, as a fraction of the viewport height (same basis as CSS vh). */
const triggerLine = () => document.documentElement.clientHeight * (window.matchMedia(MOBILE_QUERY).matches ? 0.72 : 0.55);

export default function Explainer() {
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stageRef = useRef<EvolutionStage | null>(null);
  const [active, setActive] = useState(0);

  // Create the canvas stage once sprites are ready; run it only while on screen.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const box = stageBoxRef.current!;
    let stage: EvolutionStage | null = null;
    let cancelled = false;
    let onScreen = false;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      stage?.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2.5));
    };
    const resizeObserver = new ResizeObserver(resize);
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      stage?.setRunning(onScreen);
    });

    loadSprites().then((sprites) => {
      if (cancelled) return;
      stage = new EvolutionStage(canvas, {
        sprites,
        tints: new TintCache(sprites.birdFrames),
        pixelFont: pixelFont.style.fontFamily,
        monoFont: monoFont.style.fontFamily,
        sansFont: sansFont.style.fontFamily,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
      stageRef.current = stage;
      resizeObserver.observe(box);
      visibility.observe(box);
      resize();
      stage.setRunning(onScreen);
    });

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      visibility.disconnect();
      stage?.destroy();
      stageRef.current = null;
    };
  }, []);

  // The active step is the last card whose top has crossed the trigger line.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const cards = listRef.current?.querySelectorAll<HTMLElement>("[data-card]");
      if (!cards) return;
      const line = triggerLine();
      let next = 0;
      cards.forEach((card, i) => {
        if (card.getBoundingClientRect().top <= line) next = i;
      });
      setActive(next);
      stageRef.current?.setStep(next);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, []);

  const jumpTo = (index: number) => {
    const card = listRef.current?.querySelectorAll<HTMLElement>("[data-card]")[index];
    if (!card) return;
    const top = card.getBoundingClientRect().top + window.scrollY - triggerLine() + 8;
    window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <section id="how" className={styles.explainer} aria-labelledby="how-title">
      <header className={styles.header}>
        <p className={styles.kicker}>How it learns</p>
        <h2 id="how-title" className={styles.title}>
          Survival of the flappiest
        </h2>
        <p className={styles.lead}>
          Nobody programs these birds to dodge pipes. They start with random brains and evolve. Scroll through one full
          cycle of the genetic algorithm that runs above.
        </p>
      </header>

      <div className={styles.scrolly}>
        <div className={styles.stageSticky}>
          <div ref={stageBoxRef} className={styles.stage}>
            <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={`Animation: ${STEPS[active].title}`} />
            <div className={styles.hud}>
              <p className={styles.hudLabel}>
                <span className={styles.hudNumber}>{String(active + 1).padStart(2, "0")}</span>
                <span key={active} className={styles.hudText}>
                  {STEPS[active].label}
                </span>
              </p>
              <div className={styles.progress}>
                {STEPS.map((step, i) => (
                  <button
                    key={step.label}
                    className={i <= active ? `${styles.dot} ${styles.dotDone}` : styles.dot}
                    aria-label={`Go to step ${i + 1}: ${step.title}`}
                    aria-current={i === active ? "step" : undefined}
                    onClick={() => jumpTo(i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <ol ref={listRef} className={styles.steps}>
          {STEPS.map((step, i) => (
            <li key={step.title} className={styles.step}>
              <article data-card className={i === active ? `${styles.card} ${styles.cardActive}` : styles.card}>
                <span className={styles.cardNumber}>{String(i + 1).padStart(2, "0")}</span>
                <h3 className={styles.cardTitle}>{step.title}</h3>
                <p className={styles.cardBody}>{step.body}</p>
                <code className={styles.code}>{step.code}</code>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
