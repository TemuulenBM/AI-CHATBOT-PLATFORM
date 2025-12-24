import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../utils/supabase";
import { ValidationError, NotFoundError } from "../utils/errors";
import logger from "../utils/logger";

interface FeedbackInput {
    conversationId: string;
    chatbotId: string;
    rating: "positive" | "negative";
}

/**
 * Submit feedback for a conversation (CSAT rating)
 * Public endpoint - accessible from widget
 */
export async function submitFeedback(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { conversationId, chatbotId, rating } = req.body as FeedbackInput;

        // Validate input
        if (!conversationId || !chatbotId || !rating) {
            throw new ValidationError("conversationId, chatbotId, and rating are required");
        }

        if (rating !== "positive" && rating !== "negative") {
            throw new ValidationError("rating must be 'positive' or 'negative'");
        }

        // Verify conversation exists
        const { data: conversation, error: convError } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("id", conversationId)
            .eq("chatbot_id", chatbotId)
            .single();

        if (convError || !conversation) {
            throw new NotFoundError("Conversation");
        }

        // Check if feedback already exists for this conversation
        const { data: existingFeedback } = await supabaseAdmin
            .from("feedback")
            .select("id")
            .eq("conversation_id", conversationId)
            .single();

        if (existingFeedback) {
            // Update existing feedback
            await supabaseAdmin
                .from("feedback")
                .update({ rating })
                .eq("id", existingFeedback.id);

            res.json({ message: "Feedback updated", id: existingFeedback.id });
            return;
        }

        // Insert new feedback
        const { data: feedback, error } = await supabaseAdmin
            .from("feedback")
            .insert({
                conversation_id: conversationId,
                chatbot_id: chatbotId,
                rating,
            })
            .select()
            .single();

        if (error || !feedback) {
            logger.error("Failed to submit feedback", { error, conversationId });
            throw new Error("Failed to submit feedback");
        }

        logger.info("Feedback submitted", { feedbackId: feedback.id, rating });

        res.status(201).json({ message: "Feedback submitted", id: feedback.id });
    } catch (error) {
        next(error);
    }
}

/**
 * Get satisfaction metrics for a chatbot
 */
export async function getSatisfactionMetrics(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { chatbotId } = req.params;

        if (!chatbotId) {
            throw new ValidationError("chatbotId is required");
        }

        // Get feedback counts
        const { data: feedbackData, error } = await supabaseAdmin
            .from("feedback")
            .select("rating")
            .eq("chatbot_id", chatbotId);

        if (error) {
            logger.error("Failed to get feedback", { error, chatbotId });
            throw new Error("Failed to get feedback");
        }

        const feedback = feedbackData || [];
        const positive = feedback.filter((f) => f.rating === "positive").length;
        const negative = feedback.filter((f) => f.rating === "negative").length;
        const total = feedback.length;

        const satisfactionRate = total > 0 ? Math.round((positive / total) * 100) : null;

        res.json({
            positive,
            negative,
            total,
            satisfactionRate,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Check if feedback exists for a conversation
 */
export async function checkFeedback(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { conversationId } = req.params;

        if (!conversationId) {
            throw new ValidationError("conversationId is required");
        }

        const { data: feedback } = await supabaseAdmin
            .from("feedback")
            .select("id, rating")
            .eq("conversation_id", conversationId)
            .single();

        res.json({
            hasFeedback: !!feedback,
            rating: feedback?.rating || null,
        });
    } catch (error) {
        next(error);
    }
}
