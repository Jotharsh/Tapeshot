// A photo you can pan and zoom with a finger or a mouse, with points on it you can drag. Draws into a <canvas>.
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export class Viewer {
  /**
   * hooks: { handles(): [{id, kind, x, y}] (photo pixels), draw(ctx, viewer), onTap(point), onDragStart(handle), onDrag(handle, point),
   *          onDragEnd(handle), onNudge(dx, dy) }
   */
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.image = null; this.iw = 0; this.ih = 0;
    this.cw = 0; this.ch = 0; this.dpr = 1;
    this.view = { scale: 1, tx: 0, ty: 0 };
    this.fitScale = 1; this.fitted = true;
    this.pointers = new Map();
    this.gesture = null;
    this.frame = 0;
    canvas.style.touchAction = 'none';
    this.listen(canvas, 'pointerdown', (e) => this.down(e));
    this.listen(canvas, 'pointermove', (e) => this.move(e));
    this.listen(canvas, 'pointerup', (e) => this.up(e));
    this.listen(canvas, 'pointercancel', (e) => this.up(e, true));
    this.listen(canvas, 'wheel', (e) => this.wheel(e), { passive: false });
    this.listen(canvas, 'keydown', (e) => this.key(e));
    this.listen(canvas, 'dblclick', (e) => { const r = canvas.getBoundingClientRect(); this.zoomAt(2, e.clientX - r.left, e.clientY - r.top); });
  }

  listen(target, type, fn, options) { target.addEventListener(type, fn, options); (this.off ??= []).push(() => target.removeEventListener(type, fn, options)); }
  destroy() { this.off?.forEach((f) => f()); cancelAnimationFrame(this.frame); }

  setImage(source, width, height) { this.image = source; this.iw = width; this.ih = height; this.layout(); }

  /** Call when the canvas changes size. */
  layout() {
    const r = this.canvas.getBoundingClientRect();
    this.cw = Math.max(1, r.width); this.ch = Math.max(1, r.height);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cw * this.dpr); this.canvas.height = Math.round(this.ch * this.dpr);
    if (!this.iw) return;
    const margin = 8;
    this.fitScale = Math.min((this.cw - margin * 2) / this.iw, (this.ch - margin * 2) / this.ih);
    if (this.fitted) this.fit(); else { this.constrain(); this.invalidate(); }
  }

  fit() {
    this.fitted = true;
    const s = this.fitScale;
    this.view = { scale: s, tx: (this.cw - this.iw * s) / 2, ty: (this.ch - this.ih * s) / 2 };
    this.invalidate();
  }

  get minScale() { return this.fitScale * 0.7; }
  get maxScale() { return Math.max(8, this.fitScale * 10); }
  toScreen(p) { return { x: p.x * this.view.scale + this.view.tx, y: p.y * this.view.scale + this.view.ty }; }
  toImage(x, y) { return { x: (x - this.view.tx) / this.view.scale, y: (y - this.view.ty) / this.view.scale }; }
  inside(p) { return p.x >= 0 && p.y >= 0 && p.x <= this.iw && p.y <= this.ih; }
  clampToImage(p) { return { x: clamp(p.x, 0, this.iw), y: clamp(p.y, 0, this.ih) }; }

  constrain() {                                           // never let the photo slide completely out of view
    const v = this.view, keep = 70;
    v.tx = clamp(v.tx, keep - this.iw * v.scale, this.cw - keep);
    v.ty = clamp(v.ty, keep - this.ih * v.scale, this.ch - keep);
  }

  zoomAt(factor, sx, sy) {
    const v = this.view, next = clamp(v.scale * factor, this.minScale, this.maxScale);
    const k = next / v.scale;
    v.tx = sx - (sx - v.tx) * k; v.ty = sy - (sy - v.ty) * k; v.scale = next;
    this.fitted = false; this.constrain(); this.invalidate();
  }
  zoomCentre(factor) { this.zoomAt(factor, this.cw / 2, this.ch / 2); }

  pos(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  hit(s, touch) {
    const radius = touch ? 30 : 15;
    let best = null, bestD = radius;
    for (const h of this.hooks.handles()) {
      const p = this.toScreen(h), d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d <= bestD) { best = h; bestD = d; }
    }
    return best;
  }

  down(e) {
    if (e.pointerType !== 'touch') this.canvas.focus({ preventScroll: true });          // so the arrow keys work after a mouse click; a fingertip does not need it
    this.canvas.setPointerCapture?.(e.pointerId);
    const s = this.pos(e);
    this.pointers.set(e.pointerId, s);
    if (this.pointers.size === 2) {                       // a second finger: pinch and pan; abandon whatever one finger was doing
      const [a, b] = [...this.pointers.values()];
      if (this.gesture?.drag) this.hooks.onDragEnd?.(this.gesture.drag);
      this.gesture = { pinch: { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: this.view.scale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, tx: this.view.tx, ty: this.view.ty } };
      return;
    }
    if (this.pointers.size > 2) return;
    const touch = e.pointerType !== 'mouse';
    const h = this.hit(s, touch);
    if (h) {
      const hs = this.toScreen(h);
      this.gesture = { drag: h, grab: { x: hs.x - s.x, y: hs.y - s.y }, touch, at: s };
      this.hooks.onDragStart?.(h);
      this.loupe = { x: hs.x, y: hs.y };
    } else {
      this.gesture = { pan: true, start: s, tx: this.view.tx, ty: this.view.ty, moved: false, t: performance.now() };
    }
    this.invalidate();
  }

  move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const s = this.pos(e);
    this.pointers.set(e.pointerId, s);
    const g = this.gesture;
    if (!g) return;
    if (g.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = clamp(g.pinch.scale * d / g.pinch.d, this.minScale, this.maxScale);
      const k = scale / g.pinch.scale;
      this.view.scale = scale;
      this.view.tx = mid.x - (g.pinch.mid.x - g.pinch.tx) * k;
      this.view.ty = mid.y - (g.pinch.mid.y - g.pinch.ty) * k;
      this.fitted = false; this.constrain(); this.invalidate();
    } else if (g.drag) {
      const target = { x: s.x + g.grab.x, y: s.y + g.grab.y };
      this.loupe = { x: target.x, y: target.y };
      this.hooks.onDrag?.(g.drag, this.clampToImage(this.toImage(target.x, target.y)));
      this.invalidate();
    } else if (g.pan) {
      const dx = s.x - g.start.x, dy = s.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) > 7) g.moved = true;
      if (g.moved) { this.view.tx = g.tx + dx; this.view.ty = g.ty + dy; this.fitted = false; this.constrain(); this.invalidate(); }
    }
  }

  up(e, cancelled = false) {
    const s = this.pos(e);
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.pinch) { if (this.pointers.size < 2) this.gesture = this.pointers.size ? { pan: false, idle: true } : null; return; }
    this.gesture = null; this.loupe = null;
    if (g.drag) this.hooks.onDragEnd?.(g.drag);
    else if (g.pan && !g.moved && !cancelled && performance.now() - g.t < 700) {
      const p = this.toImage(s.x, s.y);
      if (this.inside(p)) this.hooks.onTap?.(p);
    }
    this.invalidate();
  }

  wheel(e) {
    e.preventDefault();
    const s = this.pos(e);
    this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), s.x, s.y);
  }

  key(e) {
    const step = e.shiftKey ? 10 : 1;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (move && this.hooks.onNudge?.(...move)) { e.preventDefault(); return; }
    if (e.key === '+' || e.key === '=') { this.zoomCentre(1.4); e.preventDefault(); }
    else if (e.key === '-') { this.zoomCentre(1 / 1.4); e.preventDefault(); }
    else if (e.key === '0') { this.fit(); e.preventDefault(); }
  }

  invalidate() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); }); }

  render() {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, this.cw, this.ch);
    if (!this.image) return;
    const v = this.view;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.image, v.tx, v.ty, this.iw * v.scale, this.ih * v.scale);
    this.hooks.draw?.(ctx, this);
    if (this.loupe && this.gesture?.drag) this.drawLoupe();
  }

  /** A magnifying circle beside the fingertip, with a crosshair, so a point can be placed exactly. */
  drawLoupe() {
    const { ctx } = this, size = 132, r = size / 2, target = this.loupe;
    const p = this.toImage(target.x, target.y);
    const zoom = Math.max(3 * this.view.scale, 1.5), region = size / zoom;       // three times what is on screen, and never less than 1.5 screen px per photo px
    let cx = target.x, cy = target.y - r - 54;
    if (cy - r < 6) cy = target.y + r + 54;                       // near the top, show it below instead
    cx = clamp(cx, r + 6, this.cw - r - 6); cy = clamp(cy, r + 6, this.ch - r - 6);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(cx - r, cy - r, size, size);
    ctx.imageSmoothingEnabled = zoom < 8;
    ctx.drawImage(this.image, p.x - region / 2, p.y - region / 2, region, region, cx - r, cy - r, size, size);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 2;
    ctx.beginPath(); ctx.moveTo(cx - r + 16, cy); ctx.lineTo(cx - 5, cy); ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + r - 16, cy);
    ctx.moveTo(cx, cy - r + 16); ctx.lineTo(cx, cy - 5); ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + r - 16); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 3.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
