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

/** Camera and game world share the same yaw convention: THREE looks down local -Z.
 * Positive yaw turns the camera toward world -X; positive strafe goes camera-right.
 * Axis values remain analog and are normalized only above magnitude 1. */
export function movementDelta(f, s, yaw, speed = 1, dt = 1) {
  const forward = Number.isFinite(f) ? Math.max(-1, Math.min(1, f)) : 0;
  const strafe = Number.isFinite(s) ? Math.max(-1, Math.min(1, s)) : 0;
  const heading = Number.isFinite(yaw) ? yaw : 0;
  const rawLength = Math.hypot(forward, strafe);
  const scale = Math.max(0, Number(speed) || 0) * Math.max(0, Number(dt) || 0) / Math.max(1, rawLength);
  const sin = Math.sin(heading), cos = Math.cos(heading);
  return {dx: (-forward * sin + strafe * cos) * scale,
          dz: (-forward * cos - strafe * sin) * scale};
}
/** Yaw which makes a THREE first-person camera look in the supplied world direction. */
export function yawTowards(dx, dz) {
  return Math.atan2(-dx, -dz);
}
