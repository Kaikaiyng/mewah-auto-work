import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./api";

export function useApiData<T>(mode: string, fallback: T, enabled = true) {
  const [data, setData] = useState<T>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      setError("");
      return;
    }
    setIsLoading(true);

    try {
      const nextData = await apiRequest<T>(mode);
      setData(nextData);
      setHasLoaded(true);
      setError("");
    } catch (apiError) {
      setHasLoaded(false);
      setError(apiError instanceof Error ? apiError.message : "Unable to load data");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, mode]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, isLoading, error, hasLoaded, setData, reload };
}
