/*
 * Low-latency sound effects through the Web Audio API. HTMLAudioElement lags
 * noticeably on phones when the same clip is replayed every flap.
 */

export type SoundName = "wing" | "point" | "hit" | "die" | "swoosh";

const FILES: Record<SoundName, string> = {
  wing: "/assets/sounds/sfx_wing.wav",
  point: "/assets/sounds/sfx_point.wav",
  hit: "/assets/sounds/sfx_hit.wav",
  die: "/assets/sounds/sfx_die.wav",
  swoosh: "/assets/sounds/sfx_swooshing.wav",
};

export class SoundBank {
  muted = false;
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();

  /** Must be called from a user gesture (browsers block audio before one). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    const ctx = this.ctx;
    for (const [name, url] of Object.entries(FILES) as [SoundName, string][]) {
      fetch(url)
        .then((res) => res.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => this.buffers.set(name, buffer))
        .catch(() => {
          /* A missing sound should never break the game. */
        });
    }
  }

  play(name: SoundName, volume = 0.6) {
    if (this.muted || !this.ctx) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain).connect(this.ctx.destination);
    source.start();
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
