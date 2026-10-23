import { useCallback, useMemo, useSyncExternalStore, type SetStateAction } from "react";

// Editing state only. Never a monitoring result cache or a submitted workflow.
// Keep it outside mounted panels so collapsing, navigation and filtering are safe.
const snapshots = new Map<string, string | null>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function read(key: string) {
  if (!snapshots.has(key)) {
    try { snapshots.set(key, typeof window === "undefined" ? null : window.sessionStorage.getItem(key)); }
    catch { snapshots.set(key, null); }
  }
  return snapshots.get(key) ?? null;
}
function decode<T>(raw: string | null, fallback: T): { value: T; persisted: boolean } {
  try {
    const record = raw ? JSON.parse(raw) : null;
    return record && "value" in record ? record : { value: fallback, persisted: false };
  } catch { return { value: fallback, persisted: false }; }
}

export function useOverviewDraft<T>(key: string, fallback: T) {
  const getSnapshot = useCallback(() => read(key), [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const record = useMemo(() => decode(raw, fallback), [raw, fallback]);
  const setValue = (action: SetStateAction<T>) => {
    const previous = decode(read(key), fallback).value;
    const value = typeof action === "function" ? (action as (value: T) => T)(previous) : action;
    let next = JSON.stringify({ value, persisted: true });
    try { window.sessionStorage.setItem(key, next); }
    catch { next = JSON.stringify({ value, persisted: false }); }
    snapshots.set(key, next);
    listeners.forEach(listener => listener());
  };
  return [record.value, setValue, record.persisted] as const;
}
