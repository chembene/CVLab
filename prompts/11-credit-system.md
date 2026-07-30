# CVLab AI - Credit System

# 1. General Principle

The platform uses a virtual credit system.

Credits are internal usage units.

Credits are not a currency.

Credits must never be represented as money inside the business logic.

---

# 2. Initial Packages

Package 1:

Price: 100 MT

Base Credits: 200

Bonus Credits: 0

Total: 200

---

Package 2:

Price: 250 MT

Base Credits: 450

Bonus Credits: 100

Total: 550

---

Package 3:

Price: 500 MT

Base Credits: 1000

Bonus Credits: 200

Total: 1200

---

Package 4:

Price: 1000 MT

Base Credits: 2000

Bonus Credits: 600

Total: 2600

---

Package 5:

Price: 2000 MT

Base Credits: 4000

Bonus Credits: 1500

Total: 5500

---

# 3. Initial Feature Costs

CV improvement suggestion:

30 credits

---

CV creation:

40 credits

---

Cover letter:

25 credits

---

CV translation:

20 credits

---

ATS analysis:

35 credits

---

Professional summary:

20 credits

---

Career suggestion:

15 credits

---

Interview practice:

60 credits

---

Technical test:

40 credits

---

PDF premium export:

10 credits

---

# 4. Important Rule

Credit prices must be configurable.

Do not hardcode credit prices inside frontend components.

The backend is the authoritative source.

---

# 5. Wallet

Every user must have one logical credit wallet.

Wallet fields should include:

- available_credits
- lifetime_credits_purchased
- lifetime_credits_consumed

The wallet must never contain a negative balance.

---

# 6. Ledger

Every credit movement must create a transaction.

Transaction types:

PURCHASE

BONUS

CONSUMPTION

REFUND

ADMIN_ADJUSTMENT

EXPIRATION

PROMOTION

REVERSAL

---

# 7. Ledger Requirements

Every transaction must store:

- ID
- User ID
- Amount
- Type
- Balance before
- Balance after
- Reference
- Description
- Timestamp
- Actor
- Metadata

---

# 8. Atomicity

Credit deduction must be atomic.

Example:

User balance = 100

Feature cost = 30

After transaction:

70

Never allow:

- 100 -> 70 -> 40 through separate unsafe operations
- negative credits
- duplicated deduction

---

# 9. Idempotency

Every credit-consuming operation must have an idempotency key.

The same request must never consume credits twice.

---

# 10. Reservation

For expensive AI operations, the system may use:

RESERVE

↓

PROCESS

↓

COMMIT

or

RESERVE

↓

PROCESS

↓

RELEASE

This avoids losing user credits when an operation fails.

---

# 11. Refund

When a refundable operation fails:

The platform creates a REFUND transaction.

Never directly modify wallet balance without a ledger entry.

---

# 12. Bonus Credits

Bonus credits must be distinguishable from purchased credits when required.

The system must support promotional bonuses.

---

# 13. Expiration

The architecture must support expiration dates.

MVP may keep credits non-expiring.

Do not implement expiration unless explicitly enabled.

---

# 14. Purchase

Successful payment:

Payment confirmed

↓

Credit transaction created

↓

Wallet updated

↓

Transaction committed

Every step must be safely transactional.

---

# 15. Display

The UI must always display:

Current balance

Feature cost

Remaining balance

Example:

Balance: 420 credits

Cost: 30 credits

After operation: 390 credits

---

# 16. Admin

Administrators may adjust credits only through an explicit audited operation.

Every adjustment requires:

- Reason
- Admin ID
- Amount
- Before balance
- After balance

---

# 17. Reporting

The system must support:

Credits purchased

Credits consumed

Credits refunded

Bonus credits

Average consumption

Top consuming features

---

# 18. Security

Users cannot modify their own credit balance.

Frontend must never be trusted for credit calculations.

Backend determines all costs and balances.

---

# 19. Testing

Mandatory tests:

- Insufficient balance
- Exact balance
- Concurrent requests
- Duplicate request
- Refund
- Payment retry
- Failed operation
- Admin adjustment
- Transaction rollback

---

# 20. Golden Rule

The credit ledger is the source of truth for all credit movements.