const KEY_ACTION_MAP = new Map([
  ["ArrowLeft", "move-left"],
  ["a", "move-left"],
  ["A", "move-left"],
  ["j", "move-left"],
  ["J", "move-left"],
  ["ArrowRight", "move-right"],
  ["d", "move-right"],
  ["D", "move-right"],
  ["l", "move-right"],
  ["L", "move-right"],
  ["1", "start-a"],
  ["2", "start-b"],
  [" ", "pause-toggle"],
  ["Spacebar", "pause-toggle"],
  ["p", "pause-toggle"],
  ["P", "pause-toggle"],
  ["m", "sound-toggle"],
  ["M", "sound-toggle"],
]);

export function getActionFromKey(key) {
  return KEY_ACTION_MAP.get(key) ?? null;
}

const REPEAT_ACTIONS = new Set(["move-left", "move-right"]);

export function createKeyboardController(target, onAction) {
  const held = new Map(); // key → { timer, interval }

  const handleKeyDown = (event) => {
    const action = getActionFromKey(event.key);
    if (!action) return;
    event.preventDefault();

    if (REPEAT_ACTIONS.has(action)) {
      if (!held.has(event.key)) {
        onAction(action);
        const timer = setTimeout(() => {
          const interval = setInterval(() => onAction(action), 80);
          const entry = held.get(event.key);
          if (entry) entry.interval = interval;
        }, 200);
        held.set(event.key, { timer, interval: null });
      }
    } else if (!event.repeat) {
      onAction(action);
    }
  };

  const handleKeyUp = (event) => {
    const entry = held.get(event.key);
    if (entry) {
      clearTimeout(entry.timer);
      clearInterval(entry.interval);
      held.delete(event.key);
    }
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);
  return () => {
    target.removeEventListener("keydown", handleKeyDown);
    target.removeEventListener("keyup", handleKeyUp);
  };
}
