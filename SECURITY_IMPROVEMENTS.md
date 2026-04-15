# Security Improvement Report

**Project:** Drone Management System
**Date:** 2026-03-25
**Scope:** Security-focused code analysis

---

## Executive Summary

This document outlines security vulnerabilities and areas for improvement identified in the Drone Management System codebase. The application demonstrates good security practices in several areas (parameterized queries, bcrypt+pepper password hashing, CSRF protection, rate limiting), but there are notable issues that should be addressed.

---

## Critical Issues

### 1. Drone Tokens Stored in Plaintext

**Location:** `src/models/drone_management.js:8`, `src/routes/admin_drones.js:71-83`

**Issue:** Drone authentication tokens are stored in plaintext in the database and displayed in the admin interface. If the database is compromised, all drone tokens are immediately usable.

**Current Implementation:**
```javascript
// Stored directly without hashing
await connection.query(
    'INSERT INTO drones (drone_id, drone_token, ...) VALUES (?, ?, ...)',
    [params.drone_id, params.drone_token, ...]
);
```

**Recommendation:** Hash drone tokens using SHA-256 before storage, similar to password reset tokens. Display tokens only once during creation.

---

### 2. User Enumeration via Forgot Password

**Location:** `src/routes/auth.js:129-177`

**Issue:** The forgot password flow does not leak information directly via response timing, but the different code paths (user exists vs. doesn't exist) have different execution times that could be measured.

**Current Implementation:**
```javascript
if (rows && rows.length > 0 && String(rows[0].status) === 'active') {
    // Database operations, token generation, email sending...
}
// Always redirects to same page
return res.redirect('/forgot?sent=1');
```

**Recommendation:** Add constant-time delays or perform equivalent operations regardless of whether the user exists. Consider using a background job for email sending.

---

### 3. Audit Logs Not Persisted

**Location:** `src/utils/audit_logger.js:18`

**Issue:** Audit logs are only written to console (`console.log`). If the application restarts or crashes, audit trail is lost. For a drone management system, this is a compliance and forensics concern.

**Current Implementation:**
```javascript
console.log(`[AUDIT] ${JSON.stringify(payload)}`);
```

**Recommendation:**
- Persist audit logs to the database in a dedicated `audit_logs` table
- Consider using append-only storage or write-ahead logging
- Implement log rotation and retention policies

---

## High Priority Issues

### 4. Missing Content Security Policy

**Location:** `src/app.js:21-23`

**Issue:** Content Security Policy is explicitly disabled, leaving the application vulnerable to XSS attacks if any output escaping is missed.

**Current Implementation:**
```javascript
app.use(helmet({
    contentSecurityPolicy: false
}));
```

**Recommendation:** Implement a proper CSP:
```javascript
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"]
        }
    }
}));
```

---

### 5. Session Invalidation Not Comprehensive

**Location:** `src/routes/admin_users.js:320` (status update), `src/auth/middleware.js:53-62`

**Issue:** When a user is suspended, their existing sessions are not invalidated. The `refresh_session_user` function will catch this on the next request, but there's a window where suspended users can continue operating.

**Recommendation:**
- Implement immediate session invalidation when user status changes
- Store session tokens with user_id foreign key
- Add database trigger or application logic to delete sessions when status becomes 'suspended'

---

### 6. Password Reset Tokens Use SHA-256 Instead of Constant-Time Comparison

**Location:** `src/routes/auth.js:28-35`

**Issue:** While password reset tokens are hashed for storage (good), the token lookup uses a direct database query:
```javascript
const token_hash = sha256_hex(raw_token);
const [rows] = await pool.query(
    '... WHERE prt.token_hash = ? ...',
    [token_hash]
);
```

This is not vulnerable to timing attacks since the comparison happens in the database, but tokens should use HMAC with a server-side secret rather than plain SHA-256 to prevent rainbow table attacks.

**Recommendation:** Use `crypto.createHmac('sha256', SECRET).update(token).digest('hex')` for token hashing.

---

### 7. Email Validation Too Permissive

**Location:** `src/utils/validators.js:19-25`

**Issue:** Email validation only checks for minimum length and presence of '@':
```javascript
function sanitize_email(raw_value) {
    const email = String(raw_value || '').trim().toLowerCase();
    if (email.length < 5 || email.length > 255 || !email.includes('@')) {
        return null;
    }
    return email;
}
```

**Recommendation:** Use a more robust email validation regex or library. Consider implementing email verification flow.

---

### 8. Rate Limiting Bypasses with Distributed IPs

**Location:** `src/security/rate_limit.js`

**Issue:** Rate limiting is per-IP, which can be bypassed using distributed attacks or proxies. The rate limits (10 attempts/10min for login, 8 attempts/hour for forgot) are relatively generous.

**Recommendation:**
- Implement account-level rate limiting in addition to IP-based
- Add progressive delays after failed attempts
- Consider CAPTCHA after X failed attempts
- Implement account lockout after repeated failures

---

## Medium Priority Issues

### 9. Potential IDOR in User Drone Access

**Location:** `src/routes/admin_users.js:396-432`

**Issue:** The `drone-access` endpoint validates the target user but doesn't verify the drone_id belongs to a legitimate drone before the `drone_exists` check. While the code does validate this, more explicit early validation would be cleaner.

**Current Flow:**
```javascript
const drone_id = String(req.body.drone_id || '').trim();
// ... user validation ...
const exists = await user_management.drone_exists(drone_id);
```

**Recommendation:** Sanitize drone_id using `sanitize_drone_id()` validator like other endpoints.

---

### 10. Error Messages Leak Stack Traces in Development

**Location:** Multiple files with `console.error()`

**Issue:** Error handling logs full error objects which may contain sensitive information:
```javascript
console.error('[ADMIN_USERS] create failed', error);
```

**Recommendation:**
- Ensure production logging sanitizes error objects
- Never expose stack traces to clients
- Implement structured logging with severity levels

---

### 11. Missing HTTP Security Headers

**Location:** `src/app.js`

**Issue:** While Helmet is used, some important headers are missing or could be strengthened:
- `Permissions-Policy` (formerly Feature-Policy)
- `Cross-Origin-Embedder-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`

**Recommendation:** Add these headers:
```javascript
app.use(helmet({
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" }
}));
```

---

### 12. Trust Proxy Configuration

**Location:** `src/app.js:19`

**Issue:** `trust proxy` is set to `1`, meaning the app trusts the first proxy. If deployed behind multiple proxies or a misconfigured infrastructure, this could allow IP spoofing.

```javascript
app.set('trust proxy', 1);
```

**Recommendation:** Configure trust proxy based on actual deployment architecture. Document expected proxy chain.

---

### 13. Session Cookie Name Reveals Technology

**Location:** `src/config.js:74`

**Issue:** Default session cookie name is `sse.sid`, which could hint at the technology stack.

**Recommendation:** Use a generic, non-descriptive cookie name like `id` or `sid`.

---

### 14. Database Connection Pool Not Using SSL

**Location:** `src/db/pool.js` (implied from config)

**Issue:** No SSL/TLS configuration visible for database connections. If the database is on a different host, data could be transmitted in plaintext.

**Recommendation:** Add SSL configuration for MySQL connections:
```javascript
ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/path/to/ca-cert.pem')
}
```

---

### 15. Password Reset Link Logging in Development

**Location:** `src/routes/auth.js:165-169`, `src/routes/admin_users.js:74-76`

**Issue:** When `LOG_PASSWORD_RESET_LINKS` is true (default in development), password reset links are logged to console. These logs could be accidentally committed or exposed.

```javascript
if (config.auth.logResetLinks === true) {
    console.log(`[AUTH] Password reset link for ${email}: ${link}`);
}
```

**Recommendation:**
- Never log actual tokens/links even in development
- Use placeholder values or token IDs for debugging
- Ensure this is absolutely disabled in production

---

## Low Priority / Best Practices

### 16. Missing Input Length Limits on Some Fields

**Location:** Various routes

**Issue:** While validators exist, not all input fields have explicit maximum length checks before database operations. Database constraints will catch these, but explicit application-level validation is preferred.

**Recommendation:** Add consistent `maxlength` attributes to form inputs and validate server-side.

---

### 17. No Password Complexity Requirements

**Location:** `src/config.js:82`

**Issue:** Only minimum password length (12 characters) is enforced. No complexity requirements.

**Recommendation:** Consider adding:
- Mixed case requirement
- Number requirement
- Special character requirement
- Password breach database check (e.g., Have I Been Pwned API)

---

### 18. No Account Lockout Mechanism

**Location:** `src/routes/auth.js:60-106`

**Issue:** Failed login attempts don't trigger account lockout, only IP-based rate limiting.

**Recommendation:** Implement account lockout after N failed attempts with exponential backoff.

---

### 19. Unsafe Deletion Without Confirmation Token

**Location:** `src/routes/admin_users.js:364-394`, `src/routes/admin_drones.js:202-230`

**Issue:** Delete operations rely only on client-side JavaScript confirmation. A malicious actor who bypasses JavaScript could delete resources.

**Recommendation:** Implement server-side confirmation tokens or two-step deletion process for destructive operations.

---

### 20. No Session Activity Logging

**Issue:** Session creation, usage, and destruction are not logged. This makes it difficult to investigate unauthorized access.

**Recommendation:** Log session lifecycle events:
- Session creation (login)
- Session destruction (logout/timeout)
- Significant session activity

---

### 21. Drone Actions Not Fully Implemented

**Location:** `src/routes/user_drones.js:130`

**Issue:** Drone actions (reboot, reconnect, tune, step_response) return a placeholder response:
```javascript
return detail_redirect_with_message(res, drone_id, 'action_placeholder');
```

**Recommendation:** When implementing these actions, ensure:
- Proper authorization checks
- Action audit logging
- Rate limiting for potentially dangerous operations
- Confirmation for destructive actions

---

### 22. Missing Subresource Integrity

**Issue:** If external JavaScript or CSS resources are added, there's no SRI hash verification.

**Recommendation:** Use SRI hashes for any external resources:
```html
<script src="..." integrity="sha384-..." crossorigin="anonymous"></script>
```

---

### 23. Consider Implementing MFA

**Issue:** Only single-factor authentication (password) is implemented. For a drone management system, this may be insufficient.

**Recommendation:** Implement TOTP-based MFA or WebAuthn for administrative accounts.

---

## Summary Table

| ID | Issue | Severity | Effort |
|----|-------|----------|--------|
| 1 | Drone tokens in plaintext | Critical | Medium |
| 2 | User enumeration timing | Critical | Low |
| 3 | Audit logs not persisted | Critical | Medium |
| 4 | Missing CSP | High | Low |
| 5 | Session invalidation gap | High | Medium |
| 6 | Token hashing without HMAC | High | Low |
| 7 | Weak email validation | High | Low |
| 8 | Rate limit bypass | High | Medium |
| 9 | Drone ID validation inconsistency | Medium | Low |
| 10 | Error message leakage | Medium | Low |
| 11 | Missing security headers | Medium | Low |
| 12 | Trust proxy misconfiguration risk | Medium | Low |
| 13 | Cookie name disclosure | Medium | Low |
| 14 | Database SSL not configured | Medium | Medium |
| 15 | Token logging in dev | Medium | Low |
| 16 | Input length validation | Low | Low |
| 17 | No password complexity | Low | Low |
| 18 | No account lockout | Low | Medium |
| 19 | Unsafe deletion | Low | Medium |
| 20 | No session logging | Low | Medium |
| 21 | Placeholder drone actions | Low | - |
| 22 | Missing SRI | Low | Low |
| 23 | No MFA | Low | High |

---

## Positive Security Observations

The codebase demonstrates several good security practices:

1. **SQL Injection Prevention**: All database queries use parameterized statements
2. **Password Hashing**: bcrypt with cost factor 12, plus HMAC pepper
3. **CSRF Protection**: Session-bound tokens with timing-safe comparison
4. **Session Security**: HTTP-only, SameSite, secure cookies with regeneration on login
5. **Rate Limiting**: Login and forgot password endpoints protected
6. **Role-Based Access Control**: Three-tier hierarchy with protected users
7. **Input Validation**: Regex-based sanitization for critical fields
8. **Audit Logging**: Admin actions are logged (needs persistence)
9. **Transaction Safety**: Database transactions prevent race conditions
10. **Helmet Integration**: Security headers middleware enabled

---

## Recommended Implementation Priority

1. **Immediate** (before production):
   - Enable Content Security Policy (#4)
   - Persist audit logs to database (#3)
   - Hash drone tokens (#1)

2. **Short-term** (within first sprint):
   - Fix user enumeration timing (#2)
   - Implement comprehensive session invalidation (#5)
   - Add account-level rate limiting (#8)
   - Configure database SSL (#14)

3. **Medium-term**:
   - Add additional security headers (#11)
   - Implement account lockout (#18)
   - Improve email validation (#7)
   - Use HMAC for token hashing (#6)

4. **Long-term**:
   - Implement MFA (#23)
   - Add password complexity requirements (#17)
   - Session activity logging (#20)
