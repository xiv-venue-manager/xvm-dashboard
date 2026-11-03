# CSRF Protection Implementation

## Overview

XIV Venue Manager uses **NextAuth.js built-in CSRF protection** using the "double submit cookie" method to safeguard against Cross-Site Request Forgery attacks.

## How It Works

### 1. CSRF Token Generation

NextAuth automatically generates a cryptographically secure CSRF token for each session. This token is:

- Stored in a signed, HttpOnly cookie
- Validated on every authentication-related request
- Rotated on each session update

### 2. Cookie Configuration

#### Production (Vercel)

```
__Host-next-auth.csrf-token (CSRF token)
__Secure-xvm.session-token (Session)
__Secure-next-auth.callback-url (Callback URL)
```

The `__Host-` prefix ensures:

- Cookie is only sent to the exact host (no subdomains)
- Must be set with `Secure` flag
- Must be set with `Path=/`
- Cannot be overridden by JavaScript

The `__Secure-` prefix ensures:

- Cookie is only sent over HTTPS
- Prevents man-in-the-middle attacks

#### Development (localhost)

```
next-auth.csrf-token
xvm.session-token
next-auth.callback-url
```

No prefixes in development to allow HTTP connections.

### 3. Cookie Security Settings

All cookies are configured with:

- **httpOnly: true** - Cannot be accessed by JavaScript (XSS protection)
- **sameSite: "lax"** - Sent on same-site requests and top-level navigation (CSRF protection)
- **secure: true** (production only) - Only sent over HTTPS
- **path: "/"** - Available to entire application

## CSRF Validation Flow

```
┌─────────────────┐
│   User Action   │
│ (POST/DELETE)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  NextAuth.js    │
│ CSRF Validation │
└────────┬────────┘
         │
    ┌────┴────┐
    │  Valid? │
    └────┬────┘
         │
    ┌────┴───────────┐
    │                │
    ▼                ▼
┌────────┐      ┌─────────┐
│ Allow  │      │ Reject  │
│Request │      │ 403     │
└────────┘      └─────────┘
```

## Protected Operations

NextAuth CSRF protection automatically covers:

- Sign in/sign out operations
- Session token refresh
- OAuth callback handling

**Additional API route protection** is handled by:

- NextAuth session validation (`getServerSession`)
- Rate limiting middleware
- Role-based access control (RBAC)

## Session Security

Sessions are configured with:

- **Max Age**: 7 days
- **Update Age**: 24 hours (session token refreshed daily)
- **Strategy**: JWT (stateless, scalable)

Expired sessions automatically redirect to sign-in page.

## Open Redirect Protection

The `redirect` callback prevents open redirect attacks by:

1. Allowing relative URLs (e.g., `/dashboard`)
2. Allowing same-origin URLs only
3. Defaulting to base URL for external redirects

```typescript
async redirect({ url, baseUrl }) {
  if (url.startsWith("/")) return `${baseUrl}${url}`
  else if (new URL(url).origin === baseUrl) return url
  return baseUrl
}
```

## Testing CSRF Protection

### Manual Testing

1. **Valid CSRF Token** (should succeed):

   ```bash
   # Sign in normally through the UI
   # Perform any POST/DELETE operation
   # Should work without issues
   ```

2. **Missing CSRF Token** (should fail):

   ```bash
   curl -X POST https://xivvenuemanager.com/api/auth/signin \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}'

   # Response: 403 Forbidden
   ```

3. **Invalid CSRF Token** (should fail):
   ```bash
   curl -X POST https://xivvenuemanager.com/api/auth/signin \
     -H "Content-Type: application/json" \
     -H "Cookie: __Host-next-auth.csrf-token=invalid" \
     -d '{"email":"test@example.com"}'

   # Response: 403 Forbidden
   ```

### Automated Testing

Add to your test suite:

```typescript
// tests/csrf.test.ts
import { expect, test } from "@jest/globals"

test("POST without CSRF token should fail", async () => {
  const response = await fetch("/api/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com" }),
  })

  expect(response.status).toBe(403)
})

test("POST with valid CSRF token should succeed", async () => {
  // Get CSRF token from NextAuth
  const csrfResponse = await fetch("/api/auth/csrf")
  const { csrfToken } = await csrfResponse.json()

  // Use CSRF token in request
  const response = await fetch("/api/auth/signin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ email: "test@example.com" }),
  })

  expect(response.status).not.toBe(403)
})
```

## Browser DevTools Inspection

To verify CSRF cookies are properly set:

1. Open DevTools → Application → Cookies
2. Look for these cookies on `xivvenuemanager.com`:
   - `__Host-next-auth.csrf-token`
   - `__Secure-xvm.session-token`
   - `__Secure-next-auth.callback-url`

3. Verify cookie attributes:
   - ✅ HttpOnly: true
   - ✅ Secure: true (production only)
   - ✅ SameSite: Lax
   - ✅ Path: /
   - ✅ Domain: (empty for __Host- cookies)

## Additional Security Layers

Beyond NextAuth CSRF protection:

1. **Rate Limiting** - Upstash Redis prevents brute force
2. **Input Validation** - Zod schemas on all API endpoints
3. **Role-Based Access Control** - Permission checks before operations
4. **Prisma ORM** - SQL injection protection
5. **Security Headers** - (see next.config.ts)

## References

- [NextAuth.js Security Documentation](https://next-auth.js.org/configuration/options#cookies)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN: SameSite Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [Cookie Prefixes (__Host- and __Secure-)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#cookie_prefixes)

## Troubleshooting

### CSRF Token Errors in Development

If you see CSRF errors in development:

1. Clear cookies in DevTools
2. Restart development server
3. Sign out and sign back in

### CSRF Token Errors in Production

If users report CSRF errors:

1. Check that `NEXTAUTH_URL` environment variable is correctly set
2. Verify HTTPS is enabled
3. Check browser console for cookie warnings
4. Ensure no browser extensions are blocking cookies

### Session Expiration

Sessions expire after 7 days of inactivity. Users will be redirected to `/auth/signin` automatically.

## Configuration Reference

```typescript
// lib/auth.ts
export const authOptions: NextAuthOptions = {
  // Enable secure cookies in production
  useSecureCookies: process.env.NODE_ENV === "production",

  cookies: {
    csrfToken: {
      name: isProduction ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
      },
    },
    // ... other cookies
  },

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // Refresh every 24 hours
  },

  callbacks: {
    async redirect({ url, baseUrl }) {
      // Prevent open redirect attacks
      if (url.startsWith("/")) return `${baseUrl}${url}`
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
  },
}
```

## Deployment Notes

When deploying to Vercel:

1. NextAuth automatically detects Vercel environment
2. `__Host-` prefixed cookies prevent subdomain attacks
3. Secure cookies enforced via `useSecureCookies: true`
4. No additional configuration needed

## Security Audit Checklist

- [x] CSRF protection enabled via NextAuth
- [x] Secure cookie configuration (HttpOnly, Secure, SameSite)
- [x] Cookie prefixes (__Host-, __Secure-) in production
- [x] Session expiration configured (7 days)
- [x] Open redirect prevention
- [x] Rate limiting on authentication endpoints
- [x] Input validation on all forms
- [x] Role-based access control

---

**Last Updated**: December 2, 2025
**Status**: ✅ Production-ready
