import { mountTouchControls } from "../../shared/controls.js";
import { createAudioEngine } from "../../shared/audio.js";
import { getActionFromKey, createKeyboardController } from "../../shared/input.js";
import { attachResponsiveLayout } from "../../shared/layout.js";
import { createStorageNamespace } from "../../shared/storage.js";
import {
  FIRE_PATHS,
  FIRE_RULESET,
  FIRE_PLAYER_POSITIONS,
  createInitialFireState,
  getTickDurationMs,
  getDifficultyTier,
  getJumperSegment,
  reduceFireState,
} from "./fire-engine.js";

const canvas = document.querySelector("#fire-screen");
const cabinet = document.querySelector("#cabinet");
const context = canvas.getContext("2d");
const scoreValue = document.querySelector("#score-value");
const bestValue = document.querySelector("#best-value");
const hudLives = [
  document.querySelector("#hud-life-0"),
  document.querySelector("#hud-life-1"),
  document.querySelector("#hud-life-2"),
];
const modeValue = document.querySelector("#mode-value");
const statusMessage = document.querySelector("#status-message");
const startAButton = document.querySelector("#start-a");
const startBButton = document.querySelector("#start-b");
const pauseButton = document.querySelector("#pause-button");
const skinButton = document.querySelector("#skin-button");
const soundButton = document.querySelector("#sound-button");
const touchControls = document.querySelector("#touch-controls");
const moveLeftButton = document.querySelector("#move-left-button");
const moveRightButton = document.querySelector("#move-right-button");
const mobileLeft = document.querySelector("#mobile-left");
const mobileRight = document.querySelector("#mobile-right");
const mobileStartA = document.querySelector("#mobile-start-a");
const mobileStartB = document.querySelector("#mobile-start-b");
const mobilePause = document.querySelector("#mobile-pause");
const mobileSound = document.querySelector("#mobile-sound");

const storage = createStorageNamespace("game-n-watch");
const audio = createAudioEngine();

let soundEnabled = storage.get("sound-enabled", true);
let skinMode = storage.get("fire-skin", "wide");
let state = createInitialFireState(storage.get("fire-best-score", 0));
let lastFrame = performance.now();
let tickAccumulator = 0;

// Renderer state — not part of game state
let fireTick = 0;
let catchFlashFrames = 0;
let missFlashFrames = 0;
let scorePopups = [];   // [{x, y, alpha}]
let smokeParticles = []; // [{x, y, r, alpha, vy, vx}]

const GROUND_Y = 452;
const NET_TOP_Y = 392;

const LCD_PALETTES = {
  silver: {
    lcd: "#dde5b7",
    segment: "#2a3222",
    ghost: "rgba(42, 50, 34, 0.12)",
    structure: "#47553d",
    accent: "#a14d33",
    highlight: "#f0b24d",
    ground: "#c4c89a",
    fire: "#c84022",
    beacon: "#f0b24d",
    cross: "#bb2222",
  },
  wide: {
    lcd: "#eadf9e",
    segment: "#28352a",
    ghost: "rgba(40, 53, 42, 0.11)",
    structure: "#59684e",
    accent: "#c85a39",
    highlight: "#f0b24d",
    ground: "#d0ca82",
    fire: "#cc3a1e",
    beacon: "#f5c842",
    cross: "#cc2222",
  },
};

const FIRE_LCD_POSES = {
  // In upper window: standing, arms forward, about to jump
  "window-high": {
    head: [0, -30, 10],
    lines: [
      [0, -20, 0, -4],
      [0, -14, -14, -6], [-14, -6, -12, 6],
      [0, -14, 14, -4],  [14, -4, 16, 8],
      [0, -4, -6, 10],   [-6, 10, -4, 22],
      [0, -4, 6, 10],    [6, 10, 4, 22],
    ],
  },
  // In lower window: crouching forward
  "window-low": {
    head: [0, -26, 10],
    lines: [
      [0, -16, 2, -2],
      [2, -10, -12, -2], [-12, -2, -14, 8],
      [2, -10, 14, -2],  [14, -2, 16, 8],
      [2, -2, -4, 12],   [-4, 12, -2, 24],
      [2, -2, 8, 12],    [8, 12, 6, 24],
    ],
  },
  // Tumbling from upper window toward first net
  "fall-left": {
    head: [-10, -20, 10],
    lines: [
      [-6, -10, 6, 8],
      [0, -2, -16, -14], [-16, -14, -20, -4],
      [0, -2, 14, -14],  [14, -14, 20, -4],
      [6, 8, 0, 24],     [0, 24, -10, 32],
      [6, 8, 16, 20],    [16, 20, 22, 32],
    ],
  },
  // Tumbling from lower window toward first net
  "fall-left-low": {
    head: [-8, -18, 10],
    lines: [
      [-4, -8, 8, 10],
      [2, 0, -14, -12], [-14, -12, -18, -2],
      [2, 0, 16, -10],  [16, -10, 22, 0],
      [8, 10, 2, 26],   [2, 26, -8, 34],
      [8, 10, 18, 22],  [18, 22, 22, 34],
    ],
  },
  // Catching on first net, arms up for balance
  "bounce-left": {
    head: [0, -24, 10],
    lines: [
      [0, -14, 0, -2],
      [0, -10, -14, -22], [-14, -22, -18, -12],
      [0, -10, 14, -22],  [14, -22, 18, -12],
      [0, -2, -10, 10],  [-10, 10, -6, 22],
      [0, -2, 10, 10],   [10, 10, 6, 22],
    ],
  },
  // Catching on first net (lower path)
  "bounce-left-low": {
    head: [0, -22, 10],
    lines: [
      [0, -12, 0, 0],
      [0, -8, -12, -18], [-12, -18, -16, -8],
      [0, -8, 12, -16],  [12, -16, 16, -6],
      [0, 0, -10, 12],   [-10, 12, -6, 24],
      [0, 0, 10, 12],    [10, 12, 6, 24],
    ],
  },
  // Rising in arc from first to second net
  "rise-mid": {
    head: [8, -26, 10],
    lines: [
      [4, -16, -4, 4],
      [-4, -8, -18, -2], [-18, -2, -20, 8],
      [-4, -8, 10, -18], [10, -18, 14, -8],
      [-4, 4, -12, 18],  [-12, 18, -10, 30],
      [-4, 4, 6, 16],    [6, 16, 10, 28],
    ],
  },
  // Rising from first to second net (lower path)
  "rise-mid-low": {
    head: [6, -24, 10],
    lines: [
      [2, -14, -4, 4],
      [-4, -8, -16, -2], [-16, -2, -18, 8],
      [-4, -8, 10, -16], [10, -16, 14, -6],
      [-4, 4, -12, 18],  [-12, 18, -10, 30],
      [-4, 4, 6, 16],    [6, 16, 10, 28],
    ],
  },
  // Catching on second net
  "bounce-mid": {
    head: [0, -24, 10],
    lines: [
      [0, -14, -2, -2],
      [-2, -10, -14, -22], [-14, -22, -18, -12],
      [-2, -10, 12, -20],  [12, -20, 16, -10],
      [-2, -2, -10, 10],   [-10, 10, -6, 22],
      [-2, -2, 8, 10],     [8, 10, 4, 22],
    ],
  },
  // Catching on second net (lower path)
  "bounce-mid-low": {
    head: [0, -22, 10],
    lines: [
      [0, -12, -2, 0],
      [-2, -8, -12, -20], [-12, -20, -16, -10],
      [-2, -8, 10, -18],  [10, -18, 14, -8],
      [-2, 0, -10, 12],   [-10, 12, -6, 24],
      [-2, 0, 8, 12],     [8, 12, 4, 24],
    ],
  },
  // Rising from second to third net
  "rise-right": {
    head: [10, -24, 10],
    lines: [
      [6, -14, -4, 4],
      [-4, -8, -18, -4], [-18, -4, -20, 6],
      [-4, -8, 8, -18],  [8, -18, 12, -8],
      [-4, 4, -12, 18],  [-12, 18, -10, 30],
      [-4, 4, 6, 14],    [6, 14, 8, 26],
    ],
  },
  // Rising from second to third net (lower path)
  "rise-right-low": {
    head: [8, -22, 10],
    lines: [
      [4, -12, -4, 4],
      [-4, -6, -16, -2], [-16, -2, -18, 8],
      [-4, -6, 8, -16],  [8, -16, 12, -6],
      [-4, 4, -12, 18],  [-12, 18, -10, 30],
      [-4, 4, 6, 14],    [6, 14, 8, 26],
    ],
  },
  // Catching on third net
  "bounce-right": {
    head: [0, -24, 10],
    lines: [
      [2, -14, 2, -2],
      [2, -10, -12, -22], [-12, -22, -16, -12],
      [2, -10, 14, -20],  [14, -20, 18, -10],
      [2, -2, -8, 10],    [-8, 10, -4, 22],
      [2, -2, 10, 10],    [10, 10, 6, 22],
    ],
  },
  // Catching on third net (lower path)
  "bounce-right-low": {
    head: [0, -22, 10],
    lines: [
      [2, -12, 2, 0],
      [2, -8, -10, -20], [-10, -20, -14, -10],
      [2, -8, 12, -18],  [12, -18, 16, -8],
      [2, 0, -8, 12],    [-8, 12, -4, 24],
      [2, 0, 10, 12],    [10, 12, 6, 24],
    ],
  },
  // Saved person in ambulance, waving
  ambulance: {
    head: [0, -16, 8],
    lines: [
      [0, -8, 0, 6],
      [0, 0, -10, -10], [-10, -10, -14, -4],
      [0, 0, 10, -4],   [10, -4, 12, 6],
      [0, 6, -8, 14],   [-8, 14, -10, 22],
      [0, 6, 10, 14],   [10, 14, 14, 22],
    ],
  },
};

function persistBestScore(nextState) {
  if (nextState.bestScore !== state.bestScore) {
    storage.set("fire-best-score", nextState.bestScore);
  }
}

function playEvents(events) {
  if (!soundEnabled) {
    return;
  }

  for (const eventName of events) {
    audio.playCue(eventName);
  }
}

function updateHud() {
  scoreValue.textContent = String(state.score);
  bestValue.textContent = String(state.bestScore);
  modeValue.textContent = state.mode ? `Game ${state.mode}` : "Ready";

  hudLives.forEach((el, i) => {
    el.dataset.lost = i < state.misses ? "true" : "false";
  });

  if (state.status === "idle") {
    statusMessage.textContent =
      "Press 1 for Game A, 2 for Game B, or use the buttons below.";
    return;
  }

  if (state.status === "paused") {
    statusMessage.textContent = "Paused. Press space or tap Pause to resume.";
    return;
  }

  if (state.status === "gameover") {
    statusMessage.textContent = `Game over. Score ${state.score}. Start Game A or Game B to try again.`;
    return;
  }

  statusMessage.textContent =
    `Use arrow keys or A/D to move across ${FIRE_RULESET.trampolinePositions} rescue positions and catch every bounce.`;
}

function dispatch(action) {
  const result = reduceFireState(state, action);
  persistBestScore(result.state);
  state = result.state;
  updateHud();
  void playEvents(result.events);
  if (result.events.includes("bounce") || result.events.includes("save")) {
    catchFlashFrames = 8;
    // Score pop-up above the net position where the catch happened
    const pt = FIRE_PLAYER_POSITIONS[result.state.netPosition];
    if (pt) spawnScorePopup(pt.x, NET_TOP_Y - 24);
  }
  if (result.events.includes("miss") || result.events.includes("gameover")) {
    missFlashFrames = 12;
  }
}

function startGame(mode) {
  dispatch({ type: "START_GAME", mode });
}

function applySoundUI() {
  soundButton.textContent = soundEnabled ? "🔊 Sound" : "🔇 Sound";
  mobileSound.textContent = soundEnabled ? "🔊" : "🔇";
  soundButton.classList.toggle("sound--off", !soundEnabled);
  mobileSound.classList.toggle("sound--off", !soundEnabled);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  storage.set("sound-enabled", soundEnabled);
  applySoundUI();
}

function toggleSkin() {
  skinMode = skinMode === "silver" ? "wide" : "silver";
  storage.set("fire-skin", skinMode);
  skinButton.textContent = `Skin: ${skinMode === "silver" ? "Silver" : "Wide"}`;
}

function handleAction(action) {
  audio.resume();
  switch (action) {
    case "move-left":
      dispatch({ type: "MOVE_LEFT" });
      break;
    case "move-right":
      dispatch({ type: "MOVE_RIGHT" });
      break;
    case "start-a":
      audio.resume(); startGame("A");
      break;
    case "start-b":
      audio.resume(); startGame("B");
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

function getPalette() {
  return LCD_PALETTES[skinMode] ?? LCD_PALETTES.wide;
}

function drawSegmentPose(x, y, poseName, color, scale = 1) {
  const pose = FIRE_LCD_POSES[poseName];
  if (!pose) {
    return;
  }

  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();
  context.arc(pose.head[0], pose.head[1], pose.head[2], 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  for (const line of pose.lines) {
    context.moveTo(line[0], line[1]);
    context.lineTo(line[2], line[3]);
  }
  context.stroke();
  context.restore();
}

function drawFigureGhosts(color) {
  const seen = new Set();

  for (const path of FIRE_PATHS) {
    for (const segment of path) {
      const key = `${segment.pose}:${segment.x}:${segment.y}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      drawSegmentPose(segment.x, segment.y, segment.pose, color);
    }
  }
}

function drawWindow(x, y, w, h, palette) {
  context.fillStyle = palette.lcd;
  context.globalAlpha = 0.18;
  context.fillRect(x, y, w, h);
  context.globalAlpha = 0.3;
  context.strokeStyle = palette.lcd;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x + w / 2, y + w / 2, w / 2 - 2, Math.PI, 0);
  context.stroke();
  context.globalAlpha = 1;
}

function drawWindowLit(x, y, w, h, phase, palette) {
  const flicker = 0.55 + Math.sin(fireTick * 0.11 + phase) * 0.25;
  context.globalAlpha = 0.28;
  context.fillStyle = palette.lcd;
  context.fillRect(x, y, w, h);
  context.globalAlpha = flicker * 0.55;
  context.fillStyle = palette.fire;
  context.fillRect(x, y, w, h);
  context.globalAlpha = 0.35;
  context.strokeStyle = palette.structure;
  context.lineWidth = 4;
  context.beginPath();
  context.arc(x + w / 2, y + 22, w / 2 - 2, Math.PI, 0);
  context.stroke();
  context.globalAlpha = 1;
}

function drawBuilding(palette) {
  const BX1 = 28, BX2 = 220, BY1 = 56;

  // Fire glow at building base (animated)
  const glowPulse = 0.5 + Math.sin(fireTick * 0.07) * 0.22;
  const fireGrad = context.createRadialGradient(124, GROUND_Y - 40, 10, 124, GROUND_Y - 40, 180);
  fireGrad.addColorStop(0, `rgba(200, 70, 20, ${glowPulse})`);
  fireGrad.addColorStop(1, "rgba(200, 70, 20, 0)");
  context.fillStyle = fireGrad;
  context.fillRect(BX1, 240, BX2 - BX1, GROUND_Y - 240);

  // Main building body
  context.fillStyle = palette.structure;
  context.fillRect(BX1, BY1, BX2 - BX1, GROUND_Y - BY1);

  // Rooftop parapet merlons
  context.fillStyle = palette.structure;
  for (let x = BX1 - 4; x < BX2 + 4; x += 22) {
    context.fillRect(x, BY1 - 20, 14, 22);
  }

  // Subtle brick texture (horizontal mortar lines)
  context.strokeStyle = palette.lcd;
  context.lineWidth = 1;
  context.globalAlpha = 0.1;
  for (let y = BY1 + 24; y < GROUND_Y; y += 18) {
    context.beginPath();
    context.moveTo(BX1, y);
    context.lineTo(BX2, y);
    context.stroke();
  }
  context.globalAlpha = 1;

  // Floor ledges
  context.fillStyle = palette.lcd;
  context.globalAlpha = 0.22;
  context.fillRect(BX1 - 5, 158, BX2 - BX1 + 10, 6);
  context.fillRect(BX1 - 5, 230, BX2 - BX1 + 10, 6);
  context.globalAlpha = 1;

  // Left column windows (decorative)
  drawWindow(62, 90, 52, 62, palette);
  drawWindow(62, 164, 52, 62, palette);

  // Right column windows (jump windows — lit with fire glow)
  drawWindowLit(148, 90, 66, 62, 0, palette);    // window-high: y=142 is inside this range
  drawWindowLit(148, 164, 66, 62, 1.4, palette);  // window-low: y=198 is inside this range

  // Animated fire tongues at ground floor
  const fireFlicker = 0.7 + Math.sin(fireTick * 0.13 + 0.5) * 0.22;
  context.fillStyle = palette.fire;
  context.globalAlpha = fireFlicker;
  const firePoints = [40, 65, 90, 116, 142, 168, 194];
  for (const fx of firePoints) {
    const height = 40 + Math.sin(fireTick * 0.09 + fx * 0.4) * 18;
    context.beginPath();
    context.moveTo(fx - 12, GROUND_Y);
    context.quadraticCurveTo(fx, GROUND_Y - height - 16, fx + 12, GROUND_Y);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawAmbulance(palette) {
  const AX1 = 774, AX2 = 958;
  const AY1 = 348, AY2 = 418;
  const CAB_X = 896;

  // Shadow
  context.fillStyle = palette.segment;
  context.globalAlpha = 0.12;
  context.beginPath();
  context.ellipse(866, AY2 + 28, 88, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  // Cargo body
  context.fillStyle = palette.structure;
  context.fillRect(AX1, AY1, CAB_X - AX1, AY2 - AY1);

  // Cab
  context.fillRect(CAB_X, AY1 + 14, AX2 - CAB_X, AY2 - AY1 - 14);

  // White stripe along cargo side
  context.fillStyle = palette.lcd;
  context.globalAlpha = 0.3;
  context.fillRect(AX1, AY1 + 16, CAB_X - AX1, 14);
  context.globalAlpha = 1;

  // Red cross on cargo (centered at x≈855)
  const cxCross = AX1 + 80, cyCross = (AY1 + AY2) / 2;
  context.fillStyle = palette.cross;
  context.fillRect(cxCross - 8, cyCross - 22, 16, 44);
  context.fillRect(cxCross - 22, cyCross - 8, 44, 16);

  // Cab windshield
  context.fillStyle = palette.lcd;
  context.globalAlpha = 0.45;
  context.fillRect(CAB_X + 5, AY1 + 20, AX2 - CAB_X - 8, 34);
  context.globalAlpha = 1;

  // Rear entry door line
  context.strokeStyle = palette.lcd;
  context.lineWidth = 3;
  context.globalAlpha = 0.35;
  context.beginPath();
  context.moveTo(AX1 + 18, AY1 + 4);
  context.lineTo(AX1 + 18, AY2 - 4);
  context.stroke();
  context.globalAlpha = 1;

  // Beacon light on cab roof
  const beaconOn = state.ambulanceFlash > 0;
  context.fillStyle = beaconOn ? palette.beacon : palette.structure;
  context.fillRect(CAB_X + 8, AY1 - 18, AX2 - CAB_X - 16, 20);
  if (beaconOn) {
    context.globalAlpha = 0.28;
    const gx = CAB_X + (AX2 - CAB_X) / 2;
    const beaconGrad = context.createRadialGradient(gx, AY1 - 8, 4, gx, AY1 - 8, 40);
    beaconGrad.addColorStop(0, palette.beacon);
    beaconGrad.addColorStop(1, "rgba(240, 200, 0, 0)");
    context.fillStyle = beaconGrad;
    context.fillRect(CAB_X - 20, AY1 - 50, AX2 - CAB_X + 40, 55);
    context.globalAlpha = 1;
  }

  // Wheels
  context.fillStyle = palette.segment;
  context.beginPath();
  context.arc(816, AY2 + 8, 22, 0, Math.PI * 2);
  context.arc(930, AY2 + 8, 22, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = palette.lcd;
  context.globalAlpha = 0.38;
  context.beginPath();
  context.arc(816, AY2 + 8, 9, 0, Math.PI * 2);
  context.arc(930, AY2 + 8, 9, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function drawFiremanNet(point, color, active = false) {
  const cx = point.x;
  const HALF_W = 58;
  const leftX = cx - HALF_W;
  const rightX = cx + HALF_W;
  const LFX = cx - HALF_W - 14; // left fireman center x
  const RFX = cx + HALF_W + 14; // right fireman center x
  const headR = 7;
  const headY = GROUND_Y - 56;
  const shoulderY = headY + 14;
  const hipY = headY + 30;

  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const [fx, isLeft] of [[LFX, true], [RFX, false]]) {
    // Head
    context.lineWidth = 0;
    context.beginPath();
    context.arc(fx, headY, headR, 0, Math.PI * 2);
    context.fill();

    context.lineWidth = active ? 4 : 3;

    // Torso
    context.beginPath();
    context.moveTo(fx, headY + headR);
    context.lineTo(fx, hipY);
    context.stroke();

    // Arm toward net (raised, holding net)
    const handX = isLeft ? leftX : rightX;
    const elbowX = fx + (isLeft ? 14 : -14);
    context.beginPath();
    context.moveTo(fx, shoulderY);
    context.lineTo(elbowX, shoulderY - 6);
    context.lineTo(handX, NET_TOP_Y);
    context.stroke();

    // Other arm (at side)
    const sideDir = isLeft ? -1 : 1;
    context.beginPath();
    context.moveTo(fx, shoulderY);
    context.lineTo(fx + sideDir * 12, shoulderY + 10);
    context.lineTo(fx + sideDir * 18, shoulderY + 20);
    context.stroke();

    // Legs
    context.beginPath();
    context.moveTo(fx, hipY);
    context.lineTo(fx - 5, GROUND_Y - 12);
    context.lineTo(fx - 4, GROUND_Y);
    context.moveTo(fx, hipY);
    context.lineTo(fx + 5, GROUND_Y - 12);
    context.lineTo(fx + 4, GROUND_Y);
    context.stroke();
  }

  // Net outline: sides from fireman hands to feet level, top arc
  context.lineWidth = active ? 5 : 3;
  context.beginPath();
  context.moveTo(LFX + 4, GROUND_Y);
  context.lineTo(leftX, NET_TOP_Y);
  context.bezierCurveTo(leftX + 22, NET_TOP_Y + 16, rightX - 22, NET_TOP_Y + 16, rightX, NET_TOP_Y);
  context.lineTo(RFX - 4, GROUND_Y);
  context.stroke();

  // Net mesh vertical lines
  context.lineWidth = active ? 3 : 2;
  const meshCount = 5;
  for (let i = 1; i < meshCount; i++) {
    const t = i / meshCount;
    const topX = leftX + (rightX - leftX) * t;
    const topY = NET_TOP_Y + 16 * Math.sin(t * Math.PI);
    const botX = (LFX + 4) + ((RFX - 4) - (LFX + 4)) * t;
    context.beginPath();
    context.moveTo(topX, topY);
    context.lineTo(botX, GROUND_Y);
    context.stroke();
  }

  context.restore();
}

// Easing helpers for natural-feeling jumper movement
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function getRenderedJumperPoint(jumper) {
  const currentSegment = getJumperSegment(jumper);
  if (!currentSegment) return currentSegment;

  if (state.status !== "running" || (state.beatPhase !== 1 && state.beatPhase !== 2)) {
    return currentSegment;
  }

  if (jumper.beat !== state.beatPhase) {
    return currentSegment;
  }

  const nextSegment = FIRE_PATHS[jumper.pathIndex][jumper.segmentIndex + 1];
  if (!nextSegment) return currentSegment;

  const rawProgress = Math.min(1, tickAccumulator / getTickDurationMs(state));
  // Smooth easing makes arcs feel physical rather than mechanical
  const t = smoothstep(rawProgress);

  const x = currentSegment.x + (nextSegment.x - currentSegment.x) * t;
  const y = currentSegment.y + (nextSegment.y - currentSegment.y) * t;

  // Add perpendicular arc: jump/bounce transitions get a natural parabolic lift
  // sin(t*PI) peaks at 0.5; amplitude depends on transition direction
  const dy = nextSegment.y - currentSegment.y;
  const dx = Math.abs(nextSegment.x - currentSegment.x);
  const isRising = dy < -30;      // significantly upward = bounce arc
  const isFalling = dy > 30;      // significantly downward = fall arc
  let arcY = 0;
  if (isRising) arcY = -Math.min(dx * 0.28, 50) * Math.sin(rawProgress * Math.PI);
  else if (isFalling) arcY = Math.min(dx * 0.12, 20) * Math.sin(rawProgress * Math.PI);

  return { x, y: y + arcY, rawProgress };
}
}

function drawBackground() {
  const palette = getPalette();

  // Sky fill
  context.fillStyle = palette.lcd;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Pavement / ground
  context.fillStyle = palette.ground;
  context.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);

  // Ground center dashes
  context.strokeStyle = palette.lcd;
  context.lineWidth = 4;
  context.setLineDash([28, 20]);
  context.beginPath();
  context.moveTo(230, GROUND_Y + 22);
  context.lineTo(770, GROUND_Y + 22);
  context.stroke();
  context.setLineDash([]);

  // Ground edge line
  context.strokeStyle = palette.structure;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(0, GROUND_Y);
  context.lineTo(canvas.width, GROUND_Y);
  context.stroke();

  drawBuilding(palette);
  drawAmbulance(palette);
}

function drawTrampoline() {
  const point = FIRE_PLAYER_POSITIONS[state.netPosition];
  drawFiremanNet(point, getPalette().segment, true);
}

function drawJumpers() {
  const palette = getPalette();
  for (const jumper of state.jumpers) {
    const point = getRenderedJumperPoint(jumper);
    if (!point) continue;
    const segment = getJumperSegment(jumper);
    // Squash & stretch: slightly taller at arc peak, squashed on landing
    const rawP = point.rawProgress ?? 0;
    const stretch = 1 + 0.14 * Math.sin(rawP * Math.PI);
    drawSegmentPose(point.x, point.y, segment.pose, palette.segment, stretch);
  }
}

function drawHeart(cx, cy, size, color, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.arc(cx - size * 0.5, cy - size * 0.1, size * 0.5, Math.PI, 0);
  context.arc(cx + size * 0.5, cy - size * 0.1, size * 0.5, Math.PI, 0);
  context.lineTo(cx, cy + size * 0.85);
  context.closePath();
  context.fill();
  context.restore();
}

// --- Smoke particles emitted from burning building windows ---
function updateSmoke() {
  // Advance existing particles
  for (const p of smokeParticles) {
    p.y -= p.vy;
    p.x += p.vx;
    p.r += 0.35;
    p.alpha *= 0.955;
  }
  smokeParticles = smokeParticles.filter(p => p.alpha > 0.02);

  // Emit new puffs from building windows (only when game is active)
  if (state.status === "running" && fireTick % 6 === 0 && smokeParticles.length < 28) {
    // Approximate window positions on the building (x~185, alternating y)
    const wy = Math.random() < 0.5 ? 130 : 200;
    smokeParticles.push({
      x: 188 + (Math.random() - 0.5) * 28,
      y: wy,
      r: 7 + Math.random() * 7,
      alpha: 0.38,
      vy: 0.7 + Math.random() * 0.9,
      vx: (Math.random() - 0.5) * 0.5,
    });
  }
}

function drawSmoke() {
  const palette = getPalette();
  for (const p of smokeParticles) {
    context.beginPath();
    context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    context.fillStyle = palette.structure;
    context.globalAlpha = p.alpha;
    context.fill();
  }
  context.globalAlpha = 1;
}

// --- Score pop-up "+1" floating text ---
function spawnScorePopup(x, y) {
  scorePopups.push({ x, y, alpha: 1.0 });
}

function drawScorePopups() {
  if (scorePopups.length === 0) return;
  const palette = getPalette();
  context.font = "bold 24px monospace";
  context.textAlign = "center";
  for (const p of scorePopups) {
    context.globalAlpha = p.alpha;
    context.fillStyle = palette.accent;
    context.fillText("+1", p.x, p.y);
    p.y -= 1.8;
    p.alpha -= 0.028;
  }
  scorePopups = scorePopups.filter(p => p.alpha > 0);
  context.globalAlpha = 1;
  context.textAlign = "left";
}

function drawHud() {
  const palette = getPalette();

  // HUD background strip
  context.fillStyle = palette.structure;
  context.globalAlpha = 0.14;
  context.fillRect(0, 0, canvas.width, 54);
  context.globalAlpha = 1;

  // Score — large monospaced digits centered
  context.fillStyle = palette.segment;
  context.font = "bold 34px monospace";
  context.textAlign = "center";
  context.fillText(String(state.score).padStart(4, "0"), canvas.width / 2, 40);

  // Best score (subtle, below center) when set
  if (state.bestScore > 0) {
    context.font = "13px monospace";
    context.globalAlpha = 0.55;
    const bestLabel = state.score > state.bestScore ? "NEW BEST!" : `BEST ${state.bestScore}`;
    context.fillText(bestLabel, canvas.width / 2, 54);
    context.globalAlpha = 1;
  }

  // Lives: 3 hearts at right
  const heartSize = 11;
  const heartSpacing = 32;
  const heartBaseX = canvas.width - 28;
  const heartY = 24;
  for (let i = 0; i < FIRE_RULESET.maxMisses; i++) {
    const hx = heartBaseX - (FIRE_RULESET.maxMisses - 1 - i) * heartSpacing;
    const lost = i < state.misses;
    drawHeart(hx, heartY, heartSize, palette.accent, lost ? 0.28 : 1);
  }

  // Difficulty tier badge (shown from tier 2 upward during play)
  if (state.status === "running" && state.mode) {
    const { tier, label } = getDifficultyTier(state);
    if (tier >= 2) {
      const bx = 14, by = 8, bw = 88, bh = 30;
      context.fillStyle = palette.accent;
      context.globalAlpha = 0.82;
      context.fillRect(bx, by, bw, bh);
      context.globalAlpha = 1;
      context.fillStyle = palette.lcd;
      context.font = "bold 11px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText(label.toUpperCase(), bx + bw / 2, by + 20);
    }
  }

  context.textAlign = "left";
}

function drawOverlay() {
  if (state.status === "running") {
    return;
  }

  const palette = getPalette();
  context.fillStyle = "rgba(24, 31, 19, 0.55)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  context.textAlign = "center";
  context.fillStyle = palette.lcd;

  if (state.status === "gameover") {
    context.font = "bold 52px monospace";
    context.fillText("GAME OVER", cx, canvas.height / 2 - 40);
    context.font = "bold 36px monospace";
    context.fillText(String(state.score).padStart(4, "0"), cx, canvas.height / 2 + 20);
    context.font = "18px system-ui, sans-serif";
    context.globalAlpha = 0.75;
    context.fillText("Start Game A or B to play again", cx, canvas.height / 2 + 68);
    context.globalAlpha = 1;
  } else if (state.status === "paused") {
    context.font = "bold 44px monospace";
    context.fillText("PAUSED", cx, canvas.height / 2 - 10);
    context.font = "18px system-ui, sans-serif";
    context.globalAlpha = 0.75;
    context.fillText("Press Space or tap Pause to resume", cx, canvas.height / 2 + 44);
    context.globalAlpha = 1;
  } else {
    context.font = "bold 56px monospace";
    context.fillText("FIRE", cx, canvas.height / 2 - 50);
    context.font = "20px system-ui, sans-serif";
    context.globalAlpha = 0.85;
    context.fillText("Game A  —  Game B", cx, canvas.height / 2 + 10);
    context.font = "16px system-ui, sans-serif";
    context.globalAlpha = 0.6;
    context.fillText("Arrow keys / A D  ·  Touch controls", cx, canvas.height / 2 + 50);
    context.globalAlpha = 1;
  }

  context.textAlign = "left";
}

function drawFlashEffects() {
  if (catchFlashFrames > 0) {
    const point = FIRE_PLAYER_POSITIONS[state.netPosition];
    const alpha = (catchFlashFrames / 8) * 0.55;
    const grad = context.createRadialGradient(point.x, NET_TOP_Y, 10, point.x, NET_TOP_Y, 90);
    grad.addColorStop(0, `rgba(255, 255, 240, ${alpha})`);
    grad.addColorStop(1, "rgba(255, 255, 240, 0)");
    context.fillStyle = grad;
    context.fillRect(point.x - 100, NET_TOP_Y - 100, 200, 200);
    catchFlashFrames--;
  }

  if (missFlashFrames > 0) {
    const alpha = (missFlashFrames / 12) * 0.4;
    const grad = context.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.25,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.85,
    );
    grad.addColorStop(0, "rgba(160, 20, 20, 0)");
    grad.addColorStop(1, `rgba(160, 20, 20, ${alpha})`);
    context.fillStyle = grad;
    context.fillRect(0, 0, canvas.width, canvas.height);
    missFlashFrames--;
  }
}

function render() {
  updateSmoke();
  drawBackground();
  drawSmoke();
  drawJumpers();
  drawTrampoline();
  drawScorePopups();
  drawFlashEffects();
  drawHud();
  drawOverlay();
}

function frame(now) {
  const delta = Math.min(now - lastFrame, 100); // cap to avoid spiral-of-death after tab switches
  lastFrame = now;
  fireTick++;

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

applySoundUI();
skinButton.textContent = `Skin: ${skinMode === "silver" ? "Silver" : "Wide"}`;
startAButton.addEventListener("click", () => { audio.resume(); startGame("A"); });
startBButton.addEventListener("click", () => { audio.resume(); startGame("B"); });
pauseButton.addEventListener("click", () => { audio.resume(); dispatch({ type: "PAUSE_TOGGLE" }); });
skinButton.addEventListener("click", toggleSkin);
soundButton.addEventListener("click", () => { audio.resume(); toggleSound(); });
moveLeftButton.addEventListener("click", () => handleAction("move-left"));
moveRightButton.addEventListener("click", () => handleAction("move-right"));
mobileLeft.addEventListener("click", () => handleAction("move-left"));
mobileRight.addEventListener("click", () => handleAction("move-right"));
mobileStartA.addEventListener("click", () => { audio.resume(); startGame("A"); });
mobileStartB.addEventListener("click", () => { audio.resume(); startGame("B"); });
mobilePause.addEventListener("click", () => { audio.resume(); dispatch({ type: "PAUSE_TOGGLE" }); });
mobileSound.addEventListener("click", () => { audio.resume(); toggleSound(); });

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
    audio.resume();
  }
});

// Resume audio context on any touch — mobile browsers suspend it until user gesture.
// The silent buffer trick inside resume() is needed for iOS Safari.
document.addEventListener("touchstart", () => audio.resume(), { passive: true });
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(new URL("../../sw.js", import.meta.url));
}

updateHud();
render();
requestAnimationFrame(frame);
