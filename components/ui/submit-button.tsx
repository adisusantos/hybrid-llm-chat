"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Button yang otomatis disable dan tampilkan loading text
 * saat form Server Action sedang diproses.
 * Ini satu-satunya client component yang diperlukan — sangat ringan.
 */
export function SubmitButton({ children, loadingText, className, disabled }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isLoading = pending;

  return (
    <button
      type="submit"
      disabled={disabled || isLoading}
      className={className}
      aria-busy={isLoading}
    >
      {isLoading ? (loadingText ?? "Loading…") : children}
    </button>
  );
}
