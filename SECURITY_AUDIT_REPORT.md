# Security Audit and Hardening Report

Date: 2026-03-13
Scope: Backend (Node.js/Express), Frontend (React), Nginx config, operational scripts

## Findings Identified (Pre-Fix)

### Critical
- Hardcoded and fallback secrets/credentials in backend and scripts.
- JWT secret fallback pattern enabled insecure startup.
- Default admin bootstrap with weak fallback password.
- Frontend token persistence in localStorage (XSS theft risk).
- Open CORS configuration.
- Notification config endpoints exposed sensitive API key to non-admin users.

### High
- No global security headers in app layer and weak/deprecated header in nginx (`X-XSS-Protection`).
- Missing robust login brute-force controls.
- Inconsistent password policy (6/8-char paths still accepted).
- Backup restore path traversal risk via filename trust.
- Mass assignment risk in vendor update endpoint (`vendor.update(req.body)`).
- Missing cookie-based session handling and refresh flow.

### Medium
- Missing strict payload validation on critical routes.
- Audit logging gaps for login outcomes and backup actions.
- SQLite runtime pragmas not enforced (WAL/foreign keys/busy timeout).
- Broad route permission surface increases BOLA/abuse risk.

## Hardening Implemented

### Authentication and Session Security
- JWT secret now required at startup.
- Access and refresh session model implemented:
  - short-lived access token
  - refresh token in HttpOnly cookie
  - tokenVersion-based revocation on logout/password change
  - refresh token hash persisted per user
- Added endpoints:
  - `POST /auth/refresh`
  - `POST /auth/logout`
- Auth middleware now supports HttpOnly cookies and validates:
  - token type
  - active user
  - tokenVersion consistency

### Password and Credential Hardening
- Password minimum raised to 12 characters.
- Strong password policy enforced for:
  - register
  - self-register
  - change-password
  - default admin bootstrap
- Removed insecure default credentials/fallbacks in:
  - backend bootstrap logic
  - admin reset script
  - origin debug/test scripts

### Rate Limiting and Abuse Controls
- Added `express-rate-limit`.
- Applied stricter limits for auth routes (login and related auth abuse control).
- Kept self-register abuse throttling and added auth limiter to route.

### Input Validation and Mass Assignment
- Added `zod` validation for critical auth and sensitive endpoints.
- Added strict validation for backup restore payload.
- Replaced vendor mass assignment with allowlisted validated fields.

### Token Storage Security (Frontend)
- Migrated client auth flow from localStorage token persistence to cookie-based session.
- Global axios `withCredentials` enabled.
- Login/logout/current-user flow refactored for cookie sessions.

### CORS and Security Headers
- Added Helmet with CSP/referrer/frame protections.
- Removed deprecated `X-XSS-Protection` usage pattern (nginx now modernized).
- CORS now allowlist-based and requires explicit `CORS_ALLOWED_ORIGINS`.

### Backup Security
- Backup restore now validates filename with strict pattern and basename checks.
- Path traversal protections added in backup utility.
- Added audit log entries for backup list/create/restore actions.
- Removed filesystem path disclosure in backup creation response.

### Database Safety
- Enabled SQLite pragmas at startup:
  - `journal_mode=WAL`
  - `busy_timeout`
  - `foreign_keys=ON`

### Nginx Hardening
- Added/updated security headers:
  - CSP
  - HSTS
  - Referrer-Policy
  - Permissions-Policy
  - X-Frame-Options
  - X-Content-Type-Options
- Added body size and timeout constraints.
- Added proxy header sanitization (`Proxy` header cleared, hides `X-Powered-By`).

## Files Modified
- backend/index.js
- backend/middleware/auth.js
- backend/models/User.js
- backend/config/backup.js
- backend/package.json
- backend/package-lock.json
- backend/scripts/reset-admin.js
- backend/scripts/debug-scrape.js
- backend/scripts/debug-locais.js
- backend/scripts/debug-locais2.js
- backend/scripts/debug-locais3.js
- backend/scripts/test-scrape.js
- frontend/src/index.js
- frontend/src/App.js
- frontend/src/NotificationCenter.js
- frontend/src/Analytics.js
- deploy/nginx.conf

## Required Environment Variables (Now Mandatory)
- `JWT_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `ORIGIN_BASE`
- `ORIGIN_USER`
- `ORIGIN_PASS`
- `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` (required only if no admin exists and bootstrap is expected)

## Remaining Risks / Recommendations
- Add CSRF token validation middleware for state-changing cookie-auth requests.
- Extend zod validation coverage to all write routes and query params.
- Introduce granular resource ownership checks where domain permits per-user scoping.
- Add centralized security logging sink and alerting.
- Consider migration from SQLite to PostgreSQL for production concurrency, HA, and stronger operational controls.
- Enable full TLS termination and redirect HTTP->HTTPS in production with valid certificates.
