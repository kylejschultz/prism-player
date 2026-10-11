export const HISTORY_SWIPE_IDLE_MS = 100;
const HISTORY_SWIPE_THRESHOLD = 120;
const HISTORY_SWIPE_DOMINANCE = 1.35;
const HISTORY_SWIPE_COOLDOWN_MS = 600;

export type HistorySwipeDirection = "back" | "forward";

export type HistorySwipeState = {
  active: boolean;
  blocked: boolean;
  deltaX: number;
  deltaY: number;
  cooldownUntil: number;
};

export type HistoryAvailability = {
  back: boolean;
  forward: boolean;
};

export function createHistorySwipeState(): HistorySwipeState {
  return {
    active: false,
    blocked: false,
    deltaX: 0,
    deltaY: 0,
    cooldownUntil: 0,
  };
}

export function cancelHistorySwipe(state: HistorySwipeState): HistorySwipeState {
  return { ...createHistorySwipeState(), cooldownUntil: state.cooldownUntil };
}

export function recordHistorySwipe(
  state: HistorySwipeState,
  deltaX: number,
  deltaY: number,
  eventAt: number,
): HistorySwipeState {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || eventAt < state.cooldownUntil) return state;

  const nextDeltaX = state.deltaX + deltaX;
  const nextDeltaY = state.deltaY + deltaY;
  const blocked = state.blocked || (Math.abs(nextDeltaY) > 24 && Math.abs(nextDeltaY) * HISTORY_SWIPE_DOMINANCE > Math.abs(nextDeltaX));

  return {
    ...state,
    active: true,
    blocked,
    deltaX: nextDeltaX,
    deltaY: nextDeltaY,
  };
}

export function completeHistorySwipe(
  state: HistorySwipeState,
  completedAt: number,
  availability: HistoryAvailability,
): { state: HistorySwipeState; direction: HistorySwipeDirection | null } {
  if (!state.active) return { state, direction: null };

  const deliberateDirection = historySwipeDirection(state);
  const deliberate = deliberateDirection !== null;
  const availableDirection = armedHistorySwipeDirection(state, availability);
  const cooldownUntil = deliberate ? completedAt + HISTORY_SWIPE_COOLDOWN_MS : state.cooldownUntil;

  return {
    state: { ...createHistorySwipeState(), cooldownUntil },
    direction: availableDirection,
  };
}

function historySwipeDirection(state: HistorySwipeState): HistorySwipeDirection | null {
  const deliberate = state.active
    && !state.blocked
    && Math.abs(state.deltaX) >= HISTORY_SWIPE_THRESHOLD
    && Math.abs(state.deltaX) >= Math.abs(state.deltaY) * HISTORY_SWIPE_DOMINANCE;

  return deliberate ? (state.deltaX < 0 ? "back" : "forward") : null;
}

export function armedHistorySwipeDirection(
  state: HistorySwipeState,
  availability: HistoryAvailability,
): HistorySwipeDirection | null {
  const direction = historySwipeDirection(state);
  return direction && availability[direction] ? direction : null;
}

export function shouldIgnoreHistorySwipeTarget({
  isControl,
  hasHorizontalScroll,
}: {
  isControl: boolean;
  hasHorizontalScroll: boolean;
}) {
  return isControl || hasHorizontalScroll;
}
