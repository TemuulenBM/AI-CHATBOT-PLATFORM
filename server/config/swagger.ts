import swaggerJsdoc from 'swagger-jsdoc';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get directory path - works in both ESM and CommonJS (bundled) environments
function getDirname(): string {
  // In bundled CommonJS, import.meta is unavailable but __dirname exists
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // In ESM modules, use import.meta.url
  return dirname(fileURLToPath(import.meta.url));
}

const currentDir = getDirname();

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ConvoAI API Documentation',
      version: '1.0.0',
      description: `
# ConvoAI - AI Chatbot Platform API

ConvoAI is an enterprise-grade AI chatbot platform for automating customer support.
This API enables you to create, manage, and interact with AI-powered chatbots that can be embedded on any website.

## Key Features

- **AI-Powered Chatbots**: Create intelligent chatbots trained on your website content
- **Knowledge Base Management**: Add custom Q&A entries and train on specific content
- **Real-time Analytics**: Track conversations, sentiment, and user behavior
- **Widget Integration**: Embed chatbots seamlessly on any website
- **Subscription Management**: Flexible pricing plans with usage limits
- **Automated Scraping**: Keep chatbot knowledge up-to-date with scheduled re-scraping

## Authentication

Most endpoints require authentication using Clerk JWT tokens. Include the token in the Authorization header:

\`\`\`
Authorization: Bearer YOUR_JWT_TOKEN
\`\`\`

## CSRF Protection

State-changing requests (POST, PUT, PATCH, DELETE) require CSRF tokens for security:

1. Obtain a CSRF token from \`GET /api/csrf-token\`
2. Include the token in the \`X-CSRF-Token\` header for protected requests

## Rate Limiting

- Chat endpoints: Limited to prevent abuse
- Chatbot creation: Rate limited based on subscription plan
- Widget analytics: Rate limited per chatbot

## Error Handling

All errors follow a consistent format:

\`\`\`json
{
  "message": "Error description",
  "code": "ERROR_CODE",
  "details": {},
  "requestId": "unique-request-id"
}
\`\`\`

Common HTTP status codes:
- \`200\`: Success
- \`400\`: Bad Request (validation error)
- \`401\`: Unauthorized (authentication required)
- \`403\`: Forbidden (insufficient permissions)
- \`404\`: Not Found
- \`429\`: Too Many Requests (rate limit exceeded)
- \`500\`: Internal Server Error
      `.trim(),
      contact: {
        name: 'ConvoAI Support',
        email: 'support@convoai.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.convoai.com',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'Health & Monitoring',
        description: 'System health checks and monitoring endpoints',
      },
      {
        name: 'Chatbots',
        description: 'Chatbot management and configuration',
      },
      {
        name: 'Chat',
        description: 'Chat interactions and conversations',
      },
      {
        name: 'Knowledge Base',
        description: 'Custom knowledge entries and Q&A management',
      },
      {
        name: 'Analytics',
        description: 'Conversation analytics and insights',
      },
      {
        name: 'Widget',
        description: 'Widget configuration and analytics',
      },
      {
        name: 'Subscriptions',
        description: 'Subscription and payment management',
      },
      {
        name: 'Webhooks',
        description: 'Webhook endpoints for external integrations',
      },
      {
        name: 'Feedback',
        description: 'User feedback and satisfaction tracking',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Clerk JWT token for authentication',
        },
        CsrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description: 'CSRF token obtained from /api/csrf-token endpoint',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Human-readable error message',
            },
            code: {
              type: 'string',
              description: 'Machine-readable error code',
            },
            details: {
              type: 'object',
              description: 'Additional error details',
            },
            requestId: {
              type: 'string',
              format: 'uuid',
              description: 'Unique request identifier for tracking',
            },
          },
        },
        Chatbot: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique chatbot identifier',
            },
            user_id: {
              type: 'string',
              description: 'Owner user ID',
            },
            name: {
              type: 'string',
              description: 'Chatbot display name',
              example: 'Support Bot',
            },
            website_url: {
              type: 'string',
              format: 'uri',
              description: 'Website URL to scrape for knowledge',
              example: 'https://example.com',
            },
            personality: {
              type: 'string',
              description: 'Chatbot personality and tone',
              example: 'friendly',
            },
            system_prompt: {
              type: 'string',
              description: 'Custom system prompt for AI behavior',
            },
            initial_message: {
              type: 'string',
              description: 'First message shown to users',
              example: 'Hi! How can I help you today?',
            },
            suggested_questions: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Suggested questions for users',
            },
            theme_color: {
              type: 'string',
              description: 'Primary theme color',
              example: '#3B82F6',
            },
            text_color: {
              type: 'string',
              description: 'Text color',
              example: '#FFFFFF',
            },
            branding_url: {
              type: 'string',
              format: 'uri',
              description: 'Logo or branding image URL',
            },
            auto_scrape_enabled: {
              type: 'boolean',
              description: 'Enable automatic re-scraping',
            },
            scrape_frequency: {
              type: 'string',
              enum: ['daily', 'weekly', 'monthly'],
              description: 'Auto-scrape frequency',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        CreateChatbotRequest: {
          type: 'object',
          required: ['website_url', 'name'],
          properties: {
            website_url: {
              type: 'string',
              format: 'uri',
              description: 'Website URL to scrape',
              example: 'https://example.com',
            },
            name: {
              type: 'string',
              description: 'Chatbot name',
              example: 'Support Bot',
            },
            personality: {
              type: 'string',
              description: 'Chatbot personality',
              example: 'friendly',
            },
            system_prompt: {
              type: 'string',
              description: 'Custom system prompt',
            },
            initial_message: {
              type: 'string',
              description: 'Initial greeting message',
            },
            suggested_questions: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Suggested questions',
            },
            theme_color: {
              type: 'string',
              description: 'Theme color hex code',
              example: '#3B82F6',
            },
            text_color: {
              type: 'string',
              description: 'Text color hex code',
              example: '#FFFFFF',
            },
            branding_url: {
              type: 'string',
              format: 'uri',
              description: 'Branding image URL',
            },
          },
        },
        Conversation: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Conversation ID',
            },
            chatbot_id: {
              type: 'string',
              format: 'uuid',
              description: 'Associated chatbot ID',
            },
            session_id: {
              type: 'string',
              description: 'User session identifier',
            },
            user_message: {
              type: 'string',
              description: 'User message content',
            },
            bot_response: {
              type: 'string',
              description: 'Bot response content',
            },
            sentiment: {
              type: 'string',
              enum: ['positive', 'neutral', 'negative'],
              description: 'Detected message sentiment',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Message timestamp',
            },
          },
        },
        ChatMessageRequest: {
          type: 'object',
          required: ['chatbot_id', 'session_id', 'message'],
          properties: {
            chatbot_id: {
              type: 'string',
              format: 'uuid',
              description: 'Chatbot ID',
            },
            session_id: {
              type: 'string',
              description: 'Session ID',
            },
            message: {
              type: 'string',
              description: 'User message',
              example: 'What are your business hours?',
            },
          },
        },
        KnowledgeEntry: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Knowledge entry ID',
            },
            chatbot_id: {
              type: 'string',
              format: 'uuid',
              description: 'Associated chatbot ID',
            },
            question: {
              type: 'string',
              description: 'Question or topic',
              example: 'What are your business hours?',
            },
            answer: {
              type: 'string',
              description: 'Answer or content',
              example: 'We are open Monday-Friday, 9 AM to 5 PM EST.',
            },
            source_url: {
              type: 'string',
              format: 'uri',
              description: 'Source URL for reference',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp',
            },
          },
        },
        AnalyticsSummary: {
          type: 'object',
          properties: {
            total_conversations: {
              type: 'integer',
              description: 'Total number of conversations',
            },
            total_messages: {
              type: 'integer',
              description: 'Total messages sent',
            },
            avg_response_time: {
              type: 'number',
              format: 'float',
              description: 'Average response time in seconds',
            },
            sentiment_breakdown: {
              type: 'object',
              properties: {
                positive: {
                  type: 'integer',
                },
                neutral: {
                  type: 'integer',
                },
                negative: {
                  type: 'integer',
                },
              },
            },
            satisfaction_score: {
              type: 'number',
              format: 'float',
              description: 'Average satisfaction score (1-5)',
            },
          },
        },
        Subscription: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Subscription ID',
            },
            user_id: {
              type: 'string',
              description: 'User ID',
            },
            plan: {
              type: 'string',
              enum: ['free', 'pro', 'enterprise'],
              description: 'Subscription plan',
            },
            status: {
              type: 'string',
              enum: ['active', 'cancelled', 'past_due'],
              description: 'Subscription status',
            },
            current_period_start: {
              type: 'string',
              format: 'date-time',
              description: 'Current billing period start',
            },
            current_period_end: {
              type: 'string',
              format: 'date-time',
              description: 'Current billing period end',
            },
            usage: {
              type: 'object',
              properties: {
                messages_count: {
                  type: 'integer',
                  description: 'Messages used this period',
                },
                chatbots_count: {
                  type: 'integer',
                  description: 'Number of chatbots created',
                },
              },
            },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ok', 'degraded', 'error'],
              description: 'Overall system status',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Health check timestamp',
            },
            services: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['connected', 'disconnected'],
                    },
                    latency: {
                      type: 'number',
                      description: 'Database latency in ms',
                    },
                  },
                },
                redis: {
                  type: 'string',
                  enum: ['connected', 'disconnected'],
                  description: 'Redis connection status',
                },
                openai: {
                  type: 'string',
                  enum: ['available', 'unavailable'],
                  description: 'OpenAI API status',
                },
                paddle: {
                  type: 'string',
                  enum: ['available', 'unavailable'],
                  description: 'Paddle API status',
                },
              },
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                message: 'Authentication required',
                code: 'UNAUTHORIZED',
                requestId: '550e8400-e29b-41d4-a716-446655440000',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                message: 'Insufficient permissions',
                code: 'FORBIDDEN',
                requestId: '550e8400-e29b-41d4-a716-446655440000',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                message: 'Resource not found',
                code: 'NOT_FOUND',
                requestId: '550e8400-e29b-41d4-a716-446655440000',
              },
            },
          },
        },
        ValidationError: {
          description: 'Invalid request data',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                message: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: {
                  website_url: 'Invalid URL format',
                },
                requestId: '550e8400-e29b-41d4-a716-446655440000',
              },
            },
          },
        },
        RateLimitError: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                message: 'Too many requests',
                code: 'RATE_LIMIT_EXCEEDED',
                requestId: '550e8400-e29b-41d4-a716-446655440000',
              },
            },
          },
        },
      },
      parameters: {
        ChatbotId: {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Unique chatbot identifier',
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
        ConversationId: {
          name: 'conversationId',
          in: 'path',
          required: true,
          description: 'Unique conversation identifier',
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
        SessionId: {
          name: 'sessionId',
          in: 'path',
          required: true,
          description: 'User session identifier',
          schema: {
            type: 'string',
          },
        },
        Pagination: {
          name: 'page',
          in: 'query',
          description: 'Page number for pagination',
          schema: {
            type: 'integer',
            minimum: 1,
            default: 1,
          },
        },
        Limit: {
          name: 'limit',
          in: 'query',
          description: 'Number of items per page',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },
      },
    },
  },
  apis: [
    join(currentDir, '../routes/**/*.ts'),
    join(currentDir, '../routes.ts'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
