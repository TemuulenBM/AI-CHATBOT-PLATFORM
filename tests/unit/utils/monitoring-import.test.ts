import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Sentry before imports
vi.mock("@sentry/node", () => ({
  captureMessage: vi.fn(),
  setContext: vi.fn(),
}));

// Mock logger
vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  incrementCounter,
  setGauge,
  recordHistogram,
  getMetricsSnapshot,
  recordRequestMetrics,
  getActiveAlerts,
  getAlertHistory,
  acknowledgeAlert,
  getUptimeStatus,
  getSlowQueryReport,
  initializeMonitoring,
  registerUptimeCheck,
  reportCriticalError,
} from "../../../server/utils/monitoring";
import logger from "../../../server/utils/logger";

describe("Monitoring Utils - Direct Import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("incrementCounter", () => {
    it("should increment counter metric", () => {
      incrementCounter("test.counter", 1);
      incrementCounter("test.counter", 1);

      expect(logger.debug).toHaveBeenCalledWith(
        "Metric counter incremented",
        expect.objectContaining({ metric: "test.counter", value: 1 })
      );
    });

    it("should increment counter with custom value", () => {
      incrementCounter("test.counter", 5);

      expect(logger.debug).toHaveBeenCalledWith(
        "Metric counter incremented",
        expect.objectContaining({ metric: "test.counter", value: 5 })
      );
    });

    it("should support tags", () => {
      incrementCounter("test.counter", 1, { env: "test" });

      expect(logger.debug).toHaveBeenCalledWith(
        "Metric counter incremented",
        expect.objectContaining({ tags: { env: "test" } })
      );
    });
  });

  describe("setGauge", () => {
    it("should set gauge metric", () => {
      setGauge("test.gauge", 100);

      expect(logger.debug).toHaveBeenCalledWith(
        "Metric gauge set",
        expect.objectContaining({ metric: "test.gauge", value: 100 })
      );
    });

    it("should support tags", () => {
      setGauge("test.gauge", 50, { service: "api" });

      expect(logger.debug).toHaveBeenCalledWith(
        "Metric gauge set",
        expect.objectContaining({ tags: { service: "api" } })
      );
    });
  });

  describe("recordHistogram", () => {
    it("should record histogram value", () => {
      recordHistogram("test.histogram", 100);

      expect(logger.debug).toHaveBeenCalledWith(
        "Metric histogram recorded",
        expect.objectContaining({ metric: "test.histogram", value: 100 })
      );
    });

    it("should record multiple values", () => {
      recordHistogram("test.histogram", 100);
      recordHistogram("test.histogram", 200);
      recordHistogram("test.histogram", 150);

      expect(logger.debug).toHaveBeenCalledTimes(3);
    });
  });

  describe("getMetricsSnapshot", () => {
    it("should return metrics snapshot", () => {
      const snapshot = getMetricsSnapshot();

      expect(snapshot).toHaveProperty("counters");
      expect(snapshot).toHaveProperty("gauges");
      expect(snapshot).toHaveProperty("histograms");
    });
  });

  describe("recordRequestMetrics", () => {
    it("should record request metrics", () => {
      recordRequestMetrics("GET", "/api/test", 200, 100);

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should record error request", () => {
      recordRequestMetrics("POST", "/api/error", 500, 50);

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe("getActiveAlerts", () => {
    it("should return array of active alerts", () => {
      const alerts = getActiveAlerts();

      expect(Array.isArray(alerts)).toBe(true);
    });
  });

  describe("getAlertHistory", () => {
    it("should return alert history", () => {
      const history = getAlertHistory(10);

      expect(Array.isArray(history)).toBe(true);
    });

    it("should respect limit parameter", () => {
      const history = getAlertHistory(5);

      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe("acknowledgeAlert", () => {
    it("should return boolean", () => {
      const result = acknowledgeAlert("alert_123");

      expect(typeof result).toBe("boolean");
    });
  });

  describe("getUptimeStatus", () => {
    it("should return uptime status object", () => {
      const status = getUptimeStatus();

      expect(typeof status).toBe("object");
    });
  });

  describe("getSlowQueryReport", () => {
    it("should return array of slow queries", () => {
      const report = getSlowQueryReport(500);

      expect(Array.isArray(report)).toBe(true);
    });

    it("should use custom threshold", () => {
      const report = getSlowQueryReport(1000);

      expect(Array.isArray(report)).toBe(true);
    });
  });

  describe("initializeMonitoring", () => {
    it("should initialize monitoring", () => {
      expect(() => initializeMonitoring()).not.toThrow();
    });
  });

  describe("registerUptimeCheck", () => {
    it("should register uptime check", () => {
      const checkFn = vi.fn().mockResolvedValue(true);

      expect(() => registerUptimeCheck("test-service", checkFn, 60000)).not.toThrow();
    });
  });

  describe("reportCriticalError", () => {
    it("should report critical error", () => {
      const error = new Error("Critical failure");

      expect(() =>
        reportCriticalError(error, { context: "test", service: "api" })
      ).not.toThrow();
    });
  });
});
