import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  CreditCard,
  BarChart3,
  Crown,
  Loader2,
  ExternalLink,
  AlertCircle,
  Bot,
  MessageSquare,
  Zap,
  Calendar,
  CheckCircle2,
} from "lucide-react";

// Paddle.js type declarations
declare global {
  interface Window {
    Paddle?: {
      Environment: {
        set: (env: "sandbox" | "production") => void;
      };
      Initialize: (options: { token: string }) => void;
      Checkout: {
        open: (options: {
          transactionId?: string;
          items?: Array<{ priceId: string; quantity: number }>;
          customer?: { id: string };
          customData?: Record<string, string>;
          settings?: {
            displayMode?: "overlay" | "inline";
            theme?: "light" | "dark";
            locale?: string;
            successUrl?: string;
          };
        }) => void;
      };
    };
  }
}

// Plan limits (should match server/utils/supabase.ts)
const PLAN_LIMITS = {
  free: {
    chatbots: 1,
    messages: 100,
    price: 0,
  },
  starter: {
    chatbots: 3,
    messages: 2000,
    price: 4900,
  },
  growth: {
    chatbots: 10,
    messages: 10000,
    price: 9900,
  },
  business: {
    chatbots: 999,
    messages: 50000,
    price: 29900,
  },
} as const;

type PlanType = keyof typeof PLAN_LIMITS;

interface SubscriptionData {
  plan: PlanType;
  usage: {
    messages_count: number;
    chatbots_count: number;
  };
  limits: {
    chatbots: number;
    messages: number;
    price: number;
  };
  current_period_end?: string;
  stripe_customer_id?: string | null;
  paddle_customer_id?: string | null;
}

const planFeatures: Record<PlanType, string[]> = {
  free: ["1 chatbot", "100 messages/month", "Basic analytics", "Community support"],
  starter: ["3 chatbots", "2,000 messages/month", "Advanced analytics", "Email support", "Custom branding"],
  growth: ["10 chatbots", "10,000 messages/month", "Priority support", "Remove branding", "API access", "GPT-5 support"],
  business: ["Unlimited chatbots", "50,000 messages/month", "Dedicated support", "White-label option", "Custom integrations", "SLA guarantee"],
};

const planColors: Record<PlanType, string> = {
  free: "bg-slate-500",
  starter: "bg-blue-500",
  growth: "bg-purple-500",
  business: "bg-amber-500",
};

export default function Settings() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState<PlanType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paddleInitialized = useRef(false);

  // Helper to get auth headers from Clerk token
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!getToken) return {};
    try {
      const token = await getToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, [getToken]);

  // Auth check
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation("/login");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  // Initialize Paddle.js
  useEffect(() => {
    if (paddleInitialized.current) return;

    const initPaddle = () => {
      if (window.Paddle) {
        // Get environment from env var or default to sandbox
        const paddleEnv = import.meta.env.VITE_PADDLE_ENVIRONMENT || "sandbox";
        const paddleToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;

        if (paddleToken) {
          window.Paddle.Environment.set(paddleEnv === "production" ? "production" : "sandbox");
          window.Paddle.Initialize({ token: paddleToken });
          paddleInitialized.current = true;
        }
      }
    };

    // Check if Paddle is already loaded
    if (window.Paddle) {
      initPaddle();
      return;
    }

    // Load Paddle.js script
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = initPaddle;
    document.head.appendChild(script);

    return () => {
      // Cleanup script if component unmounts before load
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // Fetch subscription data
  const fetchSubscription = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const authHeaders = await getAuthHeaders();

      // If no auth token available, use default free plan
      if (!authHeaders.Authorization) {
        setSubscription({
          plan: "free",
          usage: { messages_count: 0, chatbots_count: 0 },
          limits: PLAN_LIMITS.free,
        });
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/subscriptions", {
        headers: authHeaders,
      });

      if (!response.ok) {
        // If auth fails, show default free plan
        if (response.status === 401) {
          setSubscription({
            plan: "free",
            usage: { messages_count: 0, chatbots_count: 0 },
            limits: PLAN_LIMITS.free,
          });
          setIsLoading(false);
          return;
        }
        throw new Error("Failed to fetch subscription data");
      }

      const data = await response.json();
      setSubscription(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      // Fall back to free plan on error
      setSubscription({
        plan: "free",
        usage: { messages_count: 0, chatbots_count: 0 },
        limits: PLAN_LIMITS.free,
      });
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isSignedIn) {
      fetchSubscription();
    }
  }, [isSignedIn, fetchSubscription]);

  const openBillingPortal = async () => {
    if (!subscription?.paddle_customer_id && !subscription?.stripe_customer_id) {
      toast({
        title: "No billing account",
        description: "You don't have an active subscription to manage.",
        variant: "destructive",
      });
      return;
    }

    setIsPortalLoading(true);

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch("/api/subscriptions/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          returnUrl: window.location.href,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to open billing portal");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsPortalLoading(false);
    }
  };

  const handleUpgrade = async (plan: PlanType) => {
    if (plan === "free" || plan === subscription?.plan) return;

    setIsUpgrading(plan);

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          plan,
          successUrl: `${window.location.origin}/dashboard/settings?success=true`,
          cancelUrl: `${window.location.origin}/dashboard/settings?canceled=true`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const { url } = await response.json();

      // Check if this is Paddle checkout data (starts with paddle_checkout:)
      if (url.startsWith("paddle_checkout:")) {
        const base64Data = url.replace("paddle_checkout:", "");
        const checkoutData = JSON.parse(atob(base64Data));

        // Check if Paddle.js is loaded
        if (!window.Paddle) {
          throw new Error("Payment system is loading. Please try again in a moment.");
        }

        // Open Paddle checkout overlay with items array
        // Note: Don't pass customer.id for new checkouts without saved payment methods
        // The customData will link the transaction to our user via webhook
        window.Paddle.Checkout.open({
          items: [{ priceId: checkoutData.priceId, quantity: 1 }],
          customData: checkoutData.customData,
          settings: {
            displayMode: "overlay",
            theme: "dark",
            successUrl: checkoutData.successUrl,
          },
        });
      } else if (url.startsWith("paddle_txn:")) {
        // Legacy: transaction ID based checkout
        const transactionId = url.replace("paddle_txn:", "");

        if (!window.Paddle) {
          throw new Error("Payment system is loading. Please try again in a moment.");
        }

        window.Paddle.Checkout.open({
          transactionId,
          settings: {
            displayMode: "overlay",
            theme: "dark",
            successUrl: `${window.location.origin}/dashboard/settings?success=true`,
          },
        });
      } else {
        // Fallback to redirect for other URL types
        window.location.href = url;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsUpgrading(null);
    }
  };

  // Calculate usage percentages
  const messagesUsagePercent = subscription
    ? Math.min(100, (subscription.usage.messages_count / subscription.limits.messages) * 100)
    : 0;
  const chatbotsUsagePercent = subscription
    ? Math.min(100, (subscription.usage.chatbots_count / subscription.limits.chatbots) * 100)
    : 0;

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`;
  };

  if (!isLoaded || (isLoaded && !isSignedIn)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="md:pl-64 px-4 md:px-8 pt-4 md:pt-8 pb-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Settings</h1>
            <p className="text-muted-foreground">
              Manage your account, subscription, and billing preferences.
            </p>
          </header>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {error}
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchSubscription}
                className="ml-auto"
              >
                Retry
              </Button>
            </div>
          )}

          <div className="grid gap-6">
            {/* Profile Section */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Profile</h2>
                  <p className="text-sm text-muted-foreground">Your account information</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
                  {user?.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt="Profile"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    user?.firstName?.charAt(0) ||
                    user?.emailAddresses?.[0]?.emailAddress?.charAt(0)?.toUpperCase() ||
                    "U"
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">
                    {user?.fullName ||
                      user?.firstName ||
                      user?.emailAddresses?.[0]?.emailAddress?.split("@")[0]}
                  </h3>
                  <p className="text-muted-foreground">
                    {user?.emailAddresses?.[0]?.emailAddress}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Member since{" "}
                    {user?.createdAt
                      ? new Date(user.createdAt).toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        })
                      : "N/A"}
                  </p>
                </div>
              </div>
            </GlassCard>

            {/* Subscription Section */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Subscription</h2>
                  <p className="text-sm text-muted-foreground">Your current plan and limits</p>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : subscription ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge
                        className={`${planColors[subscription.plan]} text-white border-0`}
                      >
                        {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                      </Badge>
                      {subscription.plan !== "free" && (
                        <span className="text-sm text-muted-foreground">
                          {formatPrice(subscription.limits.price)}/month
                        </span>
                      )}
                    </div>
                    {subscription.current_period_end && subscription.plan !== "free" && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Renews {formatDate(subscription.current_period_end)}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {planFeatures[subscription.plan].map((feature, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        {feature}
                      </div>
                    ))}
                  </div>

                  {subscription.plan !== "business" && (
                    <div className="pt-4 border-t border-white/10">
                      <p className="text-sm text-muted-foreground mb-3">Upgrade for more features</p>
                      <div className="flex gap-2 flex-wrap">
                        {(["starter", "growth", "business"] as PlanType[])
                          .filter((plan) => {
                            const planIndex = ["free", "starter", "growth", "business"].indexOf(plan);
                            const currentIndex = ["free", "starter", "growth", "business"].indexOf(subscription.plan);
                            return planIndex > currentIndex;
                          })
                          .map((plan) => (
                            <Button
                              key={plan}
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpgrade(plan)}
                              disabled={isUpgrading !== null}
                              className="gap-2"
                            >
                              {isUpgrading === plan ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <Zap className="h-4 w-4" />
                                  Upgrade to {plan.charAt(0).toUpperCase() + plan.slice(1)}
                                </>
                              )}
                            </Button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Unable to load subscription data</p>
              )}
            </GlassCard>

            {/* Usage Section */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Usage</h2>
                  <p className="text-sm text-muted-foreground">Your current usage this billing period</p>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : subscription ? (
                <div className="space-y-6">
                  {/* Messages Usage */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Messages</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {subscription.usage.messages_count.toLocaleString()} /{" "}
                        {subscription.limits.messages.toLocaleString()}
                      </span>
                    </div>
                    <Progress
                      value={messagesUsagePercent}
                      className={`h-2 ${messagesUsagePercent > 90 ? "[&>div]:bg-red-500" : messagesUsagePercent > 75 ? "[&>div]:bg-yellow-500" : ""}`}
                    />
                    {messagesUsagePercent > 90 && (
                      <p className="text-xs text-red-400 mt-1">
                        You're running low on messages. Consider upgrading your plan.
                      </p>
                    )}
                  </div>

                  {/* Chatbots Usage */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Chatbots</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {subscription.usage.chatbots_count} /{" "}
                        {subscription.limits.chatbots >= 999 ? "Unlimited" : subscription.limits.chatbots}
                      </span>
                    </div>
                    <Progress
                      value={subscription.limits.chatbots >= 999 ? 5 : chatbotsUsagePercent}
                      className={`h-2 ${chatbotsUsagePercent >= 100 && subscription.limits.chatbots < 999 ? "[&>div]:bg-red-500" : ""}`}
                    />
                    {chatbotsUsagePercent >= 100 && subscription.limits.chatbots < 999 && (
                      <p className="text-xs text-red-400 mt-1">
                        You've reached your chatbot limit. Upgrade to create more.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Unable to load usage data</p>
              )}
            </GlassCard>

            {/* Billing Section */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Billing</h2>
                  <p className="text-sm text-muted-foreground">Manage your payment methods and invoices</p>
                </div>
              </div>

              <div className="space-y-4">
                {(subscription?.paddle_customer_id || subscription?.stripe_customer_id) ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Access the customer portal to manage your payment methods, view invoices, and update billing information.
                    </p>
                    <Button
                      onClick={openBillingPortal}
                      disabled={isPortalLoading}
                      className="gap-2"
                    >
                      {isPortalLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Opening...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4" />
                          Manage Billing
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <CreditCard className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground mb-4">
                      You're on the free plan. Upgrade to access billing management.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => handleUpgrade("starter")}
                      disabled={isUpgrading !== null}
                      className="gap-2"
                    >
                      {isUpgrading === "starter" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4" />
                          Upgrade Now
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  );
}

