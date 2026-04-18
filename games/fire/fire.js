import { mountTouchControls } from "../../shared/controls.js";
import { createAudioEngine } from "../../shared/audio.js";
import { getActionFromKey, createKeyboardController } from "../../shared/input.js";
import { attachResponsiveLayout } from "../../shared/layout.js";
import { createStorageNamespace } from "../../shared/storage.js";
import {
  FIRE_RULESET,
  createInitialFireState,
  getTickDurationMs,
  reduceFireState,
} from "./fire-engine.js";

const canvas = document.querySelector("#fire-screen");
const cabinet = document.querySelector("#cabinet");
const context = canvas.getContext("2d");
const scoreValue = document.querySelector("#score-value");
const bestValue = document.querySelector("#best-value");
const missValue = document.querySelector("#miss-value");
const modeValue = document.querySelector("#mode-value");
const statusMessage = document.querySelector("#status-message");
const startAButton = document.querySelector("#start-a");
const startBButton = document.querySelector("#start-b");
const pauseButton = document.querySelector("#pause-button");
const skinButton = document.querySelector("#skin-button");
const soundButton = document.querySelector("#sound-button");
const touchControls = document.querySelector("#touch-controls");

const storage = createStorageNamespace("game-n-watch");
const audio = createAudioEngine();

let soundEnabled = storage.get("sound-enabled", true);
let skinMode = storage.get("fire-skin", "silver");
let state = createInitialFireState(storage.get("fire-best-score", 0));
let lastFrame = performance.now();
let tickAccumulator = 0;

const DISPLAY_POINTS = [
  { x: 220, y: 310 },
  { x: 390, y: 350 },
  { x: 580, y: 320 },
  { x: 760, y: 270 },
];

function setStatus(message) {
  statusMessage.innerHTML = message;
}

function persistBestScore(nextState) {
  if (nextState.bestScore !== state.bestScore) {
    storage.set("fire-best-score", nextState.bestScore);
  }
}

async function playEvents(events) {
  if (!soundEnabled) {
    return;
  }

  for (const eventName of events) {
    await audio.playCue(eventName);
  }
}

function updateHud() {
  scoreValue.textContent = String(state.score);
  bestValue.textContent = String(state.bestScore);
  missValue.textContent = `${state.misses} / ${FIRE_RULESET.maxMisses}`;
  modeValue.textContent = state.mode ? `Game ${state.mode}` : "Ready";

  if (state.status === "idle") {
    setStatus(
      "Press <strong>1</strong> for Game A, <strong>2</strong> for Game B, or use the buttons below.",
    );
    return;
  }

  if (state.status === "paused") {
    setStatus("Paused. Press <strong>space</strong> or tap Pause to resume.");
    return;
  }

  if (state.status === "gameover") {
    setStatus(
      `<span class="status-danger">Game over.</span> Score ${state.score}. Start Game A or Game B to try again.`,
    );
    return;
  }

  setStatus(
    `Use arrow keys or A/D to move the trampoline across ${FIRE_RULESET.trampolinePositions} positions.`,
  );
}

function dispatch(action) {
  const result = reduceFireState(state, action);
  persistBestScore(result.state);
  state = result.state;
  updateHud();
  void playEvents(result.events);
}

function startGame(mode) {
  void audio.resume();
  dispatch({ type: "START_GAME", mode });
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  storage.set("sound-enabled", soundEnabled);
  soundButton.textContent = `Sound: ${soundEnabled ? "On" : "Off"}`;
  if (soundEnabled) {
    void audio.resume();
  }
}

function toggleSkin() {
  skinMode = skinMode === "silver" ? "wide" : "silver";
  storage.set("fire-skin", skinMode);
  skinButton.textContent = `Skin: ${skinMode === "silver" ? "Silver" : "Wide"}`;
  setStatus(
    `Using the <strong>${skinMode === "silver" ? "Silver" : "Wide"}</strong> visual skin with Silver gameplay rules.`,
  );
}

function handleAction(action) {
  switch (action) {
    case "move-left":
      dispatch({ type: "MOVE_LEFT" });
      break;
    case "move-right":
      dispatch({ type: "MOVE_RIGHT" });
      break;
    case "start-a":
      startGame("A");
      break;
    case "start-b":
      startGame("B");
      break;
    case "pause-toggle":
      dispatch({ type: "PAUSE_TOGGLE" });
      break;
    case "sound-toggle":
      toggleSound();
      break;
    default:
      break;
  }
}

function drawStickFigure(x, y) {
  context.beginPath();
  context.arc(x, y - 12, 10, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(x, y - 2);
  context.lineTo(x, y + 20);
  context.moveTo(x, y + 4);
  context.lineTo(x - 12, y + 12);
  context.moveTo(x, y + 4);
  context.lineTo(x + 12, y + 12);
  context.moveTo(x, y + 20);
  context.lineTo(x - 10, y + 36);
  context.moveTo(x, y + 20);
  context.lineTo(x + 10, y + 36);
  context.stroke();
}

function drawBackground() {
  const palette = skinMode === "silver"
    ? {
        lcd: "#dce5b2",
        building: "#2d3624",
        accent: "#a84b37",
        line: "#6b7a53",
        vehicle: "#2d3624",
      }
    : {
        lcd: "#e9df9b",
        building: "#304254",
        accent: "#d35b3c",
        line: "#7b8f5b",
        vehicle: "#304254",
      };

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = palette.lcd;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = palette.building;
  context.fillRect(70, 110, 150, 250);
  context.fillRect(120, 84, 70, 26);

  context.fillStyle = palette.accent;
  context.fillRect(94, 135, 16, 40);
  context.fillRect(132, 124, 16, 52);
  context.fillRect(172, 145, 16, 36);

  context.fillStyle = palette.vehicle;
  context.fillRect(785, 335, 120, 72);
  context.fillRect(870, 320, 30, 38);

  context.strokeStyle = palette.line;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(100, 420);
  context.lineTo(865, 420);
  context.stroke();

  context.fillStyle = "#4f6141";
  for (let index = 0; index < DISPLAY_POINTS.length; index += 1) {
    const point = DISPLAY_POINTS[index];
    context.fillRect(point.x - 2, point.y + 22, 4, 70);
  }
}

function drawTrampoline() {
  const point = DISPLAY_POINTS[state.netPosition];
  context.strokeStyle = "#243022";
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(point.x - 48, point.y + 28);
  context.lineTo(point.x + 48, point.y + 28);
  context.stroke();

  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(point.x - 48, point.y + 28);
  context.lineTo(point.x - 24, point.y + 68);
  context.moveTo(point.x + 48, point.y + 28);
  context.lineTo(point.x + 24, point.y + 68);
  context.stroke();
}

function drawJumpers() {
  context.fillStyle = "#243022";
  context.strokeStyle = "#243022";
  for (const jumper of state.jumpers) {
    const point = DISPLAY_POINTS[jumper.stage];
    drawStickFigure(point.x, point.y);
  }
}

function drawMisses() {
  context.fillStyle = "#9c4b43";
  for (let index = 0; index < state.misses; index += 1) {
    const x = 120 + index * 44;
    context.beginPath();
    context.arc(x, 72, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#243022";
    context.fillRect(x - 2, 86, 4, 18);
    context.fillStyle = "#9c4b43";
  }
}

function drawOverlay() {
  if (state.status === "running") {
    return;
  }

  context.fillStyle = "rgba(24, 31, 19, 0.12)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#243022";
  context.font = "700 30px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("FIRE", canvas.width / 2, 120);
  context.font = "500 22px Inter, system-ui, sans-serif";

  const message = state.status === "gameover"
    ? "Three misses. Start a new game."
    : state.status === "paused"
      ? "Paused"
      : "Press Game A or Game B";

  context.fillText(message, canvas.width / 2, 165);
  context.font = "500 18px Inter, system-ui, sans-serif";
  context.fillText("Keyboard: A/D or arrow keys", canvas.width / 2, 205);
  context.fillText("Touch: use the on-screen controls", canvas.width / 2, 235);
}

function render() {
  drawBackground();
  drawTrampoline();
  drawJumpers();
  drawMisses();
  drawOverlay();
}

function frame(now) {
  const delta = now - lastFrame;
  lastFrame = now;

  if (state.status === "running") {
    tickAccumulator += delta;
    while (tickAccumulator >= getTickDurationMs(state)) {
      tickAccumulator -= getTickDurationMs(state);
      dispatch({ type: "TICK" });
    }
  }

  render();
  requestAnimationFrame(frame);
}

soundButton.textContent = `Sound: ${soundEnabled ? "On" : "Off"}`;
skinButton.textContent = `Skin: ${skinMode === "silver" ? "Silver" : "Wide"}`;
startAButton.addEventListener("click", () => startGame("A"));
startBButton.addEventListener("click", () => startGame("B"));
pauseButton.addEventListener("click", () => dispatch({ type: "PAUSE_TOGGLE" }));
skinButton.addEventListener("click", toggleSkin);
soundButton.addEventListener("click", toggleSound);

mountTouchControls(touchControls, {
  onLeft: () => handleAction("move-left"),
  onRight: () => handleAction("move-right"),
  onStartA: () => startGame("A"),
  onStartB: () => startGame("B"),
  onPause: () => handleAction("pause-toggle"),
  onSound: toggleSound,
});

attachResponsiveLayout(cabinet);
createKeyboardController(window, handleAction);

window.addEventListener("keydown", (event) => {
  if (getActionFromKey(event.key)) {
    void audio.resume();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

updateHud();
render();
requestAnimationFrame(frame);
