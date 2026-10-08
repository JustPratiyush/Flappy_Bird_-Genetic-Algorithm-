/*
 * Lets sections further down the page (explainer, experiments) drive the game
 * at the top without sharing React state: they dispatch a window event and the
 * playground applies it and scrolls itself into view.
 */

import type { Mode } from "./flappy/engine";

export interface GameCommand {
  mode?: Mode;
  speed?: number;
  population?: number;
  mutationRate?: number;
  crossover?: boolean;
  /** Restart evolution from generation 1 after applying settings. */
  reset?: boolean;
}

const EVENT = "flappy:command";

export function sendGameCommand(command: GameCommand) {
  window.dispatchEvent(new CustomEvent<GameCommand>(EVENT, { detail: command }));
}

export function onGameCommand(handler: (command: GameCommand) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<GameCommand>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
