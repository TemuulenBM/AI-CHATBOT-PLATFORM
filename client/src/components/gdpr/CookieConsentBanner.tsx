/**
 * GDPR Cookie Consent Banner
 *
 * Displays a cookie consent banner to users and allows them to manage their
 * consent preferences for essential, analytics, and marketing cookies.
 *
 * Features:
 * - Granular consent controls (essential, analytics, marketing)
 * - Remembers consent preferences in localStorage
 * - Stores consent proof in database (IP, timestamp, version)
 * - Works for both authenticated and anonymous users
 */

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { X } from 'lucide-react';
import { getCsrfHeaders } from '../../hooks/use-csrf';
import { useToast } from '@/hooks/use-toast';

interface ConsentPreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

export const CookieConsentBanner: React.FC = () => {
  const { toast } = useToast();
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    essential: true, // Always true
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    checkConsentStatus();
  }, []);

  /**
   * Check if user has already given consent
   */
  const checkConsentStatus = async () => {
    try {
      // Check localStorage first for quick check
      const storedConsent = localStorage.getItem('cookieConsent');
      if (storedConsent) {
        // User has already consented
        setIsVisible(false);
        return;
      }

      // Get or create anonymous ID
      const anonymousId = getOrCreateAnonymousId();

      // Check server for consent status
      const response = await fetch(`/api/gdpr/consent?anonymousId=${anonymousId}`);
      const data = await response.json();

      if (data.hasConsent && data.consents) {
        // User has consents on server
        localStorage.setItem('cookieConsent', JSON.stringify(data.consents));
        setIsVisible(false);
      } else {
        // No consent found, show banner
        setIsVisible(true);
      }
    } catch (error) {
      console.error('Error checking consent status:', error);
      // Show banner on error to be safe
      setIsVisible(true);
    }
  };

  /**
   * Get or create anonymous ID for non-authenticated users
   */
  const getOrCreateAnonymousId = (): string => {
    let anonymousId = localStorage.getItem('anonymousId');

    if (!anonymousId) {
      anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('anonymousId', anonymousId);
    }

    return anonymousId;
  };

  /**
   * Handle "Accept All" button click
   */
  const handleAcceptAll = async () => {
    await saveConsent({ essential: true, analytics: true, marketing: true });
  };

  /**
   * Handle "Essential Only" button click
   */
  const handleAcceptEssential = async () => {
    await saveConsent({ essential: true, analytics: false, marketing: false });
  };

  /**
   * Handle "Save Preferences" button click
   */
  const handleSavePreferences = async () => {
    await saveConsent(preferences);
  };

  /**
   * Save consent preferences to server and localStorage
   */
  const saveConsent = async (prefs: ConsentPreferences) => {
    setIsLoading(true);

    try {
      const anonymousId = getOrCreateAnonymousId();

      const response = await fetch('/api/gdpr/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({
          ...prefs,
          anonymousId,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to save consent preferences';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
          if (errorData.details) {
            errorMessage += `: ${Array.isArray(errorData.details) ? errorData.details.join(', ') : errorData.details}`;
          }
        } catch (parseError) {
          // If response is not JSON, use default message
          errorMessage = `Failed to save consent preferences (${response.status} ${response.statusText})`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Store consent in localStorage for quick checks
      localStorage.setItem('cookieConsent', JSON.stringify(data.consents));

      // Apply consent preferences
      applyConsentPreferences(prefs);

      // Show success toast
      toast({
        title: 'Preferences saved',
        description: 'Your cookie preferences have been saved successfully.',
        variant: 'default',
      });

      // Hide banner
      setIsVisible(false);
    } catch (error) {
      console.error('Error saving consent:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save consent preferences. Please try again.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Apply consent preferences (enable/disable tracking)
   */
  const applyConsentPreferences = (prefs: ConsentPreferences) => {
    // Analytics consent
    if (!prefs.analytics) {
      // Disable analytics tracking
      // TODO: Add your analytics disable code here
      console.log('Analytics tracking disabled');
    }

    // Marketing consent
    if (!prefs.marketing) {
      // Disable marketing cookies
      // TODO: Add your marketing cookie disable code here
      console.log('Marketing cookies disabled');
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-black/50 to-transparent pointer-events-none">
      <Card className="max-w-4xl mx-auto p-6 shadow-2xl pointer-events-auto">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">We value your privacy</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsVisible(false)}
            className="h-6 w-6 p-0"
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          We use cookies to enhance your browsing experience, serve personalized content, and
          analyze our traffic. By clicking "Accept All", you consent to our use of cookies.{' '}
          <a href="/privacy-policy" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">
            Read our Privacy Policy
          </a>
        </p>

        {showDetails && (
          <div className="space-y-3 mb-4 p-4 bg-muted rounded-lg">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="essential"
                checked={preferences.essential}
                disabled
                className="mt-1"
              />
              <div className="flex-1">
                <label htmlFor="essential" className="text-sm font-medium">
                  Essential Cookies (Required)
                </label>
                <p className="text-xs text-muted-foreground">
                  Necessary for authentication, security, and basic site functionality.
                  These cookies are required for the service to work properly.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="analytics"
                checked={preferences.analytics}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, analytics: !!checked }))
                }
                className="mt-1"
                disabled={isLoading}
              />
              <div className="flex-1">
                <label htmlFor="analytics" className="text-sm font-medium cursor-pointer">
                  Analytics Cookies
                </label>
                <p className="text-xs text-muted-foreground">
                  Help us understand how you use our service to improve your experience.
                  We use this data to enhance our platform and fix issues.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="marketing"
                checked={preferences.marketing}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, marketing: !!checked }))
                }
                className="mt-1"
                disabled={isLoading}
              />
              <div className="flex-1">
                <label htmlFor="marketing" className="text-sm font-medium cursor-pointer">
                  Marketing Cookies
                </label>
                <p className="text-xs text-muted-foreground">
                  Used to deliver personalized advertisements and measure campaign effectiveness.
                  We may share this data with advertising partners.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleAcceptAll}
            className="flex-1 sm:flex-none"
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Accept All'}
          </Button>
          <Button
            onClick={handleAcceptEssential}
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={isLoading}
          >
            Essential Only
          </Button>
          {showDetails ? (
            <Button
              onClick={handleSavePreferences}
              variant="secondary"
              className="flex-1 sm:flex-none"
              disabled={isLoading}
            >
              Save Preferences
            </Button>
          ) : (
            <Button
              onClick={() => setShowDetails(true)}
              variant="ghost"
              className="flex-1 sm:flex-none"
              disabled={isLoading}
            >
              Customize
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
