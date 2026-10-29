/**
 * The «Try with a sample» picture: an abstract landscape the tool draws itself, so no artwork ships with it. The
 * size is the design's sample painting's, 1920 × 2578 px: about 450 dpi on the card, and a little wider than the
 * card, so Fill card crops its sides and the blurred surround shows. The same picture every time.
 */
export const SAMPLE_PX = { w: 1920, h: 2578 } as const;

/** Hills from the back to the front: base line (share of the height), wave height, phase, colour. */
const HILLS: [number, number, number, string][] = [
  [0.47, 0.03, 0.3, '#cf9466'],
  [0.56, 0.04, 1.7, '#b5533a'],
  [0.65, 0.045, 3.1, '#8f4a32'],
  [0.75, 0.04, 4.4, '#6f7448'],
  [0.86, 0.035, 5.6, '#5b4e3e'],
];

export function drawSample(c: CanvasRenderingContext2D, w: number, h: number): void {
  const sky = c.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#f0dcbc');
  sky.addColorStop(1, '#dc9a68');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);

  c.fillStyle = '#f7e8c8';
  c.beginPath();
  c.arc(w * 0.68, h * 0.25, w * 0.11, 0, 2 * Math.PI);
  c.fill();

  for (const [base, wave, phase, colour] of HILLS) {
    c.fillStyle = colour;
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const u = x / w;
      c.lineTo(x, h * (base + wave * Math.sin(u * 5.1 + phase) + wave * 0.5 * Math.sin(u * 11.3 + phase * 1.7)));
    }
    c.lineTo(w, h);
    c.closePath();
    c.fill();
  }

  // Brush marks: short translucent strokes from a seeded generator, so they fall the same way every time.
  let seed = 20261029;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  c.lineCap = 'round';
  for (let i = 0; i < 2500; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 20 + rnd() * 60;
    const a = (rnd() - 0.5) * 0.6;
    c.strokeStyle = rnd() < 0.5 ? 'rgba(255, 248, 235, 0.1)' : 'rgba(60, 40, 25, 0.08)';
    c.lineWidth = 3 + rnd() * 6;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
}
