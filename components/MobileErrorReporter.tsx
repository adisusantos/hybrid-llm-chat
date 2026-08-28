"use client";

import { useEffect, useState } from "react";

type ErrorEntry = {
  message: string;
  source: string;
  lineno: number;
  colno: number;
  stack?: string;
  time: string;
};

/**
 * Mobile-debug helper: catches uncaught JS errors and shows them in a
 * small overlay at the top of the page. Only activates when the URL
 * contains `?debug=1` (so production use is unaffected).
 *
 * Use on mobile: open `http://<ip>:3000/?debug=1` — errors will appear
 * at the top. Tap the bar to toggle details. Tap the X to dismiss.
 */
export function MobileErrorReporter() {
  const [enabled, setEnabled] = useState(false);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!/[\?&]debug=1/.test(window.location.search)) return;
    setEnabled(true);

    const handler = (
      message: string | Event,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error,
    ) => {
      const entry: ErrorEntry = {
        message: typeof message === "string" ? message : String(message),
        source: source ?? "",
        lineno: lineno ?? 0,
        colno: colno ?? 0,
        stack: error?.stack,
        time: new Date().toLocaleTimeString(),
      };
      setErrors((prev) => [entry, ...prev].slice(0, 5));
    };

    const rejection = (e: PromiseRejectionEvent) => {
      handler(
        `Unhandled promise rejection: ${String(e.reason)}`,
        "",
        0,
        0,
        e.reason instanceof Error ? e.reason : undefined,
      );
    };

    window.addEventListener("error", handler as unknown as EventListener);
    window.addEventListener("unhandledrejection", rejection);
    return () => {
      window.removeEventListener("error", handler as unknown as EventListener);
      window.removeEventListener("unhandledrejection", rejection);
    };
  }, []);

  if (!enabled || errors.length === 0) return null;

  const last = errors[0]!;

  return (
    <div className="bg-destructive text-destructive-foreground fixed inset-x-0 top-0 z-[10000] text-xs">
      <div
        className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="truncate">
          ⚠ {errors.length} error{errors.length === 1 ? "" : "s"}: {last.message.slice(0, 80)}
        </span>
        <button
          type="button"
          className="opacity-70 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setErrors([]);
          }}
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div className="bg-destructive/95 border-t border-black/20 max-h-64 overflow-y-auto px-3 py-2">
          {errors.map((e, i) => (
            <div key={i} className="mb-2 border-b border-black/10 pb-2 last:border-b-0">
              <div className="font-mono">
                [{e.time}] {e.message}
              </div>
              {e.source && (
                <div className="opacity-70">
                  at {e.source}:{e.lineno}:{e.colno}
                </div>
              )}
              {e.stack && (
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] opacity-80">
                  {e.stack.slice(0, 500)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
