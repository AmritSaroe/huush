const WIDTH_CLASSES = [
  { name: "compact", max: 600 },
  { name: "medium", max: 840 },
  { name: "expanded", max: 1200 },
  { name: "large", max: 1600 },
  { name: "extra-large", max: Number.POSITIVE_INFINITY },
];

const HEIGHT_CLASSES = [
  { name: "compact", max: 480 },
  { name: "medium", max: 900 },
  { name: "expanded", max: Number.POSITIVE_INFINITY },
];

function classify(value, classes) {
  return classes.find((entry) => value < entry.max)?.name || classes.at(-1).name;
}

function viewportSize() {
  const visualViewport = window.visualViewport;
  const width = Math.max(1, Math.round(visualViewport?.width || document.documentElement.clientWidth || window.innerWidth));
  const height = Math.max(1, Math.round(visualViewport?.height || document.documentElement.clientHeight || window.innerHeight));
  return { width, height };
}

function setViewportState() {
  const root = document.documentElement;
  const { width, height } = viewportSize();
  const widthClass = classify(width, WIDTH_CLASSES);
  const heightClass = classify(height, HEIGHT_CLASSES);
  const orientation = width >= height ? "landscape" : "portrait";

  root.dataset.windowWidth = widthClass;
  root.dataset.windowHeight = heightClass;
  root.dataset.orientation = orientation;
  root.dataset.adaptiveLayout = "ready";
  root.style.setProperty("--wm-viewport-width", `${width}px`);
  root.style.setProperty("--wm-viewport-height", `${height}px`);
  root.style.setProperty("--wm-viewport-inline", `${Math.max(width, height)}px`);
  root.style.setProperty("--wm-viewport-block", `${Math.min(width, height)}px`);
}

export function initAdaptiveLayout() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    const run = () => {
      frame = 0;
      setViewportState();
    };
    if (typeof window.requestAnimationFrame === "function") frame = window.requestAnimationFrame(run);
    else frame = window.setTimeout(run, 0);
  };

  setViewportState();
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  window.visualViewport?.addEventListener("resize", schedule, { passive: true });

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  observer?.observe(document.documentElement);

  return () => {
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    observer?.disconnect();
    if (frame) {
      if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(frame);
      else window.clearTimeout(frame);
    }
  };
}
