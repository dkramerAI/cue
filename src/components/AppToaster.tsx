"use client";

import { Toaster } from "sonner";
import { useAppearance } from "@/hooks/useAppearance";

/** Toaster whose theme tracks the app's appearance setting (incl. manual override). */
export function AppToaster() {
  const [appearance] = useAppearance();
  return <Toaster position="top-center" theme={appearance === "auto" ? "system" : appearance} richColors closeButton />;
}
