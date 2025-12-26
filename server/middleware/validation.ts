import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
import { ValidationError } from "../utils/errors";
import { fromZodError } from "zod-validation-error";

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          throw new ValidationError(fromZodError(result.error).message);
        }
        req.body = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          throw new ValidationError(fromZodError(result.error).message);
        }
        req.query = result.data;
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          throw new ValidationError(fromZodError(result.error).message);
        }
        req.params = result.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Common validation schemas
export const schemas = {
  // Chatbot schemas
  createChatbot: z.object({
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    websiteUrl: z.string().url("Invalid URL"),
    settings: z
      .object({
        personality: z.number().min(0).max(100).default(50),
        primaryColor: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format")
          .default("#7c3aed"),
        welcomeMessage: z.string().max(500).default("Hi! How can I help you today?"),
        systemPrompt: z.string().max(2000).optional(),
      })
      .default({}),
  }),

  updateChatbot: z.object({
    name: z.string().min(1).max(100).optional(),
    settings: z
      .object({
        // Core settings
        personality: z.number().min(0).max(100).optional(),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        welcomeMessage: z.string().max(500).optional(),
        systemPrompt: z.string().max(2000).optional(),

        // Widget v2.0 settings
        allowedDomains: z.array(z.string()).optional(),
        preChatForm: z
          .object({
            enabled: z.boolean(),
            title: z.string().optional(),
            fields: z.array(
              z.object({
                id: z.string(),
                type: z.enum(["text", "email", "phone", "select"]),
                label: z.string(),
                required: z.boolean(),
                options: z.array(z.string()).optional(),
              })
            ),
          })
          .optional(),
        proactiveTriggers: z
          .array(
            z.object({
              id: z.string(),
              type: z.enum(["time", "scroll", "exit", "url"]),
              value: z.union([z.string(), z.number()]),
              message: z.string(),
              enabled: z.boolean(),
            })
          )
          .optional(),
        locale: z.string().optional(),
        soundEnabled: z.boolean().optional(),

        // Position & Layout
        position: z.enum(["bottom-right", "bottom-left", "bottom-center"]).optional(),
        widgetSize: z.enum(["compact", "standard", "large"]).optional(),
        borderRadius: z.number().min(0).max(50).optional(),

        // Appearance
        fontFamily: z.string().max(100).optional(),
        headerStyle: z.enum(["solid", "gradient", "glass"]).optional(),
        showBranding: z.boolean().optional(),

        // Behavior
        openDelay: z.number().min(0).max(30000).optional(),
        showInitially: z.boolean().optional(),

        // Animations
        animationStyle: z.enum(["slide", "fade", "bounce", "none"]).optional(),
      })
      .optional(),
  }),

  // Chat schemas
  chatMessage: z.object({
    chatbotId: z.string().uuid("Invalid chatbot ID"),
    sessionId: z.string().min(1, "Session ID is required"),
    message: z.string().min(1, "Message is required").max(4000, "Message too long"),
  }),

  // Subscription schemas
  createCheckout: z.object({
    plan: z.enum(["starter", "growth", "business"]),
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
  }),

  // Scrape schedule schema
  scrapeSchedule: z.object({
    autoScrapeEnabled: z.boolean(),
    scrapeFrequency: z.enum(["manual", "daily", "weekly", "monthly"]),
  }),

  // Common param schemas
  uuidParam: z.object({
    id: z.string().uuid("Invalid ID format"),
  }),

  // Conversations query schema
  conversationsQuery: z.object({
    page: z
      .union([z.string().regex(/^\d+$/), z.number()])
      .transform((val) => (typeof val === "string" ? parseInt(val, 10) : val))
      .pipe(z.number().int().positive())
      .optional()
      .default(1),
    limit: z
      .union([z.string().regex(/^\d+$/), z.number()])
      .transform((val) => (typeof val === "string" ? parseInt(val, 10) : val))
      .pipe(z.number().int().positive().max(50))
      .optional()
      .default(20),
    chatbotId: z
      .string()
      .optional()
      .refine(
        (val) => !val || val === "" || z.string().uuid().safeParse(val).success,
        { message: "Invalid chatbot ID format" }
      )
      .transform((val) => (val === "" ? undefined : val)),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
};

export type CreateChatbotInput = z.infer<typeof schemas.createChatbot>;
export type UpdateChatbotInput = z.infer<typeof schemas.updateChatbot>;
export type ChatMessageInput = z.infer<typeof schemas.chatMessage>;
export type CreateCheckoutInput = z.infer<typeof schemas.createCheckout>;
export type ScrapeScheduleInput = z.infer<typeof schemas.scrapeSchedule>;
