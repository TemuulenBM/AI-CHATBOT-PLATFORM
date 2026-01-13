import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrapeStatusBadge } from "./ScrapeStatusBadge";
import { ScrapeHistoryEntry } from "@/hooks/useScrapeStatus";
import { format } from "date-fns";
import { RefreshCw } from "lucide-react";

interface ScrapeProgressCardProps {
  chatbotId: string;
  history: ScrapeHistoryEntry[];
  lastScrapedAt: string | null;
  nextScheduledScrape: string | null;
  onManualRescrape?: () => void;
  isRescraping?: boolean;
}

export function ScrapeProgressCard({
  history,
  lastScrapedAt,
  nextScheduledScrape,
  onManualRescrape,
  isRescraping = false,
}: ScrapeProgressCardProps) {
  const latestScrape = history[0];

  // Calculate progress percentage (rough estimate based on pages scraped)
  const calculateProgress = (): number => {
    if (!latestScrape || latestScrape.status !== "in_progress") return 0;

    // Rough estimation: assume max 200 pages as a baseline
    // This could be improved by passing the plan limit
    const estimatedTotal = 200;
    const progress = (latestScrape.pages_scraped / estimatedTotal) * 100;
    return Math.min(progress, 95); // Cap at 95% until completion
  };

  const progressValue = calculateProgress();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Indexing Status</CardTitle>
          {latestScrape && (
            <ScrapeStatusBadge
              status={latestScrape.status}
              pagesScraped={latestScrape.pages_scraped}
              embeddingsCreated={latestScrape.embeddings_created}
            />
          )}
        </div>
        <CardDescription>
          {lastScrapedAt
            ? `Last indexed: ${format(new Date(lastScrapedAt), "MMM d, yyyy 'at' h:mm a")}`
            : "Not yet indexed"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress bar for in-progress scrapes */}
        {latestScrape?.status === "in_progress" && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {latestScrape.pages_scraped} pages indexed
              </span>
              <span className="text-muted-foreground">{Math.round(progressValue)}%</span>
            </div>
            <Progress value={progressValue} className="h-2" />
            <p className="text-xs text-muted-foreground">
              This may take a few minutes...
            </p>
          </div>
        )}

        {/* Error message for failed scrapes */}
        {latestScrape?.status === "failed" && latestScrape.error_message && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-400">
            <p className="font-medium">Indexing failed</p>
            <p className="mt-1">{latestScrape.error_message}</p>
          </div>
        )}

        {/* Completed status */}
        {latestScrape?.status === "completed" && (
          <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-800 dark:text-green-400">
            <p>
              Successfully indexed <span className="font-medium">{latestScrape.pages_scraped}</span> pages
              and created <span className="font-medium">{latestScrape.embeddings_created}</span> embeddings
            </p>
          </div>
        )}

        {/* Next scheduled scrape */}
        {nextScheduledScrape && (
          <p className="text-sm text-muted-foreground">
            Next scheduled index: {format(new Date(nextScheduledScrape), "MMM d, yyyy 'at' h:mm a")}
          </p>
        )}

        {/* Manual rescrape button */}
        {onManualRescrape && (
          <Button
            onClick={onManualRescrape}
            disabled={isRescraping || latestScrape?.status === "in_progress"}
            variant="outline"
            className="w-full"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRescraping ? "animate-spin" : ""}`} />
            {isRescraping ? "Re-indexing..." : "Re-index Now"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
