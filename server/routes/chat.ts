import { Router } from "express";
import * as chatController from "../controllers/chat";
import { getChatbotPublic } from "../controllers/chatbots";
import { validate, schemas } from "../middleware/validation";
import { chatRateLimit } from "../middleware/rateLimit";

const router = Router();

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

// GET /api/chat/:chatbotId/:sessionId - Get conversation history
router.get(
  "/:chatbotId/:sessionId",
  chatController.getConversation
);

// GET /api/chat/widget/:id - Get chatbot info for widget (public)
router.get(
  "/widget/:id",
  validate({ params: schemas.uuidParam }),
  getChatbotPublic
);

export default router;
