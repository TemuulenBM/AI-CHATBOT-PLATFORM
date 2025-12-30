/**
 * Privacy Policy Page
 *
 * Displays the active privacy policy with version information
 * Allows users to view historical versions
 *
 * GDPR Articles: 12-14 (Transparency and Information)
 */

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

interface PolicyVersion {
  id: string;
  version: string;
  effective_date: string;
  is_active: boolean;
}

interface PrivacyPolicy {
  id: string;
  version: string;
  content: string;
  effectiveDate: string;
  createdAt: string;
  is_active?: boolean;
}

export default function PrivacyPolicyPage() {
  const [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadActivePolicy();
    loadVersions();
  }, []);

  const loadActivePolicy = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/gdpr/privacy-policy');

      if (!response.ok) {
        throw new Error('Failed to load privacy policy');
      }

      const data = await response.json();
      setPolicy(data);
      setSelectedVersion(data.version);
    } catch (err) {
      console.error('Error loading privacy policy:', err);
      setError('Failed to load privacy policy. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadVersions = async () => {
    try {
      const response = await fetch('/api/gdpr/privacy-policy/versions');

      if (!response.ok) {
        throw new Error('Failed to load policy versions');
      }

      const data = await response.json();
      setVersions(data.versions || []);
    } catch (err) {
      console.error('Error loading policy versions:', err);
    }
  };

  const handleVersionChange = async (version: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setSelectedVersion(version);

      const response = await fetch(`/api/gdpr/privacy-policy/${version}`);

      if (!response.ok) {
        throw new Error('Failed to load policy version');
      }

      const data = await response.json();
      setPolicy(data);
    } catch (err) {
      console.error('Error loading policy version:', err);
      setError('Failed to load selected version. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2 text-destructive">Error</h2>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={loadActivePolicy} variant="outline" className="mt-4">
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-4xl font-bold">Privacy Policy</h1>
          {policy?.is_active && (
            <Badge variant="default">Current Version</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : policy ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-muted-foreground">
            <div>
              <span className="font-medium">Version:</span> {policy.version}
            </div>
            <div className="hidden sm:block">•</div>
            <div>
              <span className="font-medium">Effective Date:</span>{' '}
              {formatDate(policy.effectiveDate)}
            </div>
          </div>
        ) : null}

        {/* Version Selector */}
        {versions.length > 1 && (
          <div className="mt-4">
            <label className="text-sm font-medium mb-2 block">
              View Previous Version:
            </label>
            <Select value={selectedVersion} onValueChange={handleVersionChange}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.version} value={v.version}>
                    Version {v.version} {v.is_active && '(Current)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Policy Content */}
      <Card className="p-6 sm:p-8">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-full mt-8" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : policy ? (
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-3xl font-bold mb-4 mt-8 first:mt-0">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-2xl font-bold mb-3 mt-6">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xl font-semibold mb-2 mt-4">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="mb-4 leading-7">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-6 mb-4 space-y-2">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="leading-7">{children}</li>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-primary underline hover:text-primary/80"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold">{children}</strong>
                ),
              }}
            >
              {policy.content}
            </ReactMarkdown>
          </div>
        ) : null}
      </Card>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>
          For questions or concerns about this privacy policy, please contact us at{' '}
          <a href="mailto:privacy@convoai.com" className="underline hover:text-primary">
            privacy@convoai.com
          </a>
        </p>
        <p className="mt-2">
          <a href="/" className="underline hover:text-primary">
            Return to Home
          </a>
        </p>
      </div>
    </div>
  );
}
