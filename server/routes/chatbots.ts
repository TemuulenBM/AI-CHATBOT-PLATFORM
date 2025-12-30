import { Router } from "express";
import * as chatbotsController from "../controllers/chatbots";
import * as knowledgeBaseController from "../controllers/knowledge-base";
import { validate, schemas } from "../middleware/validation";
import { clerkAuthMiddleware as authMiddleware, loadSubscription } from "../middleware/clerkAuth";
import { embeddingRateLimit } from "../middleware/rateLimit";

const router = Router();

// All routes require authentication
router.use(authMiddleware);
router.use(loadSubscription);

/**
 * @openapi
 * /api/chatbots/stats:
 *   get:
 *     summary: Get Dashboard Statistics
 *     description: Retrieve overall statistics across all user's chatbots including total conversations, messages, and sentiment analysis
 *     tags:
 *       - Chatbots
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_chatbots:
 *                   type: integer
 *                 total_conversations:
 *                   type: integer
 *                 total_messages:
 *                   type: integer
 *                 sentiment_summary:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/stats", chatbotsController.getStats);

// GET /api/chatbots/stats/volume - Get message volume trends
router.get("/stats/volume", chatbotsController.getMessageVolume);

// GET /api/chatbots/conversations - Get all conversations across all user's chatbots
router.get(
  "/conversations",
  validate({ query: schemas.conversationsQuery }),
  chatbotsController.getAllConversations
);

/**
 * @openapi
 * /api/chatbots:
 *   post:
 *     summary: Create New Chatbot
 *     description: Create a new AI chatbot by providing a website URL. The system will scrape the website and generate embeddings for semantic search. Rate limited based on subscription plan.
 *     tags:
 *       - Chatbots
 *     security:
 *       - BearerAuth: []
 *       - CsrfToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateChatbotRequest'
 *     responses:
 *       201:
 *         description: Chatbot created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Chatbot created successfully
 *                 chatbot:
 *                   $ref: '#/components/schemas/Chatbot'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *   get:
 *     summary: List All Chatbots
 *     description: Get a list of all chatbots owned by the authenticated user
 *     tags:
 *       - Chatbots
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Chatbots retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chatbots:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Chatbot'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  "/",
  embeddingRateLimit,
  validate({ body: schemas.createChatbot }),
  chatbotsController.createChatbot
);

router.get("/", chatbotsController.listChatbots);

/**
 * @openapi
 * /api/chatbots/{id}:
 *   get:
 *     summary: Get Chatbot Details
 *     description: Retrieve detailed information about a specific chatbot including configuration and settings
 *     tags:
 *       - Chatbots
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ChatbotId'
 *     responses:
 *       200:
 *         description: Chatbot details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chatbot:
 *                   $ref: '#/components/schemas/Chatbot'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *   patch:
 *     summary: Update Chatbot
 *     description: Update chatbot configuration including personality, colors, prompts, and settings
 *     tags:
 *       - Chatbots
 *     security:
 *       - BearerAuth: []
 *       - CsrfToken: []
 *     parameters:
 *       - $ref: '#/components/parameters/ChatbotId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               personality:
 *                 type: string
 *               system_prompt:
 *                 type: string
 *               initial_message:
 *                 type: string
 *               suggested_questions:
 *                 type: array
 *                 items:
 *                   type: string
 *               theme_color:
 *                 type: string
 *               text_color:
 *                 type: string
 *               branding_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chatbot updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 chatbot:
 *                   $ref: '#/components/schemas/Chatbot'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *   delete:
 *     summary: Delete Chatbot
 *     description: Permanently delete a chatbot and all associated data including conversations and embeddings
 *     tags:
 *       - Chatbots
 *     security:
 *       - BearerAuth: []
 *       - CsrfToken: []
 *     parameters:
 *       - $ref: '#/components/parameters/ChatbotId'
 *     responses:
 *       200:
 *         description: Chatbot deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Chatbot deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get(
  "/:id",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getChatbot
);

// GET /api/chatbots/:id/analytics - Get chatbot analytics
router.get(
  "/:id/analytics",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getChatbotAnalytics
);

// GET /api/chatbots/:id/analytics/widget - Get widget-specific analytics (for UI compatibility)
router.get(
  "/:id/analytics/widget",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getWidgetAnalytics
);

// GET /api/chatbots/:id/sentiment - Get sentiment breakdown
router.get(
  "/:id/sentiment",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getSentimentBreakdown
);

// GET /api/chatbots/:id/trends - Get conversation trends for chatbot
router.get(
  "/:id/trends",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getConversationTrends
);

// GET /api/chatbots/:id/questions - Get top questions for chatbot
router.get(
  "/:id/questions",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getTopQuestions
);

// GET /api/chatbots/:id/conversations - Get conversations for chatbot
router.get(
  "/:id/conversations",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getConversations
);

// GET /api/chatbots/:id/conversations/:conversationId - Get single conversation
router.get(
  "/:id/conversations/:conversationId",
  chatbotsController.getConversation
);

// PATCH /api/chatbots/:id - Update chatbot
router.patch(
  "/:id",
  validate({ params: schemas.uuidParam, body: schemas.updateChatbot }),
  chatbotsController.updateChatbot
);

// DELETE /api/chatbots/:id - Delete chatbot
router.delete(
  "/:id",
  validate({ params: schemas.uuidParam }),
  chatbotsController.deleteChatbot
);

// POST /api/chatbots/:id/rescrape - Trigger manual re-scraping
router.post(
  "/:id/rescrape",
  validate({ params: schemas.uuidParam }),
  chatbotsController.triggerRescrape
);

// PATCH /api/chatbots/:id/scrape-schedule - Configure auto-scraping
router.patch(
  "/:id/scrape-schedule",
  validate({ params: schemas.uuidParam, body: schemas.scrapeSchedule }),
  chatbotsController.updateScrapeSchedule
);

// GET /api/chatbots/:id/scrape-history - View scraping history
router.get(
  "/:id/scrape-history",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getScrapeHistory
);

// ===== Phase 5: Analytics Enhancement Routes =====

// GET /api/chatbots/:id/analytics/response-times - Get response time trends
router.get(
  "/:id/analytics/response-times",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getResponseTimeTrends
);

// GET /api/chatbots/:id/analytics/conversation-rate - Get conversion metrics
router.get(
  "/:id/analytics/conversation-rate",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getConversationRate
);

// GET /api/chatbots/:id/analytics/widget - Get widget analytics
router.get(
  "/:id/analytics/widget",
  validate({ params: schemas.uuidParam }),
  chatbotsController.getWidgetAnalytics
);

// GET /api/chatbots/:id/analytics/export - Export analytics data
router.get(
  "/:id/analytics/export",
  validate({ params: schemas.uuidParam }),
  chatbotsController.exportAnalytics
);

// ===== Knowledge Base Routes =====

/**
 * @openapi
 * /api/chatbots/{id}/knowledge:
 *   post:
 *     summary: Add Knowledge Entry
 *     description: Add a custom Q&A entry to the chatbot's knowledge base. The system will generate embeddings for semantic search.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *       - CsrfToken: []
 *     parameters:
 *       - $ref: '#/components/parameters/ChatbotId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question, answer]
 *             properties:
 *               question:
 *                 type: string
 *                 example: What are your business hours?
 *               answer:
 *                 type: string
 *                 example: We are open Monday-Friday, 9 AM to 5 PM EST.
 *               source_url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Knowledge entry added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 entry:
 *                   $ref: '#/components/schemas/KnowledgeEntry'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *   get:
 *     summary: List Knowledge Entries
 *     description: Get all custom knowledge entries for a chatbot
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ChatbotId'
 *     responses:
 *       200:
 *         description: Knowledge entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KnowledgeEntry'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  "/:id/knowledge/stats",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.getKnowledgeStats
);

router.post(
  "/:id/knowledge/bulk",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.bulkImportKnowledge
);

router.post(
  "/:id/knowledge",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.addKnowledgeEntry
);

router.get(
  "/:id/knowledge",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.listKnowledgeEntries
);

// GET /api/chatbots/:id/knowledge/:entryId - Get single knowledge entry
router.get(
  "/:id/knowledge/:entryId",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.getKnowledgeEntry
);

// PATCH /api/chatbots/:id/knowledge/:entryId - Update knowledge entry
router.patch(
  "/:id/knowledge/:entryId",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.updateKnowledgeEntry
);

// DELETE /api/chatbots/:id/knowledge/:entryId - Delete knowledge entry
router.delete(
  "/:id/knowledge/:entryId",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.deleteKnowledgeEntry
);

export default router;
