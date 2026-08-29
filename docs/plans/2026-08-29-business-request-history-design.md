# Unified customer request history

## Goal

Give authenticated customers one privacy-safe place to track every business interaction they initiated, including service requests, quote requests, consultations, appointments, booking requests, reschedules, cancellations, and completed requests.

## Design

- Add a customer-scoped read endpoint that merges `business_contact_requests` and `business_bookings`.
- Return only verified business display data (name and logo), the service/request label, requested time, current status, response note, timestamps, and a next-action label. Never expose the business owner's personal identity.
- Keep the business-owner request-management route and page separate.
- Add a dedicated consumer `/business-requests` page and a link from the authenticated consumer account/dashboard navigation.
- Use explicit loading, empty, and error states. Render status and next-action copy from a shared client mapping.

## Data flow and privacy

The API identifies the customer from the authenticated session and applies the customer predicate independently to each source query. Booking history is based on the booking's customer and joins only to the public business profile/account display fields. Contact request history uses the existing requester predicate and public business profile/account display fields.

## Testing

Route tests will verify customer isolation, public-only business fields, and the combined response shape. The existing typecheck and project validation workflows will be run after implementation.