export function applyOrientationAttribute(root, width, height) {
  const orientation = width >= height ? "landscape" : "portrait";
  root.dataset.orientation = orientation;
  return orientation;
}

export function attachResponsiveLayout(root, source = window) {
  const refresh = () => applyOrientationAttribute(root, source.innerWidth, source.innerHeight);
  refresh();
  source.addEventListener("resize", refresh);
  return () => source.removeEventListener("resize", refresh);
}
