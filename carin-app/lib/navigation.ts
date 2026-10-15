export type ShellAction = 'open-sheet' | 'close-sheet' | 'back' | 'select-tab';

export function nextSheetOpen(open: boolean, action: ShellAction) {
  if (action === 'open-sheet') return true;
  if (action === 'close-sheet' || action === 'back' || action === 'select-tab') return false;
  return open;
}
