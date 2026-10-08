/* CanvasRenderingContext2D.roundRect only landed in Safari 16; older iPhones would throw mid-frame without it. */

export function installCanvasPolyfills() {
  const proto = typeof CanvasRenderingContext2D !== "undefined" ? CanvasRenderingContext2D.prototype : null;
  if (!proto || typeof proto.roundRect === "function") return;
  proto.roundRect = function roundRect(this: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radii?: number | DOMPointInit | (number | DOMPointInit)[]) {
    const first = Array.isArray(radii) ? radii[0] : radii;
    const r = Math.max(0, Math.min(typeof first === "number" ? first : 0, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}
