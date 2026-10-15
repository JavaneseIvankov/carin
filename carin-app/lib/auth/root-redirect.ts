export function createRootRedirectCoordinator() {
  let activeTarget: string | null = null;

  return (target: string | null, replace: (href: string) => void) => {
    if (target === null) {
      activeTarget = null;
      return;
    }
    if (target === activeTarget) return;

    replace(target);
    activeTarget = target;
  };
}
