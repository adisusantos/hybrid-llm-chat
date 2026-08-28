"use client";

import { AlertCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  message: string;
  canRetry?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ErrorBanner({ message, canRetry, onRetry, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="border-t border-destructive/30 bg-destructive/10 flex items-start gap-3 px-4 py-3"
    >
      <AlertCircle className="text-destructive mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p className="text-destructive text-sm font-medium">Something went wrong</p>
        <p className="text-destructive/80 mt-0.5 text-xs">{message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" /> Retry
          </Button>
        )}
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="size-7"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
