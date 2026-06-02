import { useConvex } from "convex/react";
import { useEffect, useRef, useState } from "react";

const oneShotCache = new Map<string, unknown>();
const oneShotInFlight = new Map<string, Promise<unknown>>();

export function useOneShotConvexQuery<T>(
  enabled: boolean,
  load: (convex: ReturnType<typeof useConvex>) => Promise<T>,
  deps: readonly unknown[],
  identityDeps?: readonly unknown[],
  requestKey?: string
) {
  const convex = useConvex();
  const [data, setData] = useState<T | undefined>(undefined);

  const depsKey = JSON.stringify(deps);
  const identityKey = identityDeps ? JSON.stringify(identityDeps) : depsKey;

  const prevDepsKeyRef = useRef<string | undefined>(undefined);
  const prevIdentityKeyRef = useRef<string | undefined>(undefined);
  const prevEnabledRef = useRef<boolean>(false);

  useEffect(() => {
    const depsChanged = depsKey !== prevDepsKeyRef.current;
    const identityChanged = identityKey !== prevIdentityKeyRef.current;
    const enabledChanged = enabled !== prevEnabledRef.current;

    prevDepsKeyRef.current = depsKey;
    prevIdentityKeyRef.current = identityKey;
    prevEnabledRef.current = enabled;

    if (!enabled) {
      if (enabledChanged) {
        setData(undefined);
      }
      return;
    }

    if (!depsChanged && !enabledChanged) return;

    if (identityChanged || enabledChanged) {
      setData(undefined);
    }

    let cancelled = false;
    if (requestKey && oneShotCache.has(requestKey)) {
      setData(oneShotCache.get(requestKey) as T);
      return;
    }

    const request = requestKey
      ? ((oneShotInFlight.get(requestKey) as Promise<T> | undefined) ??
        load(convex).finally(() => {
          oneShotInFlight.delete(requestKey);
        }))
      : load(convex);

    if (requestKey && !oneShotInFlight.has(requestKey)) {
      oneShotInFlight.set(requestKey, request);
    }

    void request
      .then((result) => {
        if (requestKey) oneShotCache.set(requestKey, result);
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [convex, enabled, depsKey, requestKey]);

  return data;
}
