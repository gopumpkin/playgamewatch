export const FIRE_RULESET = Object.freeze({
  variant: "Wide Screen",
  version: "1981",
  trampolinePositions: 3,
  maxMisses: 3,
  bonusResetScores: [200, 500],
  scoring: "One point per successful bounce on the rescue net.",
});

export const FIRE_PLAYER_POSITIONS = [
  { x: 282, y: 386 },
  { x: 487, y: 366 },
  { x: 678, y: 328 },
];

export const FIRE_PATHS = Object.freeze([
  [
    { x: 170, y: 138, kind: "window", source: 0 },
    { x: 222, y: 208, kind: "air" },
    { x: 282, y: 286, kind: "catch", requiredPosition: 0, score: 1 },
    { x: 364, y: 264, kind: "air" },
    { x: 487, y: 286, kind: "catch", requiredPosition: 1, score: 1 },
    { x: 592, y: 246, kind: "air" },
    { x: 678, y: 250, kind: "catch", requiredPosition: 2, score: 1 },
    { x: 822, y: 286, kind: "ambulance", saved: true },
  ],
  [
    { x: 170, y: 188, kind: "window", source: 1 },
    { x: 234, y: 252, kind: "air" },
    { x: 282, y: 304, kind: "catch", requiredPosition: 0, score: 1 },
    { x: 394, y: 286, kind: "air" },
    { x: 487, y: 306, kind: "catch", requiredPosition: 1, score: 1 },
    { x: 604, y: 270, kind: "air" },
    { x: 678, y: 272, kind: "catch", requiredPosition: 2, score: 1 },
    { x: 822, y: 292, kind: "ambulance", saved: true },
  ],
]);

const MAX_POSITION = FIRE_RULESET.trampolinePositions - 1;

function clampPosition(position) {
  return Math.min(MAX_POSITION, Math.max(0, position));
}

function getMaxActiveJumpers(mode) {
  return mode === "B" ? 3 : 2;
}

function getSpawnIntervalCycles(mode, score) {
  if (mode === "B") {
    return Math.max(2, 5 - Math.floor(score / 45));
  }

  return Math.max(3, 6 - Math.floor(score / 60));
}

function maybeResetMisses(score, misses, events) {
  if (FIRE_RULESET.bonusResetScores.includes(score) && misses > 0) {
    events.push("reset");
    return 0;
  }

  return misses;
}

function spawnJumper(state) {
  const sourceIndex = state.nextSourceIndex;
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
    nextSourceIndex: sourceIndex === 0 ? 1 : 0,
    nextSpawnBeat: beat === 1 ? 2 : 1,
  };
}

function maybeSpawnJumper(state) {
  if (state.status !== "running") {
    return state;
  }

  const activeJumpers = state.jumpers.length;
  const maxActive = getMaxActiveJumpers(state.mode);
  const spawnInterval = getSpawnIntervalCycles(state.mode, state.score);

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
    lastEvent: null,
  };
}

export function getTickDurationMs(state) {
  if (!state.mode) {
    return 260;
  }

  const base = state.mode === "A" ? 255 : 215;
  const acceleration = Math.min(85, Math.floor(state.score / 18) * 5);
  return Math.max(state.mode === "A" ? 150 : 120, base - acceleration);
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
      let nextJumpers = state.jumpers;
      let nextBeatPhase = state.beatPhase;
      let nextSpawnCycleCount = state.spawnCycleCount;
      let nextSourceIndex = state.nextSourceIndex;
      let nextSpawnBeat = state.nextSpawnBeat;
      let nextJumperId = state.nextJumperId;

      if (state.beatPhase === 1 || state.beatPhase === 2) {
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
            nextMisses = maybeResetMisses(nextScore, nextMisses, events);
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
          lastEvent: events.at(-1) ?? state.lastEvent,
        },
        events,
      };
    }

    default: {
      return { state, events: [] };
    }
  }
}
