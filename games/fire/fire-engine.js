export const FIRE_RULESET = Object.freeze({
  variant: "Wide Screen",
  version: "1981",
  trampolinePositions: 4,
  maxMisses: 3,
  bonusResetScores: [200, 500],
  scoring: "One point per successful bounce on the rescue net.",
});

// Four discrete player positions. Catch segments only require positions 0-2;
// position 3 (near the ambulance) has no required catch so standing there costs a life.
export const FIRE_PLAYER_POSITIONS = [
  { x: 310, y: 432 },
  { x: 467, y: 432 },
  { x: 624, y: 432 },
  { x: 782, y: 432 },
];

// Two jump paths (upper and lower building windows).
// Each path: window → air → three catch segments → ambulance.
// Catch x values are aligned with FIRE_PLAYER_POSITIONS[0..2].
// Catch y=390 aligns with the net top (player.y − 42 = 390).
export const FIRE_PATHS = Object.freeze([
  [
    { x: 208, y: 142, kind: "window", source: 0, pose: "window-high" },
    { x: 258, y: 220, kind: "air", pose: "fall-left" },
    { x: 310, y: 390, kind: "catch", requiredPosition: 0, score: 1, pose: "bounce-left" },
    { x: 388, y: 302, kind: "air", pose: "rise-mid" },
    { x: 467, y: 390, kind: "catch", requiredPosition: 1, score: 1, pose: "bounce-mid" },
    { x: 545, y: 302, kind: "air", pose: "rise-right" },
    { x: 624, y: 382, kind: "catch", requiredPosition: 2, score: 1, pose: "bounce-right" },
    { x: 836, y: 390, kind: "ambulance", saved: true, pose: "ambulance" },
  ],
  [
    { x: 208, y: 198, kind: "window", source: 1, pose: "window-low" },
    { x: 258, y: 265, kind: "air", pose: "fall-left-low" },
    { x: 310, y: 406, kind: "catch", requiredPosition: 0, score: 1, pose: "bounce-left-low" },
    { x: 388, y: 315, kind: "air", pose: "rise-mid-low" },
    { x: 467, y: 406, kind: "catch", requiredPosition: 1, score: 1, pose: "bounce-mid-low" },
    { x: 545, y: 315, kind: "air", pose: "rise-right-low" },
    { x: 624, y: 398, kind: "catch", requiredPosition: 2, score: 1, pose: "bounce-right-low" },
    { x: 836, y: 406, kind: "ambulance", saved: true, pose: "ambulance" },
  ],
]);

const MAX_POSITION = FIRE_RULESET.trampolinePositions - 1;

function clampPosition(position) {
  return Math.min(MAX_POSITION, Math.max(0, position));
}

function getMaxActiveJumpers(mode, score) {
  if (mode === "B") {
    if (score >= 40) return 5;
    if (score >= 15) return 4;
    return 3;
  }

  // Game A: start with 2, get 3 quickly, 4 at high score
  if (score >= 60) return 4;
  if (score >= 15) return 3;
  return 2;
}

function getSpawnIntervalCycles(mode, score) {
  if (mode === "B") {
    // Game B: starts at 3, floors at 1
    return Math.max(1, 3 - Math.floor(score / 15));
  }

  // Game A: starts at 4, floors at 2
  return Math.max(2, 4 - Math.floor(score / 15));
}

function maybeResetMisses(score, misses, events) {
  if (FIRE_RULESET.bonusResetScores.includes(score) && misses > 0) {
    events.push("reset");
    return 0;
  }

  return misses;
}

function getSourceIndexForSpawn(state) {
  if (state.mode === "A") {
    // Randomly pick high or low window so jumpers come from different heights
    return Math.random() < 0.5 ? 0 : 1;
  }

  return state.nextSourceIndex;
}

function spawnJumper(state) {
  const sourceIndex = getSourceIndexForSpawn(state);
  const beat = state.nextSpawnBeat;

  return {
    ...state,
    jumpers: [
      ...state.jumpers,
      {
        id: state.nextJumperId,
        pathIndex: sourceIndex,
        segmentIndex: 0,
        beat,
      },
    ],
    nextJumperId: state.nextJumperId + 1,
    nextSourceIndex: state.mode === "B" ? (sourceIndex === 0 ? 1 : 0) : 0,
    nextSpawnBeat: beat === 1 ? 2 : 1,
    // Randomise next spawn jitter: -1, 0, or +1 cycle
    spawnJitter: Math.floor(Math.random() * 3) - 1,
  };
}

function maybeSpawnJumper(state) {
  if (state.status !== "running") {
    return state;
  }

  const activeJumpers = state.jumpers.length;
  const maxActive = getMaxActiveJumpers(state.mode, state.score);
  const baseInterval = getSpawnIntervalCycles(state.mode, state.score);
  // Add ±1 jitter to the spawn interval for organic variety, but keep
  // minimum interval of 2 so overlapping spawns don't pile up at the start.
  const spawnInterval = Math.max(2, baseInterval + state.spawnJitter);

  if (activeJumpers >= maxActive) {
    return state;
  }

  if (state.spawnCycleCount % spawnInterval !== 0) {
    return state;
  }

  return spawnJumper(state);
}

export function createInitialFireState(bestScore = 0) {
  return {
    status: "idle",
    mode: null,
    score: 0,
    bestScore,
    misses: 0,
    beatPhase: 1,
    spawnCycleCount: 0,
    nextJumperId: 1,
    nextSourceIndex: 0,
    nextSpawnBeat: 1,
    netPosition: 1,
    jumpers: [],
    ambulanceFlash: 0,
    freezeTicks: 0,
    lastEvent: null,
    spawnJitter: 0,
  };
}

export function getTickDurationMs(state) {
  if (!state.mode) {
    return 300;
  }

  const base = state.mode === "A" ? 300 : 260;
  const floor = state.mode === "A" ? 130 : 100;
  const step = state.mode === "A" ? 10 : 8;
  const acceleration = Math.min(base - floor, Math.floor(state.score / step) * 8);
  return Math.max(floor, base - acceleration);
}

export function getDifficultyTier(state) {
  const { score } = state;
  if (score >= 150) return { tier: 5, label: "Blazing" };
  if (score >= 100) return { tier: 4, label: "Very Fast" };
  if (score >= 60) return { tier: 3, label: "Faster" };
  if (score >= 30) return { tier: 2, label: "Fast" };
  return { tier: 1, label: "Normal" };
}

export function getJumperSegment(jumper) {
  return FIRE_PATHS[jumper.pathIndex][jumper.segmentIndex];
}

export function reduceFireState(state, action) {
  switch (action.type) {
    case "START_GAME": {
      const startedState = spawnJumper({
        ...createInitialFireState(state.bestScore),
        status: "running",
        mode: action.mode,
        lastEvent: "start",
      });

      return {
        state: startedState,
        events: ["start"],
      };
    }

    case "MOVE_LEFT": {
      return {
        state: { ...state, netPosition: clampPosition(state.netPosition - 1) },
        events: [],
      };
    }

    case "MOVE_RIGHT": {
      return {
        state: { ...state, netPosition: clampPosition(state.netPosition + 1) },
        events: [],
      };
    }

    case "PAUSE_TOGGLE": {
      if (state.status === "idle" || state.status === "gameover") {
        return { state, events: [] };
      }

      return {
        state: {
          ...state,
          status: state.status === "paused" ? "running" : "paused",
        },
        events: [],
      };
    }

    case "TICK": {
      if (state.status !== "running") {
        return { state, events: [] };
      }

      const events = [];
      let nextScore = state.score;
      let nextMisses = state.misses;
      let nextBest = state.bestScore;
      let nextStatus = state.status;
      let ambulanceFlash = state.ambulanceFlash > 0 ? state.ambulanceFlash - 1 : 0;
      let freezeTicks = state.freezeTicks > 0 ? state.freezeTicks - 1 : 0;
      let nextJumpers = state.jumpers;
      let nextBeatPhase = state.beatPhase;
      let nextSpawnCycleCount = state.spawnCycleCount;
      let nextSourceIndex = state.nextSourceIndex;
      let nextSpawnBeat = state.nextSpawnBeat;
      let nextJumperId = state.nextJumperId;

      if (state.freezeTicks > 0) {
        nextBeatPhase = state.beatPhase === 3 ? 1 : state.beatPhase + 1;
      } else if (state.beatPhase === 1 || state.beatPhase === 2) {
        const activeBeat = state.beatPhase;
        const movedJumpers = [];

        for (const jumper of state.jumpers) {
          if (jumper.beat !== activeBeat) {
            movedJumpers.push(jumper);
            continue;
          }

          const nextSegmentIndex = jumper.segmentIndex + 1;
          const nextSegment = FIRE_PATHS[jumper.pathIndex][nextSegmentIndex];

          if (!nextSegment) {
            continue;
          }

          if (
            nextSegment.requiredPosition !== undefined &&
            nextSegment.requiredPosition !== state.netPosition
          ) {
            nextMisses += 1;
            events.push("miss");
            if (nextMisses >= FIRE_RULESET.maxMisses) {
              nextStatus = "gameover";
            }
            continue;
          }

          if (nextSegment.score) {
            nextScore += nextSegment.score;
            nextBest = Math.max(nextBest, nextScore);
            events.push("bounce");
            const previousMisses = nextMisses;
            nextMisses = maybeResetMisses(nextScore, nextMisses, events);
            if (nextMisses !== previousMisses) {
              freezeTicks = 4;
            }
          }

          if (nextSegment.saved) {
            ambulanceFlash = 4;
            events.push("save");
          } else {
            movedJumpers.push({
              ...jumper,
              segmentIndex: nextSegmentIndex,
            });
          }
        }

        nextJumpers = movedJumpers;
        nextBeatPhase = state.beatPhase === 1 ? 2 : 3;
      } else {
        nextSpawnCycleCount = state.spawnCycleCount + 1;

        const spawnedState = maybeSpawnJumper({
          ...state,
          score: nextScore,
          misses: nextMisses,
          bestScore: nextBest,
          status: nextStatus,
          beatPhase: state.beatPhase,
          spawnCycleCount: nextSpawnCycleCount,
            jumpers: nextJumpers,
            nextSourceIndex,
            nextSpawnBeat,
            nextJumperId,
            freezeTicks,
          });

        nextJumpers = spawnedState.jumpers;
        nextSourceIndex = spawnedState.nextSourceIndex;
        nextSpawnBeat = spawnedState.nextSpawnBeat;
        nextJumperId = spawnedState.nextJumperId;
        nextBeatPhase = 1;
      }

      if (nextStatus === "gameover") {
        events.push("gameover");
      }

      return {
        state: {
          ...state,
          status: nextStatus,
          score: nextScore,
          bestScore: nextBest,
          misses: Math.min(nextMisses, FIRE_RULESET.maxMisses),
          beatPhase: nextBeatPhase,
          spawnCycleCount: nextSpawnCycleCount,
          nextJumperId,
          nextSourceIndex,
          nextSpawnBeat,
          jumpers: nextJumpers,
          ambulanceFlash,
          freezeTicks,
          lastEvent: events[events.length - 1] ?? state.lastEvent,
        },
        events,
      };
    }

    default: {
      return { state, events: [] };
    }
  }
}
