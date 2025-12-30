/**
 * GDPR Account Deletion Section Component
 *
 * Allows users to request account deletion with 30-day grace period
 * GDPR Article 17: Right to Erasure ("Right to be Forgotten")
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  Trash2,
  Loader2,
  XCircle,
  Clock,
  CheckCircle2,
  Shield,
  Calendar,
} from 'lucide-react';

interface DeletionRequest {
  id: string;
  status: string;
  reason: string | null;
  requestedAt: string;
  scheduledDeletionDate: string;
  completedAt: string | null;
  canCancel: boolean;
}

export function AccountDeletionSection() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [reason, setReason] = useState('');
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);

  const getAuthHeaders = useCallback(async () => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const fetchDeletionStatus = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/gdpr/delete-account/status', { headers });

      if (response.ok) {
        const data = await response.json();
        setDeletionRequest(data.request || null);
      }
    } catch (error) {
      console.error('Error fetching deletion status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchDeletionStatus();
  }, [fetchDeletionStatus]);

  const requestDeletion = async () => {
    if (!confirmEmail || !user?.primaryEmailAddress?.emailAddress) {
      toast({
        title: 'Email required',
        description: 'Please enter your email to confirm deletion.',
        variant: 'destructive',
      });
      return;
    }

    if (confirmEmail.toLowerCase() !== user.primaryEmailAddress.emailAddress.toLowerCase()) {
      toast({
        title: 'Email mismatch',
        description: 'The email you entered does not match your account email.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/gdpr/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          confirmEmail,
          reason: reason.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request deletion');
      }

      toast({
        title: 'Deletion requested',
        description: `Your account will be deleted on ${new Date(data.scheduledDeletionDate).toLocaleDateString()}. You can cancel this within 30 days.`,
      });

      // Clear form
      setConfirmEmail('');
      setReason('');

      // Refresh status
      fetchDeletionStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to request deletion';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelDeletion = async () => {
    if (!deletionRequest) return;

    setIsCancelling(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/gdpr/delete-account/${deletionRequest.id}`, {
        method: 'DELETE',
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel deletion');
      }

      toast({
        title: 'Deletion cancelled',
        description: 'Your account deletion request has been cancelled.',
      });

      // Refresh status
      fetchDeletionStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel deletion';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const getDaysRemaining = (scheduledDate: string) => {
    const now = new Date();
    const scheduled = new Date(scheduledDate);
    const diffTime = scheduled.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show pending deletion status
  if (deletionRequest && deletionRequest.status === 'pending') {
    const daysRemaining = getDaysRemaining(deletionRequest.scheduledDeletionDate);

    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-red-400" />
            <h3 className="font-medium text-red-400">Account Deletion Scheduled</h3>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Requested:</span>
              <span>{formatDate(deletionRequest.requestedAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Scheduled for:</span>
              <span className="text-red-400 font-medium">
                {formatDate(deletionRequest.scheduledDeletionDate)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Days remaining:</span>
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                {daysRemaining} days
              </Badge>
            </div>
          </div>

          {deletionRequest.reason && (
            <div className="pt-2 border-t border-white/10">
              <p className="text-xs text-muted-foreground mb-1">Reason:</p>
              <p className="text-sm">{deletionRequest.reason}</p>
            </div>
          )}

          <div className="flex items-start gap-2 pt-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Your account and all associated data will be permanently deleted after the grace period.
              You can cancel this request at any time before the scheduled deletion date.
            </p>
          </div>

          {deletionRequest.canCancel && (
            <Button
              onClick={cancelDeletion}
              disabled={isCancelling}
              variant="outline"
              className="w-full gap-2"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Cancel Deletion Request
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Show completed deletion status (shouldn't happen, but just in case)
  if (deletionRequest && deletionRequest.status === 'completed') {
    return (
      <div className="p-4 rounded-lg border border-green-500/20 bg-green-500/10 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          <h3 className="font-medium text-green-400">Account Deleted</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Your account has been deleted on {formatDate(deletionRequest.completedAt!)}.
        </p>
      </div>
    );
  }

  // Show deletion request form
  return (
    <div className="space-y-4">
      {/* Warning */}
      <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <h3 className="font-medium text-red-400">Permanent Action</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Deleting your account will permanently remove all your data including chatbots,
          conversations, analytics, and subscriptions. This action cannot be undone after the
          30-day grace period.
        </p>
      </div>

      {/* What will be deleted */}
      <div className="p-4 rounded-lg border border-white/10 bg-black/20 space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          What will be deleted:
        </h3>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
            Your profile and account information
          </li>
          <li className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
            All chatbots and their training data
          </li>
          <li className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
            Conversation history and messages
          </li>
          <li className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
            Analytics and usage data
          </li>
          <li className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
            Consent preferences and privacy settings
          </li>
        </ul>
        <p className="text-xs text-muted-foreground pt-2 border-t border-white/10">
          Note: Billing records will be anonymized (not deleted) for legal compliance purposes.
        </p>
      </div>

      {/* Grace period info */}
      <div className="p-4 rounded-lg border border-blue-500/20 bg-blue-500/10 space-y-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-medium text-blue-400">30-Day Grace Period</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          After requesting deletion, you have 30 days to change your mind and cancel the request.
          Your account will remain active during this period.
        </p>
      </div>

      {/* Deletion form */}
      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Confirm your email to proceed
          </label>
          <Input
            type="email"
            placeholder={user?.primaryEmailAddress?.emailAddress || 'your.email@example.com'}
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            className="bg-black/40 border-white/10"
          />
          <p className="text-xs text-muted-foreground">
            Type your email address to confirm you want to delete your account
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Reason for deletion (optional)
          </label>
          <Textarea
            placeholder="Help us improve by telling us why you're leaving..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="bg-black/40 border-white/10 resize-none"
          />
        </div>

        <Button
          onClick={requestDeletion}
          disabled={isSubmitting || !confirmEmail}
          variant="destructive"
          className="w-full gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Requesting Deletion...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4" />
              Request Account Deletion
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
