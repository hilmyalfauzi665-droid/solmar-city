// Keyboard and pointer input. Held keys are read every frame; one-shot presses
// (pause, interact, mute, confirm) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost or counted twice.
// The mouse position is kept in screen pixels and converted to world pixels
// by the renderer; shooting and aiming use the pointer, movement the keys.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_MUTE = 8;
export const ACTION_SAVE = 16;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);
const SAVE = new Set(['KeyS']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else if (SAVE.has(event.code)) actions |= ACTION_SAVE;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  // A key released while the tab is hidden never sends keyup: let go of all.
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    mouse.clicked = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  return {
    keys,
    mouse,
    /** -1, 0 or 1 for each axis, from WASD or the arrow keys. */
    axis() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    sprint() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    handbrake() {
      return keys.has('Space');
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** True once for a mouse press since the last call. */
    takeClick() {
      const was = mouse.clicked;
      mouse.clicked = false;
      return was;
    },
  };
}
