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

export function createKeyboardController(target, onAction) {
  const handleKeyDown = (event) => {
    const action = getActionFromKey(event.key);
    if (!action) {
      return;
    }

    event.preventDefault();
    onAction(action);
  };

  target.addEventListener("keydown", handleKeyDown);
  return () => target.removeEventListener("keydown", handleKeyDown);
}
