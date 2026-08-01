const PHASE_COLORS = {
  select: [170, 129, 71],
  auction: [181, 109, 77],
  resolution: [184, 143, 80],
  shop: [73, 111, 101],
  finished: [172, 134, 72],
};

export function createGameBoard(canvas) {
  if (!canvas) return { setPhase() {}, destroy() {} };
  const context = canvas.getContext("2d", { alpha: true });
  const host = canvas.parentElement;
  let phase = "select";
  let frame = 0;
  let width = 1;
  let height = 1;
  let ratio = 1;
  let stopped = false;
  const particles = Array.from({ length: 18 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 18 + Math.random() * .25,
    radius: .15 + Math.random() * .34,
    speed: .00008 + Math.random() * .00012,
    size: .45 + Math.random() * .8,
    alpha: .08 + Math.random() * .12,
  }));

  function resize() {
    const bounds = host.getBoundingClientRect();
    ratio = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function lineCircle(cx, cy, radius, color, alpha, lineWidth = 1) {
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.strokeStyle = `rgba(${color.join(",")},${alpha})`;
    context.lineWidth = lineWidth;
    context.stroke();
  }

  function diamond(x, y, size, color, alpha) {
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    const gradient = context.createLinearGradient(-size, -size, size, size);
    gradient.addColorStop(0, `rgba(${color.join(",")},${alpha * 1.35})`);
    gradient.addColorStop(1, `rgba(53,31,18,${alpha})`);
    context.fillStyle = gradient;
    context.strokeStyle = `rgba(210,171,103,${alpha * 1.2})`;
    context.lineWidth = 1;
    context.fillRect(-size, -size, size * 2, size * 2);
    context.strokeRect(-size, -size, size * 2, size * 2);
    context.restore();
  }

  function draw(timestamp) {
    if (stopped) return;
    frame = requestAnimationFrame(draw);
    context.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(20, Math.min(width, height) * .455);
    const color = PHASE_COLORS[phase] || PHASE_COLORS.select;
    const pulse = phase === "auction" ? .5 + Math.sin(timestamp * .0026) * .5 : .35;

    const aura = context.createRadialGradient(cx, cy, radius * .05, cx, cy, radius);
    aura.addColorStop(0, `rgba(${color.join(",")},.055)`);
    aura.addColorStop(.58, `rgba(${color.join(",")},.012)`);
    aura.addColorStop(1, "rgba(0,0,0,.13)");
    context.fillStyle = aura;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();

    lineCircle(cx, cy, radius * .92, color, .22, 1);
    lineCircle(cx, cy, radius * .71, color, .075, 1);
    lineCircle(cx, cy, radius * .46, color, .07, 1);
    lineCircle(cx, cy, radius * .2, color, .09, 1);

    context.save();
    context.translate(cx, cy);
    context.strokeStyle = `rgba(${color.join(",")},.07)`;
    context.lineWidth = 1;
    for (let index = 0; index < 16; index += 1) {
      const angle = (Math.PI * 2 * index) / 16;
      context.beginPath();
      context.moveTo(Math.cos(angle) * radius * .19, Math.sin(angle) * radius * .19);
      context.lineTo(Math.cos(angle) * radius * .43, Math.sin(angle) * radius * .43);
      context.stroke();
    }
    context.rotate(Math.PI / 4);
    context.strokeRect(-radius * .115, -radius * .115, radius * .23, radius * .23);
    context.restore();

    for (let index = 0; index < 8; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 8;
      const markerRadius = radius * .72;
      const x = cx + Math.cos(angle) * markerRadius;
      const y = cy + Math.sin(angle) * markerRadius;
      diamond(x, y, 2.3 + pulse * .7, color, .2 + pulse * .07);
      lineCircle(x, y, 7.5, color, .08 + pulse * .03, 1);
    }

    for (const particle of particles) {
      particle.angle += particle.speed * (16.6 + (timestamp % 13));
      const distance = radius * particle.radius;
      const x = cx + Math.cos(particle.angle) * distance;
      const y = cy + Math.sin(particle.angle) * distance * .82;
      context.fillStyle = `rgba(${color.join(",")},${particle.alpha})`;
      context.beginPath();
      context.arc(x, y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  frame = requestAnimationFrame(draw);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else if (!stopped) frame = requestAnimationFrame(draw);
  });

  return {
    setPhase(next) { phase = next in PHASE_COLORS ? next : "select"; },
    destroy() { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); },
  };
}
