import { Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { supabaseAdmin } from "../utils/supabase";
import {
  generateToken,
  generateRefreshToken,
  verifyToken,
  AuthenticatedRequest,
} from "../middleware/auth";
import { AuthenticationError, ValidationError } from "../utils/errors";
import logger from "../utils/logger";
import { SignupInput, LoginInput } from "../middleware/validation";

const SALT_ROUNDS = 12;

export async function signup(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as SignupInput;

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      throw new ValidationError("Email already registered");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .insert({
        email,
        password_hash: hashedPassword,
      })
      .select("id, email")
      .single();

    if (userError || !user) {
      logger.error("Failed to create user", { error: userError });
      throw new Error("Failed to create user");
    }

    // Create default subscription (free plan)
    const { error: subError } = await supabaseAdmin.from("subscriptions").insert({
      user_id: user.id,
      plan: "free",
      usage: { messages_count: 0, chatbots_count: 0 },
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (subError) {
      logger.error("Failed to create subscription", { error: subError, userId: user.id });
    }

    // Generate tokens
    const accessToken = generateToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    logger.info("User signed up", { userId: user.id, email: user.email });

    res.status(201).json({
      message: "Account created successfully",
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as LoginInput;

    // Find user
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, email, password_hash")
      .eq("email", email)
      .single();

    if (error || !user) {
      throw new AuthenticationError("Invalid email or password");
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new AuthenticationError("Invalid email or password");
    }

    // Generate tokens
    const accessToken = generateToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    logger.info("User logged in", { userId: user.id });

    res.json({
      message: "Login successful",
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AuthenticationError("Refresh token required");
    }

    // Verify refresh token
    const payload = verifyToken(refreshToken);

    // Verify user still exists
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .eq("id", payload.userId)
      .single();

    if (error || !user) {
      throw new AuthenticationError("User not found");
    }

    // Generate new tokens
    const newAccessToken = generateToken({ userId: user.id, email: user.email });
    const newRefreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function me(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError();
    }

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, email, created_at")
      .eq("id", req.user.userId)
      .single();

    if (error || !user) {
      throw new AuthenticationError("User not found");
    }

    // Get subscription info
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, usage, current_period_end")
      .eq("user_id", req.user.userId)
      .single();

    res.json({
      user,
      subscription: subscription || { plan: "free", usage: { messages_count: 0, chatbots_count: 0 } },
    });
  } catch (error) {
    next(error);
  }
}
