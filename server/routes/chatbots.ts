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

// GET /api/chatbots/stats - Get dashboard stats
router.get("/stats", chatbotsController.getStats);

// GET /api/chatbots/stats/volume - Get message volume trends
router.get("/stats/volume", chatbotsController.getMessageVolume);

// GET /api/chatbots/conversations - Get all conversations across all user's chatbots
router.get(
  "/conversations",
  validate({ query: schemas.conversationsQuery }),
  chatbotsController.getAllConversations
);

// POST /api/chatbots - Create chatbot
router.post(
  "/",
  embeddingRateLimit,
  validate({ body: schemas.createChatbot }),
  chatbotsController.createChatbot
);

// GET /api/chatbots - List chatbots
router.get("/", chatbotsController.listChatbots);

// GET /api/chatbots/:id - Get single chatbot
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

// GET /api/chatbots/:id/knowledge/stats - Get knowledge base statistics
router.get(
  "/:id/knowledge/stats",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.getKnowledgeStats
);

// POST /api/chatbots/:id/knowledge/bulk - Bulk import knowledge entries
router.post(
  "/:id/knowledge/bulk",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.bulkImportKnowledge
);

// POST /api/chatbots/:id/knowledge - Add knowledge entry
router.post(
  "/:id/knowledge",
  validate({ params: schemas.uuidParam }),
  knowledgeBaseController.addKnowledgeEntry
);

// GET /api/chatbots/:id/knowledge - List knowledge entries
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
