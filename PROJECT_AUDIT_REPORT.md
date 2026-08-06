# Project Audit Report

## 1. Executive Summary

Overall health: **Needs attention**. The project has a coherent React/Vite frontend and Express/Mongoose backend, and the backend free-application test suite passes, but several production-facing booking and payment paths have correctness or security gaps. The most urgent issues are: cross-agent appointment cancellation, non-atomic booking/payment state transitions, appointment payment transaction IDs lacking a unique normalized index, vulnerable/outdated dependencies, and missing/ambiguous deployment configuration for Render plus frontend EmailJS variables.

Top urgent issues:

1. `backend/controllers/Bookingcontroller.js:864-874` lets any authenticated agent cancel any appointment by ID.
2. `backend/controllers/Bookingcontroller.js:644-727` can leave slot locks behind if the lock is acquired but appointment save fails.
3. `backend/models/Payment.js:6-14` has no unique/normalized transaction ID index, so manual appointment payment duplicate checks are race-prone.
4. `npm audit` reports high-severity advisories in backend `cloudinary`, `multer-storage-cloudinary`, `socket.io-parser`, `brace-expansion`, and frontend `vite`, `postcss`, `socket.io-parser`.
5. No Render config or Node engine pins were found; production relies on dashboard/manual settings, and `frontend/.env` is missing EmailJS keys used by the Contact page.

Verification performed:

- `backend`: `npm.cmd test` passed all three tests.
- `frontend`: no test script exists; build was not run because the audit prompt forbids creating/editing files other than this report, and Vite build would create `dist`.
- `npm audit --json` and `npm outdated --json` were run read-only for `backend` and `frontend`.

## 2. Issue Severity Table

| File/Module | Issue | Severity | Type |
|---|---|---:|---|
| `backend/controllers/Bookingcontroller.js:864-874` | `cancelAppointment` does not verify `appointment.userId === req.user._id`; any authenticated agent with an appointment ID can cancel another agent's booking. | Critical | Security |
| `backend/controllers/Bookingcontroller.js:644-727` | Slot lock is acquired before appointment save; save/timeouts/errors return 500 without releasing the lock. | High | Logic |
| `backend/models/Payment.js:6-14`, `backend/services/freeApplicationService.js:64-79` | Appointment payment transaction IDs are checked with find-then-insert but not enforced by unique normalized index; concurrent duplicate submissions can pass. | High | Logic/Security |
| `backend/controllers/Bookingcontroller.js:731-855` | Payment creation, appointment update, lock extension, audit log, and socket broadcast are not transactional; partial failure can leave orphan payments or stale appointment state. | High | Logic |
| `backend/controllers/Bookingcontroller.js:93-107` | `GET /booking/slots` auto-creates default slots when none exist; read requests mutate production data. | High | Logic/Deployment |
| `backend/routes/admin.js:2249-2296` | Appointment payment approval updates payment, appointment, lock, and slot booked count without a transaction or atomic status guard. Double-click/concurrent approvals can over-increment `bookedCount`. | High | Logic |
| `backend/routes/admin.js:3370-3419` | Subscription approval performs multi-document updates outside a transaction in the active route file; duplicate approval races can create inconsistent subscription/payment/invoice state. | High | Logic |
| `backend/config/cloudinary.js:5-7`, `backend/server.js:29` | Cloudinary env vars are required by uploads but not included in production env assertion. Upload routes may fail only at runtime. | Medium | Deployment |
| `frontend/src/pages/Contact.jsx:90-102`, `frontend/.env:1` | Contact form requires `VITE_EMAILJS_*`, but frontend env only contains `VITE_API_URL`; backend `.env` has those Vite keys where Vercel will not read them. | Medium | Deployment |
| `backend/services/queueService.js:84-329` | Subscription/reminder/background sweepers are in-process intervals. On Render multi-instance/restarts they can run multiple times or pause during downtime. | Medium | Deployment/Logic |
| `backend/services/notificationService.js:38-46`, `backend/services/queueService.js:134-205` | Some email paths use `EMAIL_USER`/`EMAIL_PASS`, but production assertion requires only Resend keys. Mixed providers increase silent email failure risk. | Medium | Deployment |
| `frontend/src/main.jsx:34-54`, `frontend/src/pages/AdminDashboard.jsx:1530-1551` | Multiple Socket.IO clients can connect for one user/admin session; global listener uses `alert()` and page reload on notification metadata. | Medium | Performance/UX |
| `frontend/src/App.jsx:45`, `frontend/src/pages/AdminDashboard.jsx:62-67` | `/admin` renders `AdminDashboard` outside `ProtectedRoute`; component redirects later, causing brief unauthorized render and duplicate route surface. | Medium | Security/Code-quality |
| `backend/routes/admin.js:88-112` | Duplicate screenshot hash scan loads all historical payment/subscription screenshots into memory. This can become expensive as payment history grows. | Medium | Performance |
| `backend/controllers/Agentcontroller.js:13` | Unused `const { tryCatch } = require('bullmq');`; also most subscription logic duplicates `Subscriptioncontroller.js`. | Low | Code-quality |
| `backend/models/User.js:1-30`, `backend/models/TimeSlot.js:1-15` | Legacy models appear unused by active routes/controllers. | Low | Code-quality |
| `frontend/src/package.json:1-12`, `frontend/src/package-lock.json:1-10` | Stray nested package files under `frontend/src` define an unrelated CommonJS package and no-op test script. | Low | Code-quality |
| `backend/server.js:1-6`, `backend/utils/authUtils.js:47-49`, `backend/models/Slot.js:17-21` | TODO/FIXME-style comments exist; most are explanatory completed-fix notes, not active TODOs. | Low | Code-quality |
| `frontend/package.json:6-9`, `backend/package.json:6-11` | No lint/typecheck scripts; frontend has no tests. | Medium | Code-quality |
| `backend/package.json:13-35`, `frontend/package.json:11-29` | `npm audit` found backend 7 advisories and frontend 6 advisories. Details in dependency section. | High | Security |
| Repository root | No `render.yaml`, `render.yml`, `Dockerfile`, `Procfile`, or Node engine pin found for backend. | Medium | Deployment |

## 3. Frontend Section

### `frontend/src/App.jsx` and Routing

- Purpose: Defines SPA shell, lazy-loaded pages, header/footer, toast container, and route table.
- Health status: **Minor issues**.
- Logic correctness: Lazy route loading is appropriate. `/admin-dashboard` and `/agent-dashboard` are protected at `frontend/src/App.jsx:49-64`, but `/admin` directly mounts `AdminDashboard` at `frontend/src/App.jsx:45` and relies on an effect redirect inside the page at `frontend/src/pages/AdminDashboard.jsx:62-67`.
- Dead code/unused: `Home.jsx`, `CentreDetails.jsx`, and `AdminDashboardPortal.jsx` exist but are not routed in `App.jsx`.
- Security: The `/admin` direct route is a client-side exposure issue only; backend still enforces auth.
- Performance: Lazy imports are good. Loading fallback is simple and safe.
- Dependencies: Uses React Router 6; `npm audit` flags `react-router-dom` advisories.

### `frontend/src/config` and API Layer

- Purpose: Normalizes API base URL and defines RTK Query base API.
- Health status: **Healthy with naming confusion**.
- Logic correctness: `frontend/src/config/api.js:1-7` correctly converts either `VITE_API_BASE_URL` or `VITE_API_URL` into `API_BASE_URL` without `/api`, then `API_ROOT_URL` with `/api`. `frontend/src/features/apiSlice.js:8-11` includes credentials for cookie auth.
- Dead code/unused: `frontend/src/features/apiSlice.js:4` exports `API_BASE_URL` that actually equals `API_ROOT_URL`; `Register.jsx` uses this alias at `frontend/src/pages/Register.jsx:4` and appends `/auth/register`, which works but is misleading.
- Security: Cookie-based API calls are consistent.
- Performance: RTK Query caching is used for admin slices.
- Dependencies: `@reduxjs/toolkit` and `react-redux` are active.

### `frontend/src/features/auth`

- Purpose: Stores user/admin profile in Redux and localStorage; defines auth mutations.
- Health status: **Minor issues**.
- Logic correctness: `frontend/src/features/auth/authSlice.js:6-10` strips old token values before persistence, which is good. Admin and user state overlap for admin users at `frontend/src/features/auth/authSlice.js:51-54`, which matches current UI but can blur role-specific flows.
- Dead code/unused: None obvious.
- Security: LocalStorage stores profile fields, not JWT token. Session validity depends on backend cookie and `/auth/me` refresh paths.
- Performance: Fine.
- Dependencies: RTK Query endpoints match backend `/api/auth/*`.

### `frontend/src/features/admin` and Tracking

- Purpose: RTK Query wrappers for admin lists, payment verification, subscription payment, appointment status, and public tracking.
- Health status: **Healthy**.
- Logic correctness: Endpoints in `frontend/src/features/admin/adminApiSlice.js:5-108` match backend admin routes. Tracking query at `frontend/src/features/tracking/trackingApiSlice.js:5-8` matches `backend/routes/tracking.js:5`.
- Dead code/unused: None obvious.
- Security: Uses credentialed base query.
- Performance: `keepUnusedDataFor` is reasonable for admin lists.
- Dependencies: Active.

### `frontend/src/pages/BookAppointment.jsx`

- Purpose: Multi-step booking flow, OTP verification, slot lookup, lock, and payment proof submission.
- Health status: **Needs attention**.
- Logic correctness: Frontend sends multipart lock payload at `frontend/src/pages/BookAppointment.jsx:1279-1300`, matching backend `upload.any()` at `backend/routes/booking.js:22`. Payment proof payload at `frontend/src/pages/BookAppointment.jsx:1397-1410` matches backend `upload.single('screenshot')` at `backend/routes/booking.js:23`. However, the backend ignores frontend service/total price in current lock pricing, so UI totals must remain synced with server fee logic.
- Dead code/unused: Large single file with many state concerns; no obvious unused critical flow.
- Security: Relies correctly on backend cookie auth.
- Performance: Uses extra center lookups before slot lookup at `frontend/src/pages/BookAppointment.jsx:1020-1038`; acceptable, but repeated calls could be cached.
- Dependency issues: Socket.IO client active.

### `frontend/src/pages/AdminDashboard.jsx`

- Purpose: Admin operations for applications, slots, closures, payments, subscription settings, agents, notifications, and stats.
- Health status: **Needs attention**.
- Logic correctness: Most endpoint calls match backend routes. Socket effect reconnects whenever `activeTab` changes at `frontend/src/pages/AdminDashboard.jsx:1530-1551`, causing connection churn.
- Dead code/unused: Very large file; strong candidate for splitting by tab after functional fixes.
- Security: `/admin` unprotected route issue noted above.
- Performance: Uses `@tanstack/react-virtual`, which is good for large lists. Some fetches request `limit=100` in payment/admin lists at `frontend/src/pages/AdminDashboard.jsx:796`.
- Dependencies: Active.

### Other Pages and Components

- `Login.jsx`, `AdminLogin.jsx`, reset pages: **Healthy**; forgot/reset endpoints match backend auth/admin routes.
- `Register.jsx`, `CompleteProfile.jsx`: **Healthy**; multipart registration/profile completion matches backend multer usage.
- `AgentDashboard.jsx`: **Minor issues**; dashboard fetches subscription/history/invoices/bookings/notifications and uses local read-notification state. It is operational but mixes data fetching, billing, referrals, QR rendering, and local notification state in one large page.
- `TrackApplication.jsx`: **Healthy**; calls public tracking API with encoded query params.
- `Contact.jsx`: **Needs attention**; EmailJS vars are checked at `frontend/src/pages/Contact.jsx:90-102`, but local frontend env lacks these keys.
- `LanguageContext.jsx`: **Minor issues**; cookie/localStorage sync is deliberate and cleans intervals/listeners. It posts language update to `/api/auth/profile/language` at `frontend/src/context/LanguageContext.jsx:170`, matching backend.
- `Header.jsx`, `Footer.jsx`, `Hero.jsx`, `WhatsAppButton.jsx`, `SearchableDropdown.jsx`: **Healthy** overall. Event listeners in dropdown/header have cleanup.
- Styling/assets/locales: **Healthy**; substantial static assets and locale JSON files are present.

## 4. Backend Section

### `backend/server.js`

- Purpose: Express app bootstrap, security middleware, CORS, rate limits, routes, Socket.IO, background services.
- Health status: **Minor issues**.
- Logic correctness: Routes are mounted consistently at `backend/server.js:157-163`. Helmet, mongo sanitize, CORS, JSON limits, and rate limits are present at `backend/server.js:70-154`.
- Dead code/unused: None significant.
- Security: CSP allows `'unsafe-inline'` and `'unsafe-eval'` at `backend/server.js:74`; acceptable only if required by current frontend/Google auth, but should be reviewed.
- Performance: Global API limiter is good; public center endpoints are excluded and have their own limiter.
- Deployment: Production assertion at `backend/server.js:27-35` omits `MONGO_URI`, `CLIENT_ORIGIN`, and Cloudinary keys.

### `backend/routes` and API Contracts

- Purpose: REST API route definitions for auth, booking, admin, subscription, referral, tracking, and agent deletion.
- Health status: **Needs attention**.
- Logic correctness: Most frontend calls match route signatures. Booking, auth, admin settings, payment verification, subscription payments, referral redemption, and tracking paths align.
- Dead code/unused: `backend/routes/agentroutes.js:6` exposes only delete under `/api/agents/agents/:id`, matching frontend line `frontend/src/pages/AdminDashboard.jsx:1322` but the doubled `agents/agents` path is confusing.
- Security: Protected routes use `protect` and role middleware. Critical exception is `cancelAppointment` business authorization in controller.
- Performance: Admin routes file is large and contains many inline controllers, making review harder.

### `backend/controllers/Bookingcontroller.js`

- Purpose: Centers/countries, slot availability, OTP email verification, slot lock, payment proof, cancellation, history, legacy create.
- Health status: **Broken for cancellation; needs attention overall**.
- Logic correctness: Slot availability subtracts active locks and applies blocks/closures at `backend/controllers/Bookingcontroller.js:109-145`. Lock flow validates OTP and computes server-side price, which is good. Problems: read-time slot auto-create at `backend/controllers/Bookingcontroller.js:93-107`; lock leak on save failure at `backend/controllers/Bookingcontroller.js:644-727`; non-transactional payment flow at `backend/controllers/Bookingcontroller.js:731-855`; legacy create creates payment before saving appointment at `backend/controllers/Bookingcontroller.js:1051-1074`.
- Dead code/unused: `createLegacyBooking` is still routed at `backend/routes/booking.js:31`; keep only if legacy clients exist.
- Security: Missing owner check in cancellation.
- Performance: Slot default creation in GET can stampede under concurrent requests for a new date.
- Dependencies: Uses Cloudinary upload via multer config.

### `backend/routes/admin.js`

- Purpose: Main admin operations: auth reset, appointments, slots, closures, audit logs, settings, payments, agents, notifications.
- Health status: **Needs attention**.
- Logic correctness: Input validation is broad and many routes use role checks. Payment and subscription approval routes perform multi-document state changes without transactions in the active route file.
- Dead code/unused: `backend/controllers/Admincontroller.js` duplicates many concepts but is not mounted directly by `backend/server.js`.
- Security: Role checks are consistently applied to admin endpoints.
- Performance: Duplicate screenshot hash scan at `backend/routes/admin.js:88-112` loads all prior screenshots into memory.
- Dependencies: Uses email/PDF/payment review services.

### `backend/controllers/authController.js`

- Purpose: Agent registration/login, Google auth, profile completion, admin login, password reset, profile response.
- Health status: **Healthy with deployment caveats**.
- Logic correctness: Password length checks, duplicate handling, account lock paths, Google client validation, generic reset responses, and safe auth response field allowlist are present.
- Dead code/unused: `ADMIN_EMAIL` at `backend/controllers/authController.js:11` appears unused in current login flow.
- Security: HttpOnly cookie auth and no token in response are good. Google auth depends on `GOOGLE_CLIENT_ID`, but production env assertion does not require it.
- Performance: Fine.
- Dependencies: Uses `bcryptjs`, `jsonwebtoken`, `google-auth-library`.

### `backend/controllers/Subscriptioncontroller.js`

- Purpose: Subscription purchase/renew proof submission, history, invoices, notifications, stats.
- Health status: **Minor issues**.
- Logic correctness: Server computes pricing at `backend/controllers/Subscriptioncontroller.js:21-33`; payment proof validation and duplicate normalized transaction checks are good at `backend/controllers/Subscriptioncontroller.js:123-138`; subscription model enforces unique normalized transaction IDs at `backend/models/Subscription.js:35-36`.
- Dead code/unused: Similar code is duplicated in `Agentcontroller.js`.
- Security: Invoice downloads check ownership at `backend/controllers/Subscriptioncontroller.js:259-265`.
- Performance: History queries sorted by indexed agent/status fields.
- Dependencies: Active.

### `backend/controllers/ReferralController.js` and Reward Services

- Purpose: Referral status and gold coin/free booking redemption.
- Health status: **Healthy**.
- Logic correctness: Referral status loads safe fields; reward service uses atomic-ish `findOneAndUpdate` increments for balances and referral records.
- Dead code/unused: None obvious.
- Security: Protected routes only.
- Performance: `backfillMissingReferralRewards` scans referred agents at `backend/services/rewardService.js:193`; acceptable as startup maintenance but should be monitored with growth.

### `backend/models`

- Purpose: Mongoose schemas for agents, appointments, slots, locks, subscriptions, payments, invoices, audit logs, notifications, centers, settings, referrals, closures, OTP, sequences.
- Health status: **Minor issues**.
- Logic correctness: Important indexes exist on appointment status/date/user/slot, slot uniqueness, slot locks TTL, subscription status/agent, referral uniqueness, and agent unique fields. Payment model lacks unique/normalized transaction ID protection.
- Dead code/unused: `User.js` and `TimeSlot.js` appear unused.
- Security: `Agent` password hashing hooks are present; sensitive password selected only explicitly.
- Performance: Index set is generally thoughtful.

### `backend/services`, `middleware`, `workers`, `scripts`, `tests`

- `lockingService.js`: **Needs attention**; Mongo fallback lock counter sync is useful, but lock cleanup on upstream save failure is missing.
- `queueService.js`: **Minor/Needs attention**; fallback lock sweep and subscription sweeps are useful, but in-process intervals are fragile in production.
- `expirationWorker.js`: **Healthy if Redis exists**; otherwise disabled by design.
- `mailService.js`: **Healthy** for Resend, but logs payload summaries.
- `notificationService.js`: **Needs attention** because it uses Gmail env vars not asserted in production.
- `pdfService.js`: **Healthy**; generates appointment and GST invoice PDFs with QR.
- `feeService.js`: **Healthy**; server-side pricing source is good.
- `subscriptionPaymentSecurity.js`: **Healthy**; normalizes UTR, date checks, screenshot hashing/review helpers.
- `validators.js`: **Minor issues**; registration/login validation used, but booking validator is not wired to current booking routes.
- `scripts`: **Minor issues**; seed script uses `ADMIN_PASSWORD` fallback and explicitly tells operator to remove it.
- `tests`: **Minor issues**; free-application tests pass, but no integration tests cover auth, cancellation ownership, lock expiry, payment approval, or frontend contracts.

## 5. Frontend-Backend Contract Mismatches

- No hard route mismatch found among active frontend API calls and backend route definitions.
- Naming mismatch: frontend `features/apiSlice.js` exports `API_BASE_URL` as the API root (`/api`) at `frontend/src/features/apiSlice.js:4`, while `config/api.js` exports `API_BASE_URL` as origin-only and `API_ROOT_URL` as `/api`. Current calls still work, but future imports are easy to misuse.
- Frontend sends `servicesSelected` and `totalAmount` in lock payload at `frontend/src/pages/BookAppointment.jsx:1291-1293`; backend ignores client total and computes with `feeService.buildLockPricing` at `backend/controllers/Bookingcontroller.js:637-640`. This is secure, but UI totals can drift if constants differ.
- Public tracking query contract is aligned: frontend `frontend/src/features/tracking/trackingApiSlice.js:6-7`; backend `backend/controllers/Trackingcontroller.js:17-45`.

## 6. Deployment Risk Section

### Vercel Frontend

- `frontend/vercel.json:1-5` has correct SPA rewrite.
- `frontend/package.json:6-9` has standard Vite scripts.
- `frontend/.env:1` contains only `VITE_API_URL`; Contact page needs `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`, and `VITE_EMAILJS_PUBLIC_KEY` at `frontend/src/pages/Contact.jsx:90-102`.
- `frontend/vite.config.js:11-14` sets dev server `host: true`; fine locally, not relevant to Vercel production.

### Render Backend

- No `render.yaml`, `render.yml`, `Dockerfile`, `Procfile`, `.nvmrc`, or package `engines` field found. Render deployment depends on dashboard configuration and platform default Node version.
- `backend/package.json:6-11` has usable `start` and `test` scripts.
- `backend/server.js:27-35` asserts only `JWT_SECRET`, `RESEND_API_KEY`, and `EMAIL_FROM` in production. Missing from assert but operationally important: `MONGO_URI`, `CLIENT_ORIGIN`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optional `REDIS_URL`, optional `GOOGLE_CLIENT_ID`, and any Gmail `EMAIL_USER`/`EMAIL_PASS` paths still in use.
- Cookie auth uses `secure: true` and `sameSite: 'none'` in production at `backend/utils/authUtils.js:22-31`; correct for Vercel-to-Render cross-site cookies if both HTTPS and CORS credentials are configured.
- CORS allows configured origins, production Vercel URL, localhost, and matching Vercel previews at `backend/server.js:42-58`.

## 7. Dependency Report

### Backend

Direct dependencies are declared in `backend/package.json:13-35`.

`npm audit` findings:

- High: `cloudinary <2.7.0` arbitrary argument injection; current direct version resolves to `1.41.3`.
- High: `multer-storage-cloudinary` affected through vulnerable `cloudinary`; current direct version `4.0.0`, audit suggests major downgrade path for that package while upgrading Cloudinary separately needs human review.
- High: `socket.io-parser` memory exhaustion.
- High: `brace-expansion` DoS.
- Moderate: `mongoose >=8.0.0 <8.24.1` prototype pollution; installed `8.24.0`, wanted `8.24.2`.
- High/moderate: `ip-address` SSRF/trust-boundary classification issues.
- Low: `body-parser <1.20.6` DoS.

`npm outdated` notable direct packages:

- `cloudinary` current `1.41.3`, latest `2.10.0`.
- `mongoose` current `8.24.0`, wanted `8.24.2`, latest `9.9.1`.
- `bullmq` current `5.79.0`, wanted `5.81.3`, latest `6.0.8`.
- `google-auth-library` current `10.7.0`, wanted `10.9.1`, latest `11.0.0`.
- `express` current `4.22.2`, latest `5.2.1`.

Unused/dead-code dependency note:

- `backend/controllers/Agentcontroller.js:13` imports `tryCatch` from `bullmq` and does not use it.

### Frontend

Direct dependencies are declared in `frontend/package.json:11-29`.

`npm audit` findings:

- High: `vite <=6.4.2` path traversal/dev server advisories; current installed `5.4.21`.
- High: `postcss <=8.5.22` path traversal/source map disclosure.
- High: `socket.io-parser` memory exhaustion.
- Moderate: `esbuild <=0.24.2` dev server request issue through Vite.
- Moderate: `react-router` and `react-router-dom` open redirect/SSR hydration advisories; current installed `react-router-dom 6.30.4`.

`npm outdated` notable direct packages:

- `vite` current `5.4.21`, latest `8.2.0`.
- `react-router-dom` current `6.30.4`, latest `7.18.2`.
- `react`/`react-dom` current `18.3.1`, latest `19.2.8`.
- `@vitejs/plugin-react` current `4.7.0`, latest `6.0.5`.
- `lucide-react` current `0.372.0`, latest `1.28.0`.

Unused/stray package note:

- `frontend/src/package.json:1-12` and `frontend/src/package-lock.json:1-10` are unrelated nested package files and should be removed after confirmation.

## 8. Recommended Fix Order

1. Critical: Add an ownership/role check to `cancelAppointment` before changing status or decrementing slots.
2. High: Make lock acquisition and appointment creation failure-safe by releasing the lock if appointment save fails.
3. High: Add normalized unique transaction ID handling to appointment `Payment` records and make duplicate checks atomic.
4. High: Wrap payment submission and admin approval flows in Mongo transactions or atomic state transitions with status guards.
5. High: Remove production data creation from `GET /booking/slots`; seed slots through admin/bulk tooling instead.
6. High: Address `npm audit` vulnerabilities, starting with backend `cloudinary`/upload path, `mongoose`, `socket.io-parser`, and frontend `vite`/`react-router-dom`.
7. Medium: Add Render config or at least Node `engines`, and expand production env validation for Mongo, Cloudinary, CORS, Google auth if enabled, Redis if required, and legacy Gmail mail paths.
8. Medium: Configure Vercel EmailJS env vars or move contact submission to backend mail service.
9. Medium: Reduce in-process background sweeper risks by moving recurring jobs to a single worker/cron deployment.
10. Medium: Protect `/admin` route with `ProtectedRoute` and reduce duplicate Socket.IO connections/listeners.
11. Low: Remove/merge duplicate legacy files: unused models, duplicate subscription controller code, stray `frontend/src/package*.json`, and unused imports.
12. Low: Add frontend tests or at minimum smoke/build CI; add backend integration tests for auth, booking lock/payment/cancel, admin approval, and API contract checks.
