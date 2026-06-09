// Lightweight confetti burst — no dependencies.
// Call burst(x, y) with page coordinates to fire from that point.

const COLORS = ['#1D9E75', '#5DCAA5', '#9FE1CB', '#FAC775', '#F0997B', '#85B7EB'];
const PARTICLE_COUNT = 28;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

export function burst(x, y) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    pointer-events: none;
    z-index: 9999;
  `;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x,
    y,
    vx: rand(-6, 6),
    vy: rand(-12, -4),
    size: rand(5, 10),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: rand(0, Math.PI * 2),
    rotationSpeed: rand(-0.2, 0.2),
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
    alpha: 1,
    gravity: 0.35,
  }));

  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    for (const p of particles) {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.alpha -= 0.022;

      if (p.alpha <= 0) continue;
      alive = true;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (alive) {
      frame = requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }

  frame = requestAnimationFrame(draw);

  // Safety cleanup after 3s
  setTimeout(() => {
    cancelAnimationFrame(frame);
    canvas.remove();
  }, 3000);
}

// Fire from the center of a DOM element
export function burstFromEl(el) {
  const rect = el.getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
}
