// Broad training regions on the personalized surface; the atlas retains exact mesh selection.
export function surfaceRegion({ x, y, z }) {
  const side = Math.abs(x),
    front = z >= 0;
  if (y > 1.48 || y < 0.12) return null;
  if (y > 1.38 && side < 0.13)
    return { key: 'trapezius_upper', label: 'Upper traps' };
  if (side > 0.22 && y > 0.88) {
    if (y > 1.3) return { key: 'deltoid_lateral', label: 'Shoulders' };
    if (y > 1.08)
      return front
        ? { key: 'biceps_brachii', label: 'Biceps' }
        : { key: 'triceps', label: 'Triceps' };
    return { key: 'brachioradialis', label: 'Forearms' };
  }
  if (y > 1.18)
    return front
      ? { key: 'pectoralis_major', label: 'Chest' }
      : { key: 'latissimus_dorsi', label: 'Back' };
  if (y > 1.02)
    return front
      ? { key: 'rectus_abdominis', label: 'Core' }
      : { key: 'erector_spinae', label: 'Lower back' };
  if (y > 0.85)
    return front
      ? { key: 'rectus_femoris', label: 'Upper legs' }
      : { key: 'gluteus_maximus', label: 'Glutes' };
  if (y > 0.45)
    return front
      ? { key: 'rectus_femoris', label: 'Quads' }
      : { key: 'biceps_femoris', label: 'Hamstrings' };
  return front
    ? { key: 'tibialis_anterior', label: 'Shins' }
    : { key: 'gastrocnemius', label: 'Calves' };
}
