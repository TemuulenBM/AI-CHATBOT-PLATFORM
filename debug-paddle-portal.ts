/**
 * Debug script to test Paddle portal session creation
 * Usage: tsx debug-paddle-portal.ts <paddle_customer_id>
 */

import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_ENVIRONMENT = process.env.PADDLE_ENVIRONMENT || "sandbox";
const PADDLE_API_BASE = PADDLE_ENVIRONMENT === "live"
  ? "https://api.paddle.com"
  : "https://sandbox-api.paddle.com";

async function testPortalSession(customerId: string) {
  if (!PADDLE_API_KEY) {
    console.error("❌ PADDLE_API_KEY not set");
    process.exit(1);
  }

  console.log("🔍 Testing Paddle Portal Session Creation");
  console.log("Environment:", PADDLE_ENVIRONMENT);
  console.log("API Base:", PADDLE_API_BASE);
  console.log("Customer ID:", customerId);
  console.log("---");

  try {
    // First, check if customer exists
    console.log("1️⃣ Checking if customer exists...");
    const customerResponse = await axios.get(
      `${PADDLE_API_BASE}/customers/${customerId}`,
      {
        headers: {
          Authorization: `Bearer ${PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Customer found:");
    console.log("  - Email:", customerResponse.data.data.email);
    console.log("  - ID:", customerResponse.data.data.id);
    console.log("  - Status:", customerResponse.data.data.status);
    console.log("---");

    // Try to create portal session
    console.log("2️⃣ Creating portal session...");
    const response = await axios({
      method: 'POST',
      url: `${PADDLE_API_BASE}/customers/${customerId}/portal-sessions`,
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const portalUrl = response.data.data.urls.general.overview;

    console.log("✅ Portal session created successfully!");
    console.log("  - Session ID:", response.data.data.id);
    console.log("  - Portal URL:", portalUrl);
    console.log("---");
    console.log("🎉 Success! Portal session creation works.");

  } catch (error: any) {
    console.error("❌ Error occurred:");
    console.error("  - Status:", error.response?.status);
    console.error("  - Error Code:", error.response?.data?.error?.code);
    console.error("  - Error Detail:", error.response?.data?.error?.detail);
    console.error("  - Full Error:", JSON.stringify(error.response?.data, null, 2));
    console.log("---");
    console.error("🚨 Portal session creation failed!");
    process.exit(1);
  }
}

// Get customer ID from command line
const customerId = process.argv[2];
if (!customerId) {
  console.error("Usage: tsx debug-paddle-portal.ts <paddle_customer_id>");
  process.exit(1);
}

testPortalSession(customerId);
