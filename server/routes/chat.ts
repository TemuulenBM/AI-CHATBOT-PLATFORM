import { Router } from "express";
import * as chatController from "../controllers/chat";
import { getChatbotPublic } from "../controllers/chatbots";
import { validate, schemas } from "../middleware/validation";
import { chatRateLimit } from "../middleware/rateLimit";

const router = Router();

/**
 * @openapi
 * /api/chat/message:
 *   post:
 *     summary: Send Chat Message
 *     description: Send a message to a chatbot and receive a response. This endpoint returns the complete response in one request (non-streaming). Rate limited to prevent abuse.
 *     tags:
 *       - Chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatMessageRequest'
 *     responses:
 *       200:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Bot's response message
 *                 conversation_id:
 *                   type: string
 *                   format: uuid
 *                   description: Unique conversation identifier
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 */
router.post(
  "/support",
  chatRateLimit,
  chatController.supportBotMessage
);

router.post(
  "/message",
  chatRateLimit,
  validate({ body: schemas.chatMessage }),
  chatController.sendMessage
);

/**
 * @openapi
 * /api/chat/stream:
 *   post:
 *     summary: Stream Chat Message
 *     description: Send a message to a chatbot and receive a streaming response using Server-Sent Events (SSE). Provides real-time token-by-token response. Rate limited to prevent abuse.
 *     tags:
 *       - Chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatMessageRequest'
 *     responses:
 *       200:
 *         description: Streaming response started
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: Server-Sent Events stream with message tokens
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 */
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
