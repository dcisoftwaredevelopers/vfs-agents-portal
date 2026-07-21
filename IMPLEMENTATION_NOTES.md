# Free Application Credit Implementation Notes

The root bug was that `freeBookingsAvailable > 0` meant "make this whole appointment free." An appointment can contain multiple applicants, so one credit was discounting every applicant in the booking and immediately confirming the slot. The corrected behavior treats one credit as one applicant's proportional share only: `round(totalAmount / applicantCount)`.

Touched areas:
- `backend/models/Agent.js`: renamed runtime fields to `freeApplicationsAvailable` / `freeApplicationsUsed` and added `hasFreeApplicationCredit()`.
- `backend/models/Appointment.js`: added applicant count, discount, payable amount, and free-application verification audit fields.
- `backend/services/feeService.js`: central discount helper so the formula is not duplicated.
- `backend/services/freeApplicationService.js`: shared parsing, amount calculation, pending-credit capacity guard, payment-proof creation, and lock extension.
- `backend/controllers/Bookingcontroller.js`: removed automatic whole-booking free confirmation from both checkout paths. Free-credit requests now remain pending admin verification and credits are not consumed at claim time.
- `backend/routes/admin.js`: added free-application list/approve/reject endpoints and changed balance-payment approval so split bookings are not booked until the free-credit part is approved.
- `backend/services/rewardService.js`, `backend/controllers/ReferralController.js`, `backend/utils/authUtils.js`: updated reward redemption and auth payload names.
- `frontend/src/pages/BookAppointment.jsx`: added explicit off-by-default free-credit opt-in with live estimate and retained payment-proof fields when a balance remains.
- `frontend/src/pages/AdminDashboard.jsx`: added a free application verification tab parallel to payment verification.
- `backend/scripts/migrateFreeApplicationCredits.js`: idempotent migration from the deprecated field without unsetting it.

Concurrency choices:
- Submission checks the fresh agent credit balance and caps pending free-credit requests to the available unconsumed credits. This avoids queuing many pending requests against one credit and confusing admins.
- Admin approval first claims the appointment by changing `freeApplicationVerificationStatus` from `PENDING` to `APPROVED`; a second approval attempt no longer matches. Credit consumption uses a guarded `$expr` update so `freeApplicationsUsed` cannot exceed `freeApplicationsAvailable`.
- If the guarded credit update fails after the appointment claim, the endpoint rolls the appointment back to `PENDING` and returns a clear admin error.
- Balance payment approval for split bookings marks only the payment as `SUCCESS`/appointment `paymentStatus` as `Paid`; final slot booking, lock release, and milestone reward happen only in free-application approval.

Legacy note:
- `/booking/create` remains as a compatibility path, but it now follows the same pending-verification semantics and no longer auto-confirms or double-releases locks.
