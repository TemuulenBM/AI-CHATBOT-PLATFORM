import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  incrementCounter,
  setGauge,
  recordHistogram,
  getMetricsSnapshot,
  startSpan,
  traceAsync,
  recordQueryMetrics,
  getSlowQueryReport,
  alertCritical,
  alertWarning,
  alertInfo,
  getActiveAlerts,
  acknowledgeAlert,
  getAlertHistory,
  registerUptimeCheck,
  getUptimeStatus,
  stopUptimeChecks,
  reportCriticalError,
  recordRequestMetrics,
} from "../../../server/utils/monitoring";

vi.mock("@sentry/node", () => ({
  startInactiveSpan: vi.fn(() => ({ end: vi.fn() })),
  metrics: { distribution: vi.fn() },
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Monitoring Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Metrics Collection", () => {
    it("should increment counter", () => {
      incrementCounter("test.counter");
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters["test.counter"]).toBe(1);
    });

    it("should increment counter with custom value", () => {
      incrementCounter("test.counter", 5);
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters["test.counter"]).toBe(6); // 1 + 5
    });

    it("should set gauge", () => {
      setGauge("test.gauge", 42);
      const snapshot = getMetricsSnapshot();
      expect(snapshot.gauges["test.gauge"]).toBe(42);
    });

    it("should record histogram", () => {
      recordHistogram("test.histogram", 100);
      recordHistogram("test.histogram", 200);
      const snapshot = getMetricsSnapshot();
      expect(snapshot.histograms["test.histogram"].count).toBe(2);
      expect(snapshot.histograms["test.histogram"].avg).toBe(150);
    });

    it("should calculate histogram percentiles", () => {
      for (let i = 1; i <= 100; i++) {
        recordHistogram("test.percentiles", i);
      }
      const snapshot = getMetricsSnapshot();
      expect(snapshot.histograms["test.percentiles"].p50).toBeGreaterThan(45);
      expect(snapshot.histograms["test.percentiles"].p95).toBeGreaterThan(90);
      expect(snapshot.histograms["test.percentiles"].p99).toBeGreaterThan(95);
    });
  });

  describe("APM Tracing", () => {
    it("should start and end span", () => {
      const endSpan = startSpan({ name: "test", op: "test.op" });
      expect(typeof endSpan).toBe("function");
      endSpan();
    });

    it("should trace async function", async () => {
      const result = await traceAsync(
        { name: "test", op: "test.op" },
        async () => {
          return "success";
        }
      );
      expect(result).toBe("success");
    });

    it("should handle errors in traceAsync", async () => {
      await expect(
        traceAsync({ name: "test", op: "test.op" }, async () => {
          throw new Error("test error");
        })
      ).rejects.toThrow("test error");
    });
  });

  describe("Query Metrics", () => {
    it("should record query metrics", () => {
      recordQueryMetrics({
        query: "SELECT * FROM users",
        durationMs: 100,
        rowCount: 10,
      });
      const slowQueries = getSlowQueryReport(50);
      expect(slowQueries.length).toBeGreaterThan(0);
    });

    it("should filter slow queries by threshold", () => {
      recordQueryMetrics({ query: "fast", durationMs: 100, rowCount: 1 });
      recordQueryMetrics({ query: "slow", durationMs: 1000, rowCount: 1 });
      const slowQueries = getSlowQueryReport(500);
      expect(slowQueries.every((q) => q.durationMs > 500)).toBe(true);
    });
  });

  describe("Alerting", () => {
    it("should create critical alert", () => {
      alertCritical("test_type", "Test message", { key: "value" });
      const alerts = getActiveAlerts();
      expect(alerts.some((a) => a.type === "test_type")).toBe(true);
    });

    it("should create warning alert", () => {
      alertWarning("test_warning", "Warning message");
      const alerts = getActiveAlerts();
      expect(alerts.some((a) => a.severity === "warning")).toBe(true);
    });

    it("should acknowledge alert", () => {
      alertInfo("test_ack", "Ack message");
      const alerts = getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      const alertId = alerts.find((a) => a.type === "test_ack")?.id;
      expect(alertId).toBeDefined();
      if (alertId) {
        const acknowledged = acknowledgeAlert(alertId);
        expect(acknowledged).toBe(true);
        const history = getAlertHistory(100);
        const acknowledgedAlert = history.find((a) => a.id === alertId);
        expect(acknowledgedAlert?.acknowledged).toBe(true);
      }
    });

    it("should get alert history", () => {
      alertCritical("history_test", "History message");
      const history = getAlertHistory(10);
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe("Uptime Checks", () => {
    it("should register uptime check", () => {
      registerUptimeCheck("test_check", async () => true, 1000);
      const status = getUptimeStatus();
      expect(status["test_check"]).toBeDefined();
    });

    it("should stop uptime checks", () => {
      registerUptimeCheck("stop_test", async () => true, 1000);
      stopUptimeChecks();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("Error Reporting", () => {
    it("should report critical error", () => {
      const error = new Error("Test error");
      reportCriticalError("database_connection_lost", error, { context: "test" });
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("Request Metrics", () => {
    it("should record request metrics", () => {
      recordRequestMetrics("GET", "/api/test", 200, 100);
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters["http.requests.total{method:GET,path:/api/test,status:200}"]).toBe(1);
    });

    it("should track error status codes", () => {
      recordRequestMetrics("GET", "/api/error", 500, 200);
      const snapshot = getMetricsSnapshot();
      expect(snapshot.counters["http.errors.5xx{method:GET,path:/api/error}"]).toBe(1);
    });
  });
});
