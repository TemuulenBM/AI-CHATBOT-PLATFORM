# Support Bot Configuration

## Quick Start

To update pricing or product information for the ConvoAI support bot, edit `support-bot.config.ts`.

## What You Can Update

### Pricing Plans
```typescript
pricing: [
  {
    name: "Starter",
    price: "$29/mo",
    chatbots: 3,
    messages: 1000,
  },
  // Add or modify plans here
]
```

### Product Features
```typescript
features: [
  "Auto-scrapes website URLs and creates vector embeddings",
  "Embeddable widget via single script tag",
  // Add new features here
]
```

### Tech Stack
```typescript
techStack: [
  "React",
  "Node.js",
  // Add or update technologies here
]
```

### Contact Information
```typescript
supportEmail: "support@convoai.com"
```

## How It Works

1. The config file generates the support bot's system prompt automatically
2. Changes take effect immediately on server restart
3. No need to modify the chat controller code
4. Follows KERNEL framework principles (Reproducible, Easy to verify)

## Example: Changing Pricing

**Before:**
```typescript
{
  name: "Starter",
  price: "$29/mo",
  chatbots: 3,
  messages: 1000,
}
```

**After:**
```typescript
{
  name: "Starter",
  price: "$39/mo",  // Price increased
  chatbots: 5,      // More chatbots
  messages: 2000,   // More messages
}
```

Restart the server and the support bot will use the new pricing automatically.

## Notes

- The prompt is generated using the `buildSupportBotPrompt()` function
- All values are type-checked by TypeScript
- The system maintains KERNEL framework structure (INPUT → TASK → CONSTRAINTS → OUTPUT)
