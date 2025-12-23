import { Router } from "express";
import * as chatbotsController from "../controllers/chatbots";
import { validate, schemas } from "../middleware/validation";
import { authMiddleware, loadSubscription } from "../middleware/auth";
import { embeddingRateLimit } from "../middleware/rateLimit";

const router = Router();

// All routes require authentication
router.use(authMiddleware);
router.use(loadSubscription);

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
