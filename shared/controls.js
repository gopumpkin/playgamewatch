export function mountTouchControls(container, handlers) {
  container.innerHTML = "";

  const controls = [
    { label: "Left", action: handlers.onLeft },
    { label: "Right", action: handlers.onRight },
    { label: "Game A", action: handlers.onStartA, className: "touch-controls__wide" },
    { label: "Game B", action: handlers.onStartB, className: "touch-controls__wide" },
    { label: "Pause", action: handlers.onPause },
    { label: "Sound", action: handlers.onSound },
  ];

  for (const control of controls) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = control.label;
    if (control.className) {
      button.classList.add(control.className);
    }
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      control.action();
    });
    container.append(button);
  }
}
