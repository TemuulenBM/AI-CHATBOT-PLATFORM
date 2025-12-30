# CSRF Protection Implementation

## Overview

This document describes the Cross-Site Request Forgery (CSRF) protection implementation for the AI Chatbot Platform. Our implementation provides **defense-in-depth** security even though we use Clerk's JWT-based authentication.

## Why CSRF Protection?

While JWT tokens sent via Bearer headers significantly reduce CSRF risk compared to cookie-based sessions, we implement CSRF protection to:

1. **Defense in depth** - Multiple layers of security
2. **Protect against token leakage** - If a JWT token is compromised, CSRF tokens provide additional protection
3. **Compliance** - Meet security best practices and compliance requirements
4. **Future-proofing** - Protection if authentication mechanism changes

## Implementation Details

### Architecture: Double Submit Cookie Pattern

We use the **Double Submit Cookie** pattern with the following approach:

```
┌─────────────┐                    ┌─────────────┐
│   Browser   │                    │   Server    │
└─────────────┘                    └─────────────┘
       │                                  │
       │  1. First request (any page)     │
       ├─────────────────────────────────>│
       │                                  │
       │  2. Set two cookies:             │
       │     - __Host-csrf-token (httpOnly)
       │     - csrf-token-readable        │
       │<─────────────────────────────────┤
       │                                  │
       │  3. POST/PUT/DELETE request      │
       │     Headers:                     │
       │       X-CSRF-Token: <token>      │
       │     Cookies:                     │
       │       __Host-csrf-token: <token> │
       ├─────────────────────────────────>│
       │                                  │
       │  4. Validate: cookie == header   │
       │     using timing-safe comparison │
       │                                  │
       │  5. Request processed            │
       │<─────────────────────────────────┤
```

### Components

#### 1. Server-side Middleware (`server/middleware/csrf.ts`)

**`setCsrfToken()`**
- Generates cryptographically secure random token (256 bits)
- Sets two cookies:
  - `__Host-csrf-token`: httpOnly cookie (can't be read by JavaScript)
  - `csrf-token-readable`: Non-httpOnly cookie (can be read by JavaScript)
- Uses `__Host-` prefix for enhanced security (requires HTTPS, path=/, no domain)

**`validateCsrfToken()`**
- Validates CSRF tokens on state-changing requests (POST, PUT, PATCH, DELETE)
- Skips validation for:
  - Safe HTTP methods (GET, HEAD, OPTIONS)
  - Webhook endpoints (use signature validation instead)
  - Public widget endpoints (protected by CORS)
- Uses `crypto.timingSafeEqual()` to prevent timing attacks
- Returns 403 Forbidden if validation fails

**`getCsrfToken()`**
- Endpoint: `GET /api/csrf-token`
- Returns the CSRF token for clients that can't read cookies directly

#### 2. Client-side Utilities (`client/src/hooks/use-csrf.ts`)

**`useCsrfToken()`** - React Hook
```typescript
const csrfToken = useCsrfToken();
```

**`useCsrfHeaders()`** - React Hook
```typescript
const csrfHeaders = useCsrfHeaders();

fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    ...csrfHeaders,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data)
});
```

**`getCsrfToken()`** - Utility Function
```typescript
const token = getCsrfToken(); // Returns string | null
```

**`getCsrfHeaders()`** - Utility Function
```typescript
const headers = getCsrfHeaders(); // Returns { 'X-CSRF-Token': token }
```

#### 3. Integration

The chatbot store (`client/src/store/chatbot-store.ts`) automatically includes CSRF tokens in all API requests through the `getAuthHeaders()` helper function.

## Security Properties

### ✅ Protection Against CSRF Attacks

1. **Attacker cannot read cookies** due to Same-Origin Policy
2. **Attacker cannot set custom headers** in cross-origin requests
3. **Token is cryptographically random** (256 bits of entropy)
4. **Timing-safe comparison** prevents timing attacks
5. **Short-lived tokens** (24 hour expiration)

### ✅ Defense in Depth

Even with Clerk JWT authentication providing primary CSRF protection, our implementation adds:

- **Additional validation layer** for state-changing operations
- **Protection if JWT is leaked** or stolen
- **Compliance with security standards** (OWASP recommendations)

### ✅ Secure Cookie Attributes

```javascript
{
  httpOnly: true,           // Can't be read by JavaScript
  secure: true,             // HTTPS only (production)
  sameSite: "strict",       // Prevents cross-site sending
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: "/",                // Available site-wide
}
```

## Exemptions

CSRF validation is **skipped** for:

1. **Safe HTTP methods**: GET, HEAD, OPTIONS (read-only operations)
2. **Webhook endpoints**: `/api/webhooks/*` (use signature validation)
3. **Public widget endpoints**:
   - `/api/chat/widget`
   - `/api/feedback`
   - `/api/analytics/widget/track`
   (protected by CORS instead)

## Testing

Comprehensive test suite at `tests/unit/middleware/csrf.test.ts`:

```bash
npm run test -- tests/unit/middleware/csrf.test.ts
```

**Test coverage includes:**
- ✅ Token generation and cookie setting
- ✅ Token validation for state-changing requests
- ✅ Safe method bypasses
- ✅ Webhook endpoint exemptions
- ✅ Missing token rejection
- ✅ Token mismatch rejection
- ✅ Cryptographic randomness
- ✅ Timing-safe comparison

**All 16 tests pass** ✓

## Usage Examples

### Example 1: React Component with Form

```typescript
import { useCsrfHeaders } from '@/hooks/use-csrf';
import { useAuth } from '@clerk/clerk-react';

function CreateChatbotForm() {
  const csrfHeaders = useCsrfHeaders();
  const { getToken } = useAuth();

  const handleSubmit = async (data) => {
    const authToken = await getToken();

    const response = await fetch('/api/chatbots', {
      method: 'POST',
      headers: {
        ...csrfHeaders,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    // Handle response...
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Example 2: Zustand Store (Automatic)

The chatbot store automatically includes CSRF tokens:

```typescript
// In chatbot-store.ts, getAuthHeaders() automatically adds CSRF headers
const headers = await getAuthHeaders(get()._getToken);
// headers = {
//   'Authorization': 'Bearer <jwt>',
//   'X-CSRF-Token': '<csrf-token>'
// }

const response = await fetch('/api/chatbots', {
  method: 'POST',
  headers,
  body: JSON.stringify(data)
});
```

### Example 3: Manual Fetch

```typescript
import { getCsrfHeaders } from '@/hooks/use-csrf';

async function deleteItem(id: string) {
  const response = await fetch(`/api/items/${id}`, {
    method: 'DELETE',
    headers: getCsrfHeaders(),
  });

  return response.json();
}
```

## Troubleshooting

### Issue: "CSRF token missing in cookie"

**Cause:** Cookie not set or expired

**Solution:**
1. Ensure the user has made at least one request to the server
2. Check browser console for cookie (look for `csrf-token-readable`)
3. Verify cookies are not blocked by browser settings

### Issue: "CSRF token missing in request header"

**Cause:** Frontend not sending the `X-CSRF-Token` header

**Solution:**
1. Import and use `getCsrfHeaders()` or `useCsrfHeaders()`
2. Ensure headers are included in fetch/axios requests
3. Check network tab to verify header is being sent

### Issue: "Invalid CSRF token"

**Cause:** Token in cookie doesn't match token in header

**Solution:**
1. Clear browser cookies and refresh
2. Check for multiple tabs/windows with stale tokens
3. Verify token is being read correctly from cookie

## Deployment Checklist

- [x] Cookie-parser middleware installed and configured
- [x] CSRF middleware applied before route handlers
- [x] setCsrfToken middleware applied to all routes
- [x] validateCsrfToken middleware applied to API routes
- [x] Client-side utilities created (use-csrf.ts)
- [x] Chatbot store updated to include CSRF headers
- [x] Tests written and passing (16/16)
- [x] Documentation created

## Security Audit Results

✅ **OWASP Top 10 Compliance**: CSRF protection implemented
✅ **Defense in Depth**: Multiple security layers (JWT + CSRF)
✅ **Timing Attack Prevention**: Uses `crypto.timingSafeEqual()`
✅ **Strong Randomness**: 256-bit cryptographic tokens
✅ **Secure Cookies**: httpOnly, secure, sameSite=strict
✅ **Proper Exemptions**: Webhooks and public endpoints handled correctly

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Double Submit Cookie Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)
- [MDN: CSRF](https://developer.mozilla.org/en-US/docs/Glossary/CSRF)
- [__Host- Cookie Prefix](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#cookie_prefixes)

## Maintenance

### Token Rotation

Tokens are automatically rotated:
- **Expiration**: 24 hours
- **Generation**: On first request or after expiration
- **Storage**: In-memory on client (cookie), no server-side storage needed

### Monitoring

Monitor these metrics in production:
- CSRF validation failures (403 responses with CSRF_TOKEN_INVALID)
- Missing token errors
- Webhook bypass usage

### Future Enhancements

Consider these improvements for even stronger protection:
1. **Token rotation on sensitive actions** (e.g., password change)
2. **Per-session tokens** (require re-authentication)
3. **Rate limiting on CSRF failures** (prevent brute force)
4. **Alerting on suspicious patterns** (multiple failures from same IP)
