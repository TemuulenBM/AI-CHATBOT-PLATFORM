import { Router } from "express";
import * as chatController from "../controllers/chat";
import { getChatbotPublic } from "../controllers/chatbots";
import { validate, schemas } from "../middleware/validation";
import { chatRateLimit } from "../middleware/rateLimit";

const router = Router();

// POST /api/chat/support - Built-in support bot (no auth required)
router.post(
  "/support",
  chatRateLimit,
  chatController.supportBotMessage
);

// POST /api/chat/message - Send message (non-streaming)
router.post(
  "/message",
  chatRateLimit,
  validate({ body: schemas.chatMessage }),
  chatController.sendMessage
);

// POST /api/chat/stream - Send message with SSE streaming
router.post(
  "/stream",
  chatRateLimit,
  validate({ body: schemas.chatMessage }),
  chatController.streamMessage
);

// IMPORTANT: More specific routes must come BEFORE generic parameterized routes
// Express.js matches routes in order from top to bottom, so /widget/:id must
// be defined before /:chatbotId/:sessionId to prevent incorrect route matching
// GET /api/chat/widget/:id - Get chatbot info for widget (public)
router.get(
  "/widget/:id",
  validate({ params: schemas.uuidParam }),
  getChatbotPublic
);

// GET /api/chat/:chatbotId/:sessionId - Get conversation history
router.get(
  "/:chatbotId/:sessionId",
  chatController.getConversation
);

export default router;
