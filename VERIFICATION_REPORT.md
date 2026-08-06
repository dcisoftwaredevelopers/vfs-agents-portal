# Verification Report - Subscription Pricing Change

## Existing Subscriber Impact

- Existing `Subscription` documents keep their stored `planAmount`, `gstAmount`, `totalAmount`, `startDate`, and `expiryDate` values. The hardcoded changes in code do not automatically rewrite old database documents.
- Existing active subscriptions created under the old `999 / 28 days` setup are not retroactively recalculated by the schema. Mongoose defaults in `backend/models/Subscription.js` only apply when a field is missing on new documents.
- Renewal and new purchase flows do use the current hardcoded values, so only new purchase/renew requests are affected by the latest code.
- Admin list/stat screens mostly read actual stored subscription fields. The main risk found is PDF/email display text, not silent DB recalculation.

## Other Price/Duration References Found

- `backend/services/pdfService.js`
  - Uses stored `subscription.planAmount`, `subscription.gstAmount`, and `subscription.totalAmount`.
  - Still hardcodes display text: `30 Days Access`, `GST Rate` as `18%`, CGST/SGST `9%`, and amount-in-words as `Eleven Thousand Eight Hundred Rupees Only`.
- `backend/services/mailService.js`
  - No hardcoded subscription price/duration found.
- `backend/services/notificationService.js`
  - No hardcoded subscription price/duration found.
- `backend/services/queueService.js`
  - Uses stored `expiryDate`; reminder text says monthly subscription but does not hardcode price.
- `backend/models/PlatformSettings.js`
  - Existing admin settings model exists, but only free-subscription counters/settings are present.
- `backend/scripts`
  - No subscription price/duration hardcode found.
- `frontend/src/pages/GlobalHome.jsx`
  - Marketing pricing card hardcodes `₹10,000`, `₹11,800`, and 30-day FAQ text.
- `frontend/src/pages/AgentDashboard.jsx`
  - Currently hardcodes `SUBSCRIPTION_PLAN_AMOUNT`, `SUBSCRIPTION_GST_RATE`, and `SUBSCRIPTION_CYCLE_DAYS`.
- `backend/controllers/Subscriptioncontroller.js`, `backend/controllers/Agentcontroller.js`, `backend/routes/admin.js`, `backend/controllers/Admincontroller.js`, `backend/models/Subscription.js`
  - Current hardcoded subscription price/duration values are present.

## Server-Side Amount Verification

- Agent submission path:
  - `frontend/src/pages/AgentDashboard.jsx` sends only `transactionId`, `screenshot`, `notes`, and `paymentDateTime`.
  - `backend/controllers/Subscriptioncontroller.js` computes pricing server-side in `calculateSubscriptionPricing()` and saves `expectedAmountSnapshot`.
  - `backend/services/subscriptionPaymentSecurity.js` validates UTR/date/screenshot, but it cannot validate the real paid amount from the screenshot automatically.
- Admin approval path:
  - `backend/routes/admin.js` calls `canApproveManualSubscription(sub)`.
  - `canApproveManualSubscription()` confirms expected amount exists, UTR exists, payment date exists, and screenshot exists.
  - The actual payment amount matching is manual: the admin confirmation text instructs the admin to match amount/UTR/date/screenshot with the bank statement. There is no machine-readable paid amount from the client or bank API.

## Test Coverage

- Existing backend tests pass, but they cover free-application logic/migration scenarios only.
- No automated test currently exercises subscription purchase pricing, renewal pricing, admin subscription approval, dynamic duration, or expiry calculation.
- Therefore, `npm test` passing does not prove subscription pricing/duration behavior is covered.

## Part 2 Notes

- Dynamic pricing should use a DB-backed single source of truth.
- New subscriptions should snapshot the settings values into each `Subscription` record.
- Existing subscriptions should continue using their stored values for invoices/history.
