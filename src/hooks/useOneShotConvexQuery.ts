import { useConvex } from "convex/react";
import { useEffect, useState } from "react";

export function useOneShotConvexQuery<T>(
  enabled: boolean,
  load: (convex: ReturnType<typeof useConvex>) => Promise<T>,
  deps: readonly unknown[]
) {
  const convex = useConvex();
  const [data, setData] = useState<T | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setData(undefined);
      return;
    }

    let cancelled = false;
    setData(undefined);

    void load(convex)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [convex, enabled, ...deps]);

  return data;
}
