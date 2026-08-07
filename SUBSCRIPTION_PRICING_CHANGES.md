# Subscription Pricing Changes

## Verification Summary

- Verified the recent subscription changes were not centralized: live purchase/renewal pricing, admin approval duration, PDF GST labels, Agent Dashboard pricing, and GlobalHome pricing still had hardcoded values.
- Confirmed backend purchase/renewal flow computes amounts server-side and does not trust client-sent amounts.
- Confirmed old subscription records already preserve `planAmount`, `gstAmount`, `totalAmount`, `startDate`, and `expiryDate`; this change adds explicit plan setting snapshots for new records.

## What Changed

- Added dynamic subscription settings to `PlatformSettings`:
  - `subscriptionPlanName`
  - `subscriptionBasePrice`
  - `subscriptionGstPercent`
  - `subscriptionDurationDays`
  - `subscriptionSettingsUpdatedBy`
  - `subscriptionSettingsUpdatedAt`
- Added `backend/services/subscriptionSettingsService.js` as the shared backend source for:
  - default Professional Plan settings: INR 10,000 base, 18% GST, 30 days
  - normalized settings reads
  - discount/GST calculation
  - subscription snapshot creation
- Added public current-plan endpoint:
  - `GET /api/subscription/settings`
- Added SUPER_ADMIN settings endpoints:
  - `GET /api/admin/settings/subscription`
  - `PATCH /api/admin/settings/subscription`
- Updated purchase/renew/resubmission flows to read current DB settings at request time and store snapshots on each subscription:
  - `planName`
  - `basePrice`
  - `gstPercent`
  - `durationDays`
  - `planAmount`
  - `gstAmount`
  - `totalAmount`
- Updated admin subscription approval to use each pending subscription record's stored `durationDays`, so later admin setting changes do not alter already-submitted requests.
- Updated free/complimentary subscription creation to snapshot current plan metadata while keeping payable amounts at zero.
- Updated GST invoice PDF text to use subscription snapshot values for plan name, access days, GST percent, CGST/SGST labels, and total amount.
- Updated expired subscription notification/email template to use the subscription's stored plan name.
- Added Admin Dashboard `Subscription Settings` tab with editable plan name, base price, GST percent, duration days, and total-billed preview.
- Updated Agent Dashboard and GlobalHome pricing cards to fetch live subscription settings instead of displaying hardcoded plan pricing.

## Files Changed

- `backend/models/PlatformSettings.js`
- `backend/models/Subscription.js`
- `backend/services/subscriptionSettingsService.js`
- `backend/controllers/Subscriptioncontroller.js`
- `backend/controllers/Agentcontroller.js`
- `backend/controllers/Admincontroller.js`
- `backend/routes/subscription.js`
- `backend/routes/admin.js`
- `backend/services/pdfService.js`
- `backend/services/queueService.js`
- `frontend/src/pages/AdminDashboard.jsx`
- `frontend/src/pages/AgentDashboard.jsx`
- `frontend/src/pages/GlobalHome.jsx`

## Regression Checks

- Backend tests: passed
  - `npm.cmd test`
- Frontend build: passed after sandbox-approved rerun
  - `npm.cmd run build`
- Remaining hardcoded INR 10,000 / 18% / 30-day values are fallback defaults for first-run or legacy documents, not live subscription pricing logic.

