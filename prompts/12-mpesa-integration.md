# CVLab AI - M-Pesa Integration Rules

# 1. Purpose

Integrate CVLab AI with M-Pesa to allow users in Mozambique to purchase platform credits.

The first payment method is M-Pesa.

Future payment methods:

- eMola
- Visa
- Mastercard
- Bank payments
- Other supported providers

The payment architecture must support multiple providers.

---

# 2. Official Documentation

The implementation MUST use the official M-Pesa developer documentation.

Official developer portal:

https://developer.mpesa.vm.co.mz/

Do not invent:

- endpoints
- credentials
- headers
- request formats
- response formats
- callback formats

Always verify the current official API documentation before implementing or changing the integration.

---

# 3. Payment Architecture

Payment flow:

User

↓

Select package

↓

Create payment intent

↓

M-Pesa

↓

Payment confirmation

↓

Backend verification

↓

Credit transaction

↓

Wallet update

↓

User notification

---

# 4. Provider Abstraction

Never couple the business logic directly to M-Pesa.

Create a payment provider abstraction.

Example:

PaymentProvider

Methods may include:

- createPayment()
- checkPaymentStatus()
- processCallback()
- cancelPayment()
- reversePayment()

The exact implementation must follow the provider documentation.

---

# 5. Payment Status

Use internal normalized payment states:

PENDING

PROCESSING

COMPLETED

FAILED

CANCELLED

EXPIRED

REVERSED

REFUNDED

Do not expose raw provider states directly to business logic.

---

# 6. Payment Intent

Every payment must have an internal payment ID.

Store:

- internal payment ID
- user ID
- package ID
- amount
- currency
- provider
- provider transaction/reference ID
- status
- timestamps
- metadata

---

# 7. Amount

Payment amount must come from the backend.

Never trust the amount sent by the frontend.

Example:

User selects package 100 MT.

Backend retrieves the configured package.

Backend determines:

amount = 100 MT

credits = 200

---

# 8. Currency

Initial currency:

MZN

Display currency:

MT

---

# 9. Idempotency

Payment confirmation must be idempotent.

The same provider transaction must never:

- create credits twice
- create multiple successful payments

---

# 10. Verification

Never grant credits based only on:

- frontend response
- browser redirect
- user screenshot
- user claim

The backend must verify the transaction using the appropriate M-Pesa API mechanism.

---

# 11. Callback / Webhook

If the provider uses callbacks:

The callback endpoint must:

1. Validate request
2. Identify payment
3. Verify transaction
4. Check payment status
5. Ensure transaction has not already been processed
6. Update payment
7. Add credits
8. Record ledger entry
9. Return provider-appropriate response

---

# 12. Database Transaction

When payment confirmation results in credits:

The following must happen atomically:

Payment marked COMPLETED

+

Credit transaction created

+

Wallet updated

If one operation fails, rollback the database transaction.

---

# 13. Duplicate Callback

The same callback may arrive more than once.

The system must safely ignore duplicates.

No duplicate credits.

---

# 14. Failed Payment

If payment fails:

Do not add credits.

Keep payment history.

Return a clear user message.

---

# 15. Pending Payment

If payment remains pending:

Do not add credits.

Allow the system to query payment status where supported.

---

# 16. Payment Expiration

Pending payments should have an expiration mechanism.

Expired payments must not generate credits.

---

# 17. Reversal

The system must support provider transaction reversal when applicable and when supported by the configured API/product.

A reversal must also update the internal payment and credit ledger correctly.

---

# 18. Security

Never expose:

- API credentials
- client secrets
- private tokens
- provider secrets

Frontend.

All provider secrets belong in server-side environment variables or a secure secret manager.

---

# 19. Logging

Log payment events without exposing secrets.

Safe:

payment_id

provider

amount

status

timestamp

transaction reference

Unsafe:

passwords

API secrets

access tokens

PINs

---

# 20. Reconciliation

The system should support payment reconciliation.

Admin must be able to compare:

Platform payments

vs

Provider transaction statuses

---

# 21. Admin Payment Tools

Admin dashboard must show:

- Payment ID
- User
- Amount
- Package
- Provider
- Status
- Provider reference
- Created date
- Completed date

---

# 22. Testing

Support:

Development/Sandbox environment when provided by M-Pesa.

Test:

Successful payment

Failed payment

Pending payment

Duplicate callback

Timeout

Invalid callback

Unknown transaction

Payment status query

Reversal

Database failure during confirmation

---

# 23. Provider Independence

The credit system must not know whether payment came from:

M-Pesa

eMola

Card

Bank

Only the payment subsystem knows the provider.

---

# 24. Golden Rule

Never grant credits unless payment validity has been established by the backend.