// Attach a press-and-hold auto-repeat to a button element.
// Fires once immediately, then repeats at `repeatMs` after `delayMs`.
export function attachHoldAction(button, action, delayMs = 250, repeatMs = 80) {
  let holdTimer = null;
  let repeatTimer = null;

  function start(event) {
    event.preventDefault();
    action();
    holdTimer = setTimeout(() => {
      repeatTimer = setInterval(action, repeatMs);
    }, delayMs);
  }

  function stop() {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
    holdTimer = null;
    repeatTimer = null;
  }

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointerleave", stop);
  button.addEventListener("pointercancel", stop);
}

export function mountTouchControls(container, handlers) {
  container.innerHTML = "";

  const controls = [
    { label: "Left", action: handlers.onLeft, hold: true },
    { label: "Right", action: handlers.onRight, hold: true },
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
    if (control.hold) {
      attachHoldAction(button, control.action);
    } else {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        control.action();
      });
    }
    container.append(button);
  }
}
