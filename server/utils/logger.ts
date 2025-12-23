import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let msg = `${timestamp} [${level}] ${message}`;
  if (Object.keys(meta).length > 0) {
    msg += ` ${JSON.stringify(meta)}`;
  }
  if (stack) {
    msg += `\n${stack}`;
  }
  return msg;
});

// Structured JSON format for file logs
const fileFormat = combine(
  errors({ stack: true }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  json()
);

// Create base logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: {
    service: "ai-chatbot-platform",
    environment: process.env.NODE_ENV || "development",
  },
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" })
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), consoleFormat),
    }),
  ],
});

// Add rotating file transports in production
if (process.env.NODE_ENV === "production") {
  const logDir = process.env.LOG_DIR || "logs";

  // Error logs - rotate daily, keep 30 days
  logger.add(
    new DailyRotateFile({
      filename: path.join(logDir, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxSize: "20m",
      maxFiles: "30d",
      format: fileFormat,
      zippedArchive: true,
    })
  );

  // Combined logs - rotate daily, keep 14 days
  logger.add(
    new DailyRotateFile({
      filename: path.join(logDir, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d",
      format: fileFormat,
      zippedArchive: true,
    })
  );
}

// ============================================
// Structured Logging Helper Functions
// ============================================

/**
 * Log user authentication events
 */
export function logAuth(
  action: "login" | "signup" | "logout" | "refresh" | "failed",
  userId?: string,
  email?: string,
  meta?: Record<string, unknown>
) {
  logger.info("Auth event", {
    category: "auth",
    action,
    userId,
    email: email ? email.replace(/(.{2}).*(@.*)/, "$1***$2") : undefined, // Mask email
    ...meta,
  });
}

/**
 * Log chatbot lifecycle events
 */
export function logChatbot(
  action: "created" | "updated" | "deleted" | "status_change",
  chatbotId: string,
  userId: string,
  meta?: Record<string, unknown>
) {
  logger.info("Chatbot event", {
    category: "chatbot",
    action,
    chatbotId,
    userId,
    ...meta,
  });
}

/**
 * Log job/queue events
 */
export function logJob(
  queue: "scraping" | "embedding",
  action: "started" | "completed" | "failed" | "progress",
  jobId: string,
  meta?: Record<string, unknown>
) {
  const level = action === "failed" ? "error" : "info";
  logger.log(level, "Job event", {
    category: "job",
    queue,
    action,
    jobId,
    ...meta,
  });
}

/**
 * Log payment/subscription events
 */
export function logPayment(
  action: "subscription_created" | "subscription_updated" | "subscription_cancelled" | "payment_succeeded" | "payment_failed" | "webhook_received",
  userId?: string,
  meta?: Record<string, unknown>
) {
  const level = action.includes("failed") ? "error" : "info";
  logger.log(level, "Payment event", {
    category: "payment",
    action,
    userId,
    ...meta,
  });
}

/**
 * Log API errors with context
 */
export function logApiError(
  error: Error,
  context: {
    requestId?: string;
    path?: string;
    method?: string;
    userId?: string;
    statusCode?: number;
  }
) {
  logger.error("API error", {
    category: "api_error",
    error: error.message,
    errorName: error.name,
    stack: error.stack,
    ...context,
  });
}

/**
 * Log chat/conversation events
 */
export function logChat(
  action: "message_sent" | "message_received" | "conversation_started" | "conversation_ended",
  chatbotId: string,
  sessionId: string,
  meta?: Record<string, unknown>
) {
  logger.info("Chat event", {
    category: "chat",
    action,
    chatbotId,
    sessionId,
    ...meta,
  });
}

/**
 * Log performance metrics
 */
export function logPerformance(
  operation: string,
  durationMs: number,
  meta?: Record<string, unknown>
) {
  const level = durationMs > 5000 ? "warn" : "debug";
  logger.log(level, "Performance metric", {
    category: "performance",
    operation,
    durationMs,
    ...meta,
  });
}

export default logger;
