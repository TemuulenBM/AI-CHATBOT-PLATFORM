/**
 * GDPR Data Export Section Component
 *
 * Allows users to request and download their personal data exports
 * GDPR Article 15: Right of Access & Article 20: Data Portability
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useAuth } from '@clerk/clerk-react';
import { useToast } from '@/hooks/use-toast';
import {
  Download,
  FileArchive,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Calendar,
} from 'lucide-react';

interface ExportRequest {
  requestId: string;
  status: string;
  format: string;
  requestDate: string;
  completedAt: string | null;
  expiresAt: string | null;
  fileSizeMB: string | null;
  canDownload: boolean;
}

export function DataExportSection() {
  const { getToken } = useAuth();
  const { toast } = useToast();

  const [isRequesting, setIsRequesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [exports, setExports] = useState<ExportRequest[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async () => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const fetchExports = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/gdpr/data-export', { headers });

      if (response.ok) {
        const data = await response.json();
        setExports(data.exports || []);
      }
    } catch (error) {
      console.error('Error fetching exports:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchExports();
  }, [fetchExports]);

  const requestExport = async () => {
    setIsRequesting(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/gdpr/data-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ format: 'json' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request export');
      }

      toast({
        title: 'Export requested',
        description: 'Your data export has been queued. You will be able to download it within 24 hours.',
      });

      // Refresh the list
      fetchExports();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to request export';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const downloadExport = async (requestId: string) => {
    setDownloadingId(requestId);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/gdpr/data-export/${requestId}/download`, {
        headers,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to download export');
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `convoai-data-export-${requestId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Download started',
        description: 'Your data export is being downloaded.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download export';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case 'failed':
      case 'expired':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'failed':
      case 'expired':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'processing':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getExpirationDays = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Request a complete export of your personal data in a ZIP archive. Includes all chatbots,
            conversations, analytics, and subscription data.
          </p>
          <p className="text-xs text-muted-foreground">
            Export links expire 7 days after generation. You can request 1 export per 24 hours.
          </p>
        </div>
      </div>

      <Button
        onClick={requestExport}
        disabled={isRequesting || isLoading}
        className="gap-2"
      >
        {isRequesting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Requesting Export...
          </>
        ) : (
          <>
            <FileArchive className="h-4 w-4" />
            Request Data Export
          </>
        )}
      </Button>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : exports.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Export History</h3>
          {exports.map((exportReq) => (
            <div
              key={exportReq.requestId}
              className="p-4 rounded-lg border border-white/10 bg-black/20 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(exportReq.status)}
                  <Badge className={getStatusColor(exportReq.status)}>
                    {exportReq.status.charAt(0).toUpperCase() + exportReq.status.slice(1)}
                  </Badge>
                  {exportReq.fileSizeMB && (
                    <span className="text-xs text-muted-foreground">
                      {exportReq.fileSizeMB} MB
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(exportReq.requestDate)}
                </span>
              </div>

              {exportReq.canDownload && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Expires in {getExpirationDays(exportReq.expiresAt!)} days
                  </div>
                  <Button
                    size="sm"
                    onClick={() => downloadExport(exportReq.requestId)}
                    disabled={downloadingId === exportReq.requestId}
                    className="gap-2"
                  >
                    {downloadingId === exportReq.requestId ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="h-3 w-3" />
                        Download ZIP
                      </>
                    )}
                  </Button>
                </div>
              )}

              {exportReq.status === 'processing' && (
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <AlertCircle className="h-3 w-3" />
                  Your export is being generated. This may take a few minutes.
                </div>
              )}

              {exportReq.status === 'expired' && (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  This export has expired. Request a new one if needed.
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 border border-dashed border-white/10 rounded-lg">
          <FileArchive className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            No export requests yet. Request one to download your data.
          </p>
        </div>
      )}
    </div>
  );
}
