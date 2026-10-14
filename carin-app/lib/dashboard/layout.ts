export function shouldStackDashboardActions(width: number, fontScale: number) {
  return width < 360 || fontScale > 1.2;
}

export function shouldShowDashboardNextAction(code: string) {
  return code !== 'record_consumption' && code !== 'complete_profile';
}
