import { Badge } from "@/components/ui/badge";
import { Clock, Loader2, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScrapeStatus = "pending" | "in_progress" | "completed" | "failed";

interface ScrapeStatusBadgeProps {
  status: ScrapeStatus;
  pagesScraped?: number;
  embeddingsCreated?: number;
  className?: string;
}

export function ScrapeStatusBadge({
  status,
  pagesScraped,
  embeddingsCreated,
  className,
}: ScrapeStatusBadgeProps) {
  const statusConfig = {
    pending: {
      icon: Clock,
      text: "Queued for indexing...",
      className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
      iconClassName: "",
    },
    in_progress: {
      icon: Loader2,
      text: pagesScraped
        ? `Indexing ${pagesScraped} pages...`
        : embeddingsCreated
        ? "Creating embeddings..."
        : "Indexing...",
      className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
      iconClassName: "animate-spin",
    },
    completed: {
      icon: CheckCircle,
      text: "Done",
      className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
      iconClassName: "",
    },
    failed: {
      icon: XCircle,
      text: "Failed",
      className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
      iconClassName: "",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "flex items-center gap-1.5 w-fit border",
        config.className,
        className
      )}
    >
      <Icon className={cn("h-3 w-3", config.iconClassName)} />
      <span>{config.text}</span>
    </Badge>
  );
}
