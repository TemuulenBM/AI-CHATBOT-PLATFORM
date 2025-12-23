import { Router } from "express";
import * as authController from "../controllers/auth";
import { validate, schemas } from "../middleware/validation";
import { authMiddleware } from "../middleware/auth";
import { authRateLimit } from "../middleware/rateLimit";

const router = Router();

// POST /api/auth/signup
router.post(
  "/signup",
  authRateLimit,
  validate({ body: schemas.signup }),
  authController.signup
);

// POST /api/auth/login
router.post(
  "/login",
  authRateLimit,
  validate({ body: schemas.login }),
  authController.login
);

// POST /api/auth/refresh
router.post(
  "/refresh",
  validate({ body: schemas.refreshToken }),
  authController.refresh
);

// GET /api/auth/me
router.get(
  "/me",
  authMiddleware,
  authController.me
);

export default router;
