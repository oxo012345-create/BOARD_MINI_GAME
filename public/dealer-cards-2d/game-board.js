const PHASE_COLORS = {
  select: [160, 119, 68],
  auction: [174, 101, 75],
  resolution: [175, 132, 73],
  shop: [72, 105, 96],
  finished: [161, 124, 69],
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
  let paused = false;
  const particles = Array.from({ length: 8 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 8 + Math.random() * .3,
    radius: .12 + Math.random() * .3,
    speed: .000025 + Math.random() * .00004,
    size: .35 + Math.random() * .45,
    alpha: .025 + Math.random() * .04,
  }));

  function resize() {
    const bounds = host.getBoundingClientRect();
    ratio = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, Math.round(bounds.width - 30));
    height = Math.max(1, Math.round(bounds.height - 30));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(timestamp) {
    if (stopped || paused) return;
    frame = requestAnimationFrame(draw);
    context.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(20, Math.min(width, height) * .48);
    const color = PHASE_COLORS[phase] || PHASE_COLORS.select;
    const pulse = phase === "auction" ? Math.sin(timestamp * .0014) * .008 : 0;

    const aura = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    aura.addColorStop(0, `rgba(${color.join(",")},${.045 + pulse})`);
    aura.addColorStop(.56, `rgba(${color.join(",")},.008)`);
    aura.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = aura;
    context.fillRect(0, 0, width, height);

    for (const particle of particles) {
      particle.angle += particle.speed * 16.6;
      const distance = radius * particle.radius;
      const x = cx + Math.cos(particle.angle) * distance;
      const y = cy + Math.sin(particle.angle) * distance * .82;
      context.fillStyle = `rgba(${color.join(",")},${particle.alpha})`;
      context.beginPath();
      context.arc(x, y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
  }

  function onVisibilityChange() {
    paused = document.hidden;
    cancelAnimationFrame(frame);
    if (!paused && !stopped) frame = requestAnimationFrame(draw);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  frame = requestAnimationFrame(draw);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    setPhase(next) { phase = next in PHASE_COLORS ? next : "select"; },
    destroy() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
