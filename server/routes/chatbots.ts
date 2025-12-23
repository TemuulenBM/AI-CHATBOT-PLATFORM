import { Router } from "express";
import * as chatbotsController from "../controllers/chatbots";
import { validate, schemas } from "../middleware/validation";
import { authMiddleware, loadSubscription } from "../middleware/auth";
import { embeddingRateLimit } from "../middleware/rateLimit";

const router = Router();

// All routes require authentication
router.use(authMiddleware);
router.use(loadSubscription);

// GET /api/chatbots/stats - Get dashboard stats
router.get("/stats", chatbotsController.getStats);

// GET /api/chatbots/stats/volume - Get message volume trends
router.get("/stats/volume", chatbotsController.getMessageVolume);

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

export default router;
