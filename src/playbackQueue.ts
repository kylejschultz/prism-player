export type RepeatMode = "off" | "all" | "one";

export type PlaybackQueueState<T> = {
  queue: T[];
  sourceQueue: T[];
  currentIndex: number;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
};

export type PlaybackQueueTransition<T> = {
  queue: T[];
  currentIndex: number;
  effect: "advance" | "restart" | "stop";
};

type Shuffle<T> = (items: T[]) => T[];

export function advancePlaybackQueue<T>(
  state: PlaybackQueueState<T>,
  fromTrackEnd: boolean,
  shuffle: Shuffle<T>,
): PlaybackQueueTransition<T> {
  const { queue, sourceQueue, currentIndex, shuffleEnabled, repeatMode } = state;

  if (!queue.length) return { queue, currentIndex: 0, effect: "stop" };
  if (fromTrackEnd && repeatMode === "one") return { queue, currentIndex, effect: "restart" };
  if (currentIndex < queue.length - 1) return { queue, currentIndex: currentIndex + 1, effect: "advance" };
  if (repeatMode !== "all") return { queue, currentIndex, effect: "stop" };

  const completeSourceQueue = sourceQueue.length ? sourceQueue : queue;
  if (completeSourceQueue.length === 1) return { queue: completeSourceQueue, currentIndex: 0, effect: "restart" };

  return {
    queue: shuffleEnabled ? shuffle(completeSourceQueue) : completeSourceQueue,
    currentIndex: 0,
    effect: "advance",
  };
}

export function toggleShuffleTraversal<T>(
  state: Pick<PlaybackQueueState<T>, "queue" | "sourceQueue" | "currentIndex" | "shuffleEnabled">,
  shuffle: Shuffle<T>,
  keyOf: (item: T) => string,
): Pick<PlaybackQueueState<T>, "queue" | "currentIndex" | "shuffleEnabled"> {
  const { queue, sourceQueue, currentIndex, shuffleEnabled } = state;
  const current = queue[currentIndex];
  if (!current || queue.length < 2) return { queue, currentIndex, shuffleEnabled };
  const currentKey = keyOf(current);
  const canonicalQueue = sourceQueue.some((item) => keyOf(item) === currentKey) ? sourceQueue : queue;

  if (shuffleEnabled) {
    const restoredIndex = canonicalQueue.findIndex((item) => keyOf(item) === currentKey);
    return {
      queue: canonicalQueue,
      currentIndex: restoredIndex >= 0 ? restoredIndex : 0,
      shuffleEnabled: false,
    };
  }

  const sourceIndex = canonicalQueue.findIndex((item) => keyOf(item) === currentKey);
  const remaining = canonicalQueue.filter((_, index) => index !== sourceIndex);
  return {
    queue: [current, ...shuffle(remaining)],
    currentIndex: 0,
    shuffleEnabled: true,
  };
}

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}
