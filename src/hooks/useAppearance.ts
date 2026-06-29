"use client";

import { useCallback, useEffect, useState } from "react";

export type Appearance = "auto" | "light" | "dark";

const STORAGE_KEY = "cue_appearance";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(appearance: Appearance) {
  if (typeof document === "undefined") return;
  const dark = appearance === "dark" || (appearance === "auto" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/** Tri-state appearance control persisted to localStorage. */
export function useAppearance(): [Appearance, (value: Appearance) => void] {
  const [appearance, setAppearanceState] = useState<Appearance>("auto");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Appearance | null;
    if (stored === "auto" || stored === "light" || stored === "dark") {
      setAppearanceState(stored);
    }
  }, []);

  // Follow the system when set to auto.
  useEffect(() => {
    if (appearance !== "auto") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("auto");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [appearance]);

  const setAppearance = useCallback((value: Appearance) => {
    setAppearanceState(value);
    localStorage.setItem(STORAGE_KEY, value);
    apply(value);
  }, []);

  return [appearance, setAppearance];
}
