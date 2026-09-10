export const MAIN_TAB_PATHS = ['/home', '/fleet', '/parts', '/profile'];

let currentActiveTabIndex = 0;

export function getGlobalActiveTabIndex(): number {
  return currentActiveTabIndex;
}

export function setGlobalActiveTabIndex(index: number): void {
  if (index >= 0 && index < MAIN_TAB_PATHS.length) {
    currentActiveTabIndex = index;
  }
}

export function updateGlobalActiveTabFromPath(pathname: string): number {
  if (pathname === '/vehicles' || pathname === '/bookings' || pathname === '/reminders' || pathname === '/fleet') {
    currentActiveTabIndex = 1;
    return 1;
  }
  const index = MAIN_TAB_PATHS.indexOf(pathname);
  if (index >= 0) {
    currentActiveTabIndex = index;
  }
  return currentActiveTabIndex;
}
