export function needsBalanceConfirmation(previous, next) {
  if (next === '' || next === null) return previous !== undefined && previous !== null;
  if (previous === undefined || previous === null) return Math.abs(Number(next)) >= 10000;
  const delta = Math.abs(Number(next) - previous);
  return delta >= 1000 && (previous === 0 || delta / Math.abs(previous) >= 0.5);
}
