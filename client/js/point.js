
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  static fromPoint(p) { return new Point(p.x, p.y); }
  static displayName = "Point";
  static distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  static equals(a, b) { return a.x === b.x && a.y === b.y; }
  mul(v) { return new Point(this.x * v, this.y * v); }
  div(v) { return new Point(this.x / v, this.y / v); }
  add(v) { 
    if (v instanceof Point) {
      return new Point(this.x + v.x, this.y + v.y);
    } else {
      return new Point(this.x + v, this.y + v);
    }
  }
  sub(v) { 
    if (v instanceof Point) {
      return new Point(this.x - v.x, this.y - v.y);
    } else {
      return new Point(this.x - v, this.y - v);
    }
  }
}

class Rect {
  constructor(tl, br) {
    this.tl = tl;
    this.br = br;
  }
  static fromXYWH(x, y, width, height) {
    return new Rect(new Point(x, y), new Point(x + width, y + height));
  }
  static fromCenterSize(center, size) {
    return new Rect(new Point(center.x - size.x / 2, center.y - size.y / 2), 
                    new Point(center.x + size.x / 2, center.y + size.y / 2));
  }
  static fromRect(rect) {  // Useful for DOMRect.
    return Rect.fromXYWH(rect.x, rect.y, rect.width, rect.height);
  }
  static fromElement(el) {
    return Rect.fromXYWH(el.clientLeft, el.clientTop, el.clientWidth, el.clientHeight);
  }
  static displayName = "Rect";

  get top() { return this.tl.y; }
  get left() { return this.tl.x; }
  get bottom() { return this.br.y; }
  get right() { return this.br.x; }
  get width() { return this.br.x - this.tl.x; }
  get height() { return this.br.y - this.tl.y; }
  get area() { return this.width * this.height; }
  get center() { return new Point((this.left + this.right) / 2, (this.top + this.bottom) / 2); }
  get size() { return new Point(this.width, this.height); }
  contains(p) {
    return this.left <= p.x && p.x < this.right && this.top <= p.y && p.y < this.bottom;
  }
  intersects(r) {
    return !(this.left > r.right || this.right < r.left ||
             this.top > r.bottom || this.bottom < r.top);
  }
  intersection(r) {
    if (!this.intersects(r)) {
      return null;
    }
    return new Rect(
        new Point(Math.max(this.left, r.left), Math.max(this.top, r.top)),
        new Point(Math.min(this.right, r.right), Math.min(this.bottom, r.bottom)));
  }
  union(r) {
    return new Rect(
        new Point(Math.min(this.left, r.left), Math.min(this.top, r.top)),
        new Point(Math.max(this.right, r.right), Math.max(this.bottom, r.bottom)));
  }
  clamp(p) {
    return new Point(Math.max(this.left, Math.min(p.x, this.right)), 
                     Math.max(this.top, Math.min(p.y, this.bottom)));
  }
  // Support Rect and DOMRect.
  static equals(a, b) { return a.top == b.top && a.left == b.left && a.width == b.width && a.height == b.height; }
}
