"use client"

// Sonner-backed toast surface (Watermelon pattern). The call signature is
// preserved from the previous shadcn reducer implementation so existing
// callers keep working: toast({ title, description?, variant? }).
import * as React from "react"
import { toast as sonnerToast } from "sonner"

export type { ToastActionElement, ToastProps } from "@/components/ui/toast"

export interface ToastCall {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive"
  action?: React.ReactNode
}

export function useToast() {
  return {
    toasts: [] as ToastCall[],
    dismiss: (toastId?: string | number) => void sonnerToast.dismiss(toastId),
    toast
  }
}

/** Standalone imperative toast — same call shape as the previous reducer API. */
export const toast = ({ title, description, variant }: ToastCall) => {
  if (variant === "destructive") {
    sonnerToast.error(title, { description })
    return
  }
  sonnerToast(title, { description })
}
