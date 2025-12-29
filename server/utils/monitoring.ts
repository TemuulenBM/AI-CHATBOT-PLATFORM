/**
 * Production Monitoring & Observability Utilities
 *
 * This module provides:
 * - APM integration with Sentry Performance
 * - Metrics collection and tracking
 * - Uptime monitoring utilities
 * - Real-time alerting for critical errors
 * - Database query performance monitoring
 */

import * as Sentry from "@sentry/node";
import logger from "./logger";

// ============================================
// Metrics Collection
// ============================================

interface MetricData {
  name: string;
  value: number;
  unit: "ms" | "count" | "bytes" | "percent";
  tags?: Record<string, string>;
  timestamp: Date;
}

interface MetricsStore {
  counters: Map<string, number>;
  gauges: Map<string, number>;
  histograms: Map<string, number[]>;
}

const metricsStore: MetricsStore = {
  counters: new Map(),
  gauges: new Map(),
  histograms: new Map(),
};

/**
 * Increment a counter metric
 */
export function incrementCounter(name: string, value = 1, tags?: Record<string, string>): void {
  const key = formatMetricKey(name, tags);
  const current = metricsStore.counters.get(key) || 0;
  metricsStore.counters.set(key, current + value);

  // Log metric for observability (Sentry metrics API varies by version)
  logger.debug("Metric counter incremented", { metric: name, value, tags });
}

/**
 * Set a gauge metric (point-in-time value)
 */
export function setGauge(name: string, value: number, tags?: Record<string, string>): void {
  const key = formatMetricKey(name, tags);
  metricsStore.gauges.set(key, value);

  logger.debug("Metric gauge set", { metric: name, value, tags });
}

/**
 * Record a value to a histogram (for distributions)
 */
export function recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
  const key = formatMetricKey(name, tags);
  const values = metricsStore.histograms.get(key) || [];
  values.push(value);

  // Keep only last 1000 values
  if (values.length > 1000) {
    values.shift();
  }
  metricsStore.histograms.set(key, values);

  logger.debug("Metric histogram recorded", { metric: name, value, tags });
}

/**
 * Get current metrics snapshot
 */
export function getMetricsSnapshot(): {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, { count: number; avg: number; p50: number; p95: number; p99: number }>;
} {
  const histogramStats: Record<string, { count: number; avg: number; p50: number; p95: number; p99: number }> = {};

  metricsStore.histograms.forEach((values, key) => {
    if (values.length === 0) return;

    const sorted = [...values].sort((a: number, b: number) => a - b);
    histogramStats[key] = {
      count: values.length,
      avg: values.reduce((a: number, b: number) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  });

  return {
    counters: Object.fromEntries(metricsStore.counters),
    gauges: Object.fromEntries(metricsStore.gauges),
    histograms: histogramStats,
  };
}

function formatMetricKey(name: string, tags?: Record<string, string>): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const tagStr = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  return `${name}{${tagStr}}`;
}

// ============================================
// APM / Performance Tracing
// ============================================

interface SpanOptions {
  name: string;
  op: string;
  description?: string;
  tags?: Record<string, string>;
}

/**
 * Start a performance span for tracing
 * Returns a function to end the span
 */
export function startSpan(options: SpanOptions): () => void {
  const startTime = Date.now();

  // Create Sentry span if available
  const span = process.env.SENTRY_DSN
    ? Sentry.startInactiveSpan({
        name: options.name,
        op: options.op,
        attributes: options.tags,
      })
    : null;

  return () => {
    const duration = Date.now() - startTime;
    span?.end();

    // Record to histogram
    recordHistogram(`span.duration.${options.op}`, duration, { name: options.name });

    // Log slow operations
    if (duration > 5000) {
      logger.warn("Slow operation detected", {
        category: "performance",
        operation: options.name,
        op: options.op,
        durationMs: duration,
        ...options.tags,
      });
    }
  };
}

/**
 * Wrap an async function with performance tracing
 */
export async function traceAsync<T>(
  options: SpanOptions,
  fn: () => Promise<T>
): Promise<T> {
  const endSpan = startSpan(options);
  try {
    return await fn();
  } finally {
    endSpan();
  }
}

// ============================================
// Database Query Performance Monitoring
// ============================================

interface QueryMetrics {
  query: string;
  durationMs: number;
  rowCount?: number;
  error?: string;
}

const queryMetrics: QueryMetrics[] = [];
const MAX_QUERY_METRICS = 1000;

/**
 * Record a database query for performance monitoring
 */
export function recordQueryMetrics(metrics: QueryMetrics): void {
  queryMetrics.push({ ...metrics, durationMs: Math.round(metrics.durationMs) });

  // Keep only recent queries
  if (queryMetrics.length > MAX_QUERY_METRICS) {
    queryMetrics.shift();
  }

  // Record to histogram
  recordHistogram("db.query.duration", metrics.durationMs);

  // Log slow queries
  if (metrics.durationMs > 1000) {
    logger.warn("Slow database query", {
      category: "performance",
      query: metrics.query.substring(0, 200),
      durationMs: metrics.durationMs,
      rowCount: metrics.rowCount,
    });
  }

  // Track in Sentry
  if (process.env.SENTRY_DSN) {
    Sentry.metrics.distribution("db.query.duration", metrics.durationMs, {
      unit: "millisecond",
    });
  }

  // Alert on query errors
  if (metrics.error) {
    alertCritical("database_query_error", "Database query failed", {
      query: metrics.query.substring(0, 200),
      error: metrics.error,
    });
  }
}

/**
 * Get slow query report
 */
export function getSlowQueryReport(thresholdMs = 500): QueryMetrics[] {
  return queryMetrics
    .filter((q) => q.durationMs > thresholdMs)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 50);
}

// ============================================
// Real-time Alerting
// ============================================

type AlertSeverity = "critical" | "warning" | "info";

interface Alert {
  id: string;
  severity: AlertSeverity;
  type: string;
  message: string;
  context: Record<string, unknown>;
  timestamp: Date;
  acknowledged: boolean;
}

const activeAlerts: Map<string, Alert> = new Map();
const alertHistory: Alert[] = [];
const MAX_ALERT_HISTORY = 500;

// Alert rate limiting
const alertCooldowns: Map<string, number> = new Map();
const ALERT_COOLDOWN_MS = 60000; // 1 minute between same alerts

/**
 * Send a critical alert
 */
export function alertCritical(
  type: string,
  message: string,
  context: Record<string, unknown> = {}
): void {
  sendAlert("critical", type, message, context);
}

/**
 * Send a warning alert
 */
export function alertWarning(
  type: string,
  message: string,
  context: Record<string, unknown> = {}
): void {
  sendAlert("warning", type, message, context);
}

/**
 * Send an info alert
 */
export function alertInfo(
  type: string,
  message: string,
  context: Record<string, unknown> = {}
): void {
  sendAlert("info", type, message, context);
}

function sendAlert(
  severity: AlertSeverity,
  type: string,
  message: string,
  context: Record<string, unknown>
): void {
  const alertKey = `${severity}:${type}`;
  const now = Date.now();

  // Rate limiting
  const lastAlert = alertCooldowns.get(alertKey);
  if (lastAlert && now - lastAlert < ALERT_COOLDOWN_MS) {
    return;
  }
  alertCooldowns.set(alertKey, now);

  const alert: Alert = {
    id: `${type}-${now}`,
    severity,
    type,
    message,
    context,
    timestamp: new Date(),
    acknowledged: false,
  };

  // Store alert
  activeAlerts.set(alert.id, alert);
  alertHistory.push(alert);
  if (alertHistory.length > MAX_ALERT_HISTORY) {
    alertHistory.shift();
  }

  // Log with appropriate level
  const logContext = {
    category: "alert",
    alertId: alert.id,
    alertType: type,
    ...context,
  };

  switch (severity) {
    case "critical":
      logger.error(`[ALERT] ${message}`, logContext);
      break;
    case "warning":
      logger.warn(`[ALERT] ${message}`, logContext);
      break;
    default:
      logger.info(`[ALERT] ${message}`, logContext);
  }

  // Send to Sentry
  if (process.env.SENTRY_DSN) {
    if (severity === "critical") {
      Sentry.captureMessage(message, {
        level: "error",
        tags: { alert_type: type },
        extra: context,
      });
    }
  }

  // Increment alert counter
  incrementCounter("alerts.total", 1, { severity, type });
}

/**
 * Get active (unacknowledged) alerts
 */
export function getActiveAlerts(): Alert[] {
  return Array.from(activeAlerts.values()).filter((a) => !a.acknowledged);
}

/**
 * Acknowledge an alert
 */
export function acknowledgeAlert(alertId: string): boolean {
  const alert = activeAlerts.get(alertId);
  if (alert) {
    alert.acknowledged = true;
    return true;
  }
  return false;
}

/**
 * Get alert history
 */
export function getAlertHistory(limit = 100): Alert[] {
  return alertHistory.slice(-limit).reverse();
}

// ============================================
// Uptime Monitoring
// ============================================

interface UptimeCheck {
  name: string;
  url?: string;
  check: () => Promise<boolean>;
  interval: number;
  lastCheck?: Date;
  lastStatus?: boolean;
  consecutiveFailures: number;
}

const uptimeChecks: Map<string, UptimeCheck> = new Map();
const uptimeIntervals: Map<string, NodeJS.Timeout> = new Map();

/**
 * Register an uptime check
 */
export function registerUptimeCheck(
  name: string,
  check: () => Promise<boolean>,
  intervalMs = 60000
): void {
  const uptimeCheck: UptimeCheck = {
    name,
    check,
    interval: intervalMs,
    consecutiveFailures: 0,
  };

  uptimeChecks.set(name, uptimeCheck);

  // Start checking
  const intervalId = setInterval(async () => {
    await runUptimeCheck(name);
  }, intervalMs);

  uptimeIntervals.set(name, intervalId);

  // Run initial check
  runUptimeCheck(name);
}

async function runUptimeCheck(name: string): Promise<void> {
  const check = uptimeChecks.get(name);
  if (!check) return;

  try {
    const startTime = Date.now();
    const isUp = await check.check();
    const duration = Date.now() - startTime;

    check.lastCheck = new Date();
    check.lastStatus = isUp;

    if (isUp) {
      if (check.consecutiveFailures > 0) {
        // Recovery
        alertInfo("uptime_recovery", `${name} is back online`, {
          previousFailures: check.consecutiveFailures,
        });
      }
      check.consecutiveFailures = 0;
      recordHistogram("uptime.check.duration", duration, { check: name });
    } else {
      check.consecutiveFailures++;
      handleUptimeFailure(name, check.consecutiveFailures);
    }

    // Update gauge
    setGauge(`uptime.${name}`, isUp ? 1 : 0);
  } catch (error) {
    check.consecutiveFailures++;
    check.lastCheck = new Date();
    check.lastStatus = false;
    handleUptimeFailure(name, check.consecutiveFailures, error as Error);
  }
}

function handleUptimeFailure(name: string, failures: number, error?: Error): void {
  if (failures === 1) {
    alertWarning("uptime_degraded", `${name} check failed`, {
      error: error?.message,
    });
  } else if (failures === 3) {
    alertCritical("uptime_down", `${name} is down (${failures} consecutive failures)`, {
      error: error?.message,
    });
  } else if (failures % 10 === 0) {
    alertCritical("uptime_extended_outage", `${name} extended outage (${failures} failures)`, {
      error: error?.message,
    });
  }
}

/**
 * Get uptime status for all checks
 */
export function getUptimeStatus(): Record<string, {
  status: "up" | "down" | "unknown";
  lastCheck?: Date;
  consecutiveFailures: number;
}> {
  const status: Record<string, {
    status: "up" | "down" | "unknown";
    lastCheck?: Date;
    consecutiveFailures: number;
  }> = {};

  uptimeChecks.forEach((check, name) => {
    status[name] = {
      status: check.lastStatus === undefined ? "unknown" : check.lastStatus ? "up" : "down",
      lastCheck: check.lastCheck,
      consecutiveFailures: check.consecutiveFailures,
    };
  });

  return status;
}

/**
 * Stop all uptime checks (for graceful shutdown)
 */
export function stopUptimeChecks(): void {
  uptimeIntervals.forEach((interval) => {
    clearInterval(interval);
  });
  uptimeIntervals.clear();
}

// ============================================
// Critical Error Monitoring
// ============================================

const CRITICAL_ERROR_TYPES = [
  "billing_failure",
  "database_connection_lost",
  "redis_connection_lost",
  "openai_api_error",
  "authentication_failure",
  "data_corruption",
  "queue_failure",
] as const;

type CriticalErrorType = (typeof CRITICAL_ERROR_TYPES)[number];

/**
 * Report a critical error that requires immediate attention
 */
export function reportCriticalError(
  type: CriticalErrorType,
  error: Error,
  context: Record<string, unknown> = {}
): void {
  // Log with full context
  logger.error(`Critical error: ${type}`, {
    category: "critical_error",
    errorType: type,
    error: error.message,
    stack: error.stack,
    ...context,
  });

  // Send alert
  alertCritical(type, `Critical error: ${error.message}`, {
    errorName: error.name,
    stack: error.stack,
    ...context,
  });

  // Send to Sentry with high priority
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setLevel("fatal");
      scope.setTag("error_type", type);
      scope.setTag("critical", "true");
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(error);
    });
  }

  // Increment critical error counter
  incrementCounter("errors.critical", 1, { type });
}

// ============================================
// Request Metrics Middleware Helper
// ============================================

/**
 * Create metrics for an HTTP request
 */
export function recordRequestMetrics(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number
): void {
  const normalizedPath = normalizePath(path);

  // Record response time
  recordHistogram("http.request.duration", durationMs, {
    method,
    path: normalizedPath,
    status: String(Math.floor(statusCode / 100) * 100),
  });

  // Count requests
  incrementCounter("http.requests.total", 1, {
    method,
    path: normalizedPath,
    status: String(statusCode),
  });

  // Track errors
  if (statusCode >= 500) {
    incrementCounter("http.errors.5xx", 1, { method, path: normalizedPath });
  } else if (statusCode >= 400) {
    incrementCounter("http.errors.4xx", 1, { method, path: normalizedPath });
  }
}

function normalizePath(path: string): string {
  // Replace UUIDs and numeric IDs with placeholders
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+/g, "/:id");
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize monitoring with default checks
 */
export function initializeMonitoring(): void {
  logger.info("Initializing production monitoring");

  // System metrics collection (every 30 seconds)
  setInterval(() => {
    const memUsage = process.memoryUsage();
    setGauge("system.memory.heap_used", memUsage.heapUsed);
    setGauge("system.memory.heap_total", memUsage.heapTotal);
    setGauge("system.memory.rss", memUsage.rss);
    setGauge("system.memory.external", memUsage.external);

    // CPU usage would require additional setup
    setGauge("system.uptime", process.uptime());
  }, 30000);

  // Register database health check (every 2 minutes)
  registerUptimeCheck(
    "database",
    async () => {
      try {
        const { checkDatabaseHealth } = await import("./supabase");
        const result = await checkDatabaseHealth();
        return result.healthy;
      } catch (error) {
        logger.error("Database health check failed", { error });
        return false;
      }
    },
    120000
  );

  logger.info("Production monitoring initialized");
}

export default {
  // Metrics
  incrementCounter,
  setGauge,
  recordHistogram,
  getMetricsSnapshot,

  // Tracing
  startSpan,
  traceAsync,

  // Database monitoring
  recordQueryMetrics,
  getSlowQueryReport,

  // Alerting
  alertCritical,
  alertWarning,
  alertInfo,
  getActiveAlerts,
  acknowledgeAlert,
  getAlertHistory,

  // Uptime
  registerUptimeCheck,
  getUptimeStatus,
  stopUptimeChecks,

  // Critical errors
  reportCriticalError,

  // Request metrics
  recordRequestMetrics,

  // Init
  initializeMonitoring,
};
