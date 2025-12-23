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
  // Auth schemas
  signup: z.object({
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
  }),

  login: z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
  }),

  refreshToken: z.object({
    refreshToken: z.string().min(1, "Refresh token is required"),
  }),

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
        personality: z.number().min(0).max(100).optional(),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        welcomeMessage: z.string().max(500).optional(),
        systemPrompt: z.string().max(2000).optional(),
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

  // Common param schemas
  uuidParam: z.object({
    id: z.string().uuid("Invalid ID format"),
  }),
};

export type SignupInput = z.infer<typeof schemas.signup>;
export type LoginInput = z.infer<typeof schemas.login>;
export type CreateChatbotInput = z.infer<typeof schemas.createChatbot>;
export type UpdateChatbotInput = z.infer<typeof schemas.updateChatbot>;
export type ChatMessageInput = z.infer<typeof schemas.chatMessage>;
export type CreateCheckoutInput = z.infer<typeof schemas.createCheckout>;
