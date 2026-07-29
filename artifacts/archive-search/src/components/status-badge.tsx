import { cn } from "@/lib/utils";
import { BookStatus } from "@workspace/api-client-react";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

interface StatusBadgeProps {
  status: BookStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = {
    pending: {
      label: "Pending",
      icon: Clock,
      className: "bg-muted text-muted-foreground border-muted-foreground/20",
    },
    processing: {
      label: "Processing",
      icon: Loader2,
      className: "bg-primary/10 text-primary border-primary/20",
      animate: true,
    },
    ready: {
      label: "Ready",
      icon: CheckCircle2,
      className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
    },
    error: {
      label: "Error",
      icon: XCircle,
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
  };

  const { label, icon: Icon, className: statusClassName, animate } = config[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border",
        statusClassName,
        className
      )}
    >
      <Icon className={cn("w-3.5 h-3.5", animate && "animate-spin")} />
      {label}
    </span>
  );
}
