import { useEffect, useState } from "react";
import { FlacPreparationQueue } from "./flacCompatibility";

export function useFlacCompatibility(current: string | null, next: string | null, retainedUrl: string | null) {
  const [queue] = useState(() => new FlacPreparationQueue());
  const [, redraw] = useState(0);
  useEffect(() => {
    queue.select(current, next, retainedUrl, () => redraw(value => value + 1));
  }, [queue, current, next, retainedUrl]);
  useEffect(() => () => queue.clear(), [queue]);
  return { current: queue.resolve(current), next: queue.resolve(next), reject: (source: string, url: string) => queue.reject(source, url) };
}
