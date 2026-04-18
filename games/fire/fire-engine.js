export const FIRE_RULESET = Object.freeze({
  variant: "Silver",
  version: "1980",
  trampolinePositions: 4,
  maxMisses: 3,
  bonusResetScores: [200, 500],
  scoring: "One point per full rescue into the ambulance.",
});

const MAX_POSITION = FIRE_RULESET.trampolinePositions - 1;

export function createInitialFireState(bestScore = 0) {
  return {
    status: "idle",
    mode: null,
    score: 0,
    bestScore,
    misses: 0,
    tickCount: 0,
    nextJumperId: 1,
    netPosition: 1,
    jumpers: [],
    lastEvent: null,
  };
}

export function getTickDurationMs(state) {
  if (!state.mode) {
    return 520;
  }

  const base = state.mode === "A" ? 620 : 480;
  const acceleration = Math.min(260, Math.floor(state.score / 12) * 18);
  return Math.max(state.mode === "A" ? 250 : 180, base - acceleration);
}

function clampPosition(position) {
  return Math.min(MAX_POSITION, Math.max(0, position));
}

function queueJumper(state) {
  if (state.jumpers.some((jumper) => jumper.stage === 0)) {
    return state;
  }

  return {
    ...state,
    jumpers: [...state.jumpers, { id: state.nextJumperId, stage: 0 }],
    nextJumperId: state.nextJumperId + 1,
  };
}

function shouldSpawnJumper(state) {
  const interval = state.mode === "A"
    ? Math.max(5, 9 - Math.floor(state.score / 40))
    : Math.max(4, 7 - Math.floor(state.score / 50));
  return state.tickCount % interval === 0;
}

export function reduceFireState(state, action) {
  switch (action.type) {
    case "START_GAME": {
      return {
        state: queueJumper({
          ...createInitialFireState(state.bestScore),
          status: "running",
          mode: action.mode,
          lastEvent: "start",
        }),
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
      const nextJumpers = [];
      const sortedJumpers = [...state.jumpers].sort((left, right) => right.stage - left.stage);

      for (const jumper of sortedJumpers) {
        if (jumper.stage !== state.netPosition) {
          nextMisses += 1;
          events.push("miss");
          if (nextMisses >= FIRE_RULESET.maxMisses) {
            nextStatus = "gameover";
          }
          continue;
        }

        if (jumper.stage === MAX_POSITION) {
          nextScore += 1;
          nextBest = Math.max(nextBest, nextScore);
          events.push("save");

          if (FIRE_RULESET.bonusResetScores.includes(nextScore) && nextMisses > 0) {
            nextMisses = 0;
            events.push("reset");
          }
          continue;
        }

        nextJumpers.push({ ...jumper, stage: jumper.stage + 1 });
        events.push("bounce");
      }

      let nextState = {
        ...state,
        status: nextStatus,
        score: nextScore,
        bestScore: nextBest,
        misses: Math.min(nextMisses, FIRE_RULESET.maxMisses),
        tickCount: state.tickCount + 1,
        jumpers: nextJumpers.sort((left, right) => left.stage - right.stage),
        lastEvent: events.at(-1) ?? state.lastEvent,
      };

      if (nextState.status === "running") {
        if (nextState.jumpers.length === 0 || shouldSpawnJumper(nextState)) {
          nextState = queueJumper(nextState);
        }
      }

      if (nextState.status === "gameover") {
        events.push("gameover");
      }

      return { state: nextState, events };
    }
    default: {
      return { state, events: [] };
    }
  }
}
