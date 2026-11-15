/** Shared, testable input math for desktop keyboards and phone touch controls. */
export function joystickVector(dx, dy, radius, deadZone = .11) {
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || !Number.isFinite(radius) || radius <= 0 || length <= 0) {
    return {f: 0, s: 0, px: 0, py: 0};
  }
  const amount = Math.min(1, length / radius);
  const strength = amount <= deadZone ? 0 : (amount - deadZone) / (1 - deadZone);
  return {
    f: -dy / length * strength, s: dx / length * strength,
    px: dx / length * amount, py: dy / length * amount
  };
}
export function movementAxes(keys, joystick = {f: 0, s: 0}) {
  const f = (Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))) + (joystick.f || 0);
  const s = (Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))) + (joystick.s || 0);
  const length = Math.max(1, Math.hypot(f, s));
  return {f: f / length, s: s / length};
}
export function clampedPitch(value) { return Math.min(1.38, Math.max(-1.38, value)); }
