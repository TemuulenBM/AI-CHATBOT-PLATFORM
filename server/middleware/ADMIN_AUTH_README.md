# Admin Authorization Middleware

This module provides admin role-based authorization for your application, built on top of Clerk authentication.

## Overview

The admin authorization system adds the ability to restrict certain routes and operations to admin users. It integrates seamlessly with your existing Clerk authentication and caches admin status in Redis for optimal performance.

## Features

- **Role-based access control** - Restrict routes to admin users only
- **Redis caching** - Admin status cached for 5 minutes to reduce database queries
- **Clerk integration** - Admin status can be set via Clerk user metadata
- **Helper functions** - Easily grant/revoke admin access programmatically
- **Comprehensive tests** - 20 test cases covering all scenarios

## Database Schema

The admin system adds an `is_admin` boolean field to the `users` table:

```sql
ALTER TABLE users
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
```

To apply this migration:

```bash
# Run migration against your Supabase database
psql $DATABASE_URL -f supabase/migrations/013_add_admin_role.sql
```

## Middleware Usage

### 1. Require Admin Access

Use `requireAdmin` to protect routes that should only be accessible by admin users:

```typescript
import { clerkAuthMiddleware, loadAdminStatus, requireAdmin } from '../middleware/adminAuth';

// Protect admin routes
router.use('/admin', clerkAuthMiddleware); // Authenticate first
router.use('/admin', loadAdminStatus);     // Load admin status
router.use('/admin', requireAdmin);        // Require admin access

// All routes under /admin are now admin-only
router.get('/admin/users', adminController.getUsers);
router.delete('/admin/users/:id', adminController.deleteUser);
```

### 2. Optional Admin Access

Use `optionalAdmin` for routes that behave differently for admin users:

```typescript
import { clerkAuthMiddleware, optionalAdmin } from '../middleware/adminAuth';

router.use(clerkAuthMiddleware);
router.use(optionalAdmin);

router.get('/users', (req: AdminAuthenticatedRequest, res) => {
  if (req.isAdmin) {
    // Admins see all users
    return res.json(await getAllUsers());
  } else {
    // Regular users only see themselves
    return res.json(await getUser(req.user.userId));
  }
});
```

### 3. Middleware Chain Order

**IMPORTANT:** Middleware must be applied in this order:

1. `clerkAuthMiddleware` - Authenticates the user
2. `loadAdminStatus` OR `optionalAdmin` - Loads admin status
3. `requireAdmin` - Enforces admin access (if needed)

```typescript
// ✅ CORRECT
router.use(clerkAuthMiddleware);
router.use(loadAdminStatus);
router.use(requireAdmin);

// ❌ WRONG - loadAdminStatus must come after clerkAuthMiddleware
router.use(loadAdminStatus);
router.use(clerkAuthMiddleware);
router.use(requireAdmin);
```

## Setting Admin Status

### Method 1: Via Clerk Dashboard (Recommended)

1. Go to your Clerk Dashboard → Users
2. Select a user
3. Navigate to "Metadata" tab
4. Add to `public_metadata`:
   ```json
   {
     "is_admin": true
   }
   ```
5. The webhook will automatically sync this to your database

### Method 2: Programmatically

```typescript
import { grantAdminAccess, revokeAdminAccess } from '../middleware/adminAuth';

// Grant admin access
await grantAdminAccess('user_2abc123def456');

// Revoke admin access
await revokeAdminAccess('user_2abc123def456');
```

### Method 3: Direct Database Update

```sql
-- Grant admin access
UPDATE users SET is_admin = true WHERE id = 'user_2abc123def456';

-- Revoke admin access
UPDATE users SET is_admin = false WHERE id = 'user_2abc123def456';
```

**Note:** After direct database updates, you should invalidate the cache:

```typescript
import { invalidateAdminCache } from '../middleware/adminAuth';
await invalidateAdminCache('user_2abc123def456');
```

## API Reference

### Middleware Functions

#### `loadAdminStatus(req, res, next)`

Loads the admin status for the authenticated user and sets `req.isAdmin`.

- **Requires:** User must be authenticated (via `clerkAuthMiddleware`)
- **Caching:** Results cached in Redis for 5 minutes
- **Sets:** `req.isAdmin` (boolean)

#### `requireAdmin(req, res, next)`

Middleware that enforces admin access. Throws `AuthorizationError` if user is not an admin.

- **Requires:** `clerkAuthMiddleware` and `loadAdminStatus` must run first
- **Throws:** `AuthenticationError` if not authenticated
- **Throws:** `AuthorizationError` if not admin

#### `optionalAdmin(req, res, next)`

Loads admin status but doesn't require it. Useful for routes with conditional behavior.

- **Requires:** User authentication (optional)
- **Sets:** `req.isAdmin` if user is authenticated

### Helper Functions

#### `grantAdminAccess(userId: string): Promise<void>`

Grants admin privileges to a user.

- Updates database
- Invalidates cache
- Logs the action

```typescript
await grantAdminAccess('user_2abc123def456');
```

#### `revokeAdminAccess(userId: string): Promise<void>`

Revokes admin privileges from a user.

- Updates database
- Invalidates cache
- Logs the action

```typescript
await revokeAdminAccess('user_2abc123def456');
```

#### `invalidateAdminCache(userId: string): Promise<void>`

Invalidates the cached admin status for a specific user.

```typescript
await invalidateAdminCache('user_2abc123def456');
```

## TypeScript Types

```typescript
export interface AdminAuthenticatedRequest extends AuthenticatedRequest {
  user?: {
    userId: string;
    email: string;
  };
  subscription?: {
    plan: PlanType;
    usage: {
      messages_count: number;
      chatbots_count: number;
    };
  };
  isAdmin?: boolean;
}
```

## Error Handling

The middleware throws standard error types that are handled by your error middleware:

- **`AuthenticationError` (401)** - User is not authenticated
- **`AuthorizationError` (403)** - User is not an admin

```typescript
router.get('/admin/users',
  clerkAuthMiddleware,
  loadAdminStatus,
  requireAdmin,
  async (req: AdminAuthenticatedRequest, res) => {
    // This will only run if user is authenticated AND is admin
    // Otherwise, appropriate error is thrown
  }
);
```

## Performance Considerations

### Caching

- Admin status is cached in Redis for **5 minutes** (300 seconds)
- Cache key format: `admin_status:{userId}`
- Cache is automatically invalidated when admin status changes

### Database Queries

- First request: Queries database and caches result
- Subsequent requests (within 5 min): Served from cache
- Index on `is_admin` column optimizes queries

## Security Best Practices

1. **Always use HTTPS** in production
2. **Set admin status via Clerk Dashboard** for audit trail
3. **Use `public_metadata`** not `unsafe_metadata` in Clerk
4. **Monitor admin actions** using the logger
5. **Regularly audit admin users** in your database

## Example: Complete Admin Routes Setup

```typescript
import express from 'express';
import {
  clerkAuthMiddleware,
  loadAdminStatus,
  requireAdmin,
  AdminAuthenticatedRequest
} from './middleware/adminAuth';

const router = express.Router();

// Public routes (no auth required)
router.get('/health', (req, res) => res.json({ status: 'ok' }));

// User routes (auth required)
router.use('/api', clerkAuthMiddleware);
router.get('/api/profile', (req: AdminAuthenticatedRequest, res) => {
  res.json({ userId: req.user.userId });
});

// Admin routes (admin required)
router.use('/api/admin', loadAdminStatus);
router.use('/api/admin', requireAdmin);

router.get('/api/admin/users', async (req, res) => {
  // Only admins can access this
  const users = await getAllUsers();
  res.json(users);
});

router.post('/api/admin/users/:id/ban', async (req, res) => {
  // Only admins can ban users
  await banUser(req.params.id);
  res.json({ success: true });
});

export default router;
```

## Testing

Run the admin auth tests:

```bash
npm test -- adminAuth.test.ts
```

The test suite covers:
- Loading admin status from cache and database
- Admin access enforcement
- Non-admin rejection
- Cache invalidation
- Grant/revoke operations
- Error scenarios

## Webhook Integration

The Clerk webhook automatically syncs admin status from Clerk to your database:

- **user.created** - Sets `is_admin` from `public_metadata.is_admin`
- **user.updated** - Updates `is_admin` and invalidates cache
- **user.deleted** - Removes user data

No additional configuration needed beyond setting up your Clerk webhook.

## Migration from Subscription-based Authorization

If you're migrating from the existing subscription-based system (`requirePlan`), you can use both together:

```typescript
// Require both admin AND premium plan
router.post('/api/admin/premium-feature',
  clerkAuthMiddleware,
  loadSubscription,
  loadAdminStatus,
  requireAdmin,
  requirePlan('growth', 'business'),
  controller.premiumFeature
);
```

## Troubleshooting

### Admin status not loading

**Check:** Is `loadAdminStatus` middleware applied before `requireAdmin`?

```typescript
// ✅ Correct order
router.use(clerkAuthMiddleware);
router.use(loadAdminStatus);
router.use(requireAdmin);
```

### Changes not reflected

**Solution:** Invalidate cache after manual database updates:

```typescript
await invalidateAdminCache(userId);
```

### "Authorization check failed" error

**Cause:** `requireAdmin` called before `loadAdminStatus`

**Solution:** Ensure middleware order is correct (see above)

### Redis connection errors

**Check:** Ensure Redis is running and `REDIS_URL` is configured

```bash
# Test Redis connection
redis-cli ping
# Should return: PONG
```

## License

MIT
