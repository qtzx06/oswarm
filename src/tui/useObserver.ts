import { useState, useEffect, useRef } from "react";
import { createObserver, type Observer } from "../observer/index.ts";
import type { SwarmState } from "../types/index.ts";

export function useObserver(projectDir: string): {
  state: SwarmState;
  observer: Observer | null;
} {
  const observerRef = useRef<Observer | null>(null);
  const [state, setState] = useState<SwarmState>(() => {
    const obs = createObserver(projectDir);
    observerRef.current = obs;
    return obs.getState();
  });

  useEffect(() => {
    const observer = observerRef.current;
    if (!observer) return;

    const unsub = observer.subscribe(setState);
    observer.start().catch((err) => {
      console.error("Observer start failed:", err);
    });

    return () => {
      unsub();
      observer.stop();
    };
  }, []);

  return { state, observer: observerRef.current };
}
