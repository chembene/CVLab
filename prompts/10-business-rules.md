# CVLab AI - Business Rules

# 1. User Account

Every user must have a unique account.

Email must be unique.

Phone number must be unique when provided.

A user may have multiple CVs.

A user may maintain multiple CV versions.

---

# 2. User Status

Possible user statuses:

ACTIVE

SUSPENDED

PENDING_VERIFICATION

DELETED

---

# 3. Credit Rules

Credits represent internal platform usage units.

Credits are not money.

Credits cannot be transferred between users unless a future feature explicitly enables it.

Credits cannot be manually modified without an auditable transaction.

---

# 4. Paid Features

Paid features include:

- CV improvement
- CV generation
- Cover letter generation
- ATS analysis
- CV translation
- Interview practice
- Tests
- Other AI features configured by the platform

Every paid feature must have a configurable credit cost.

---

# 5. Credit Reservation

Before executing a paid operation:

1. Verify the user has sufficient credits.
2. Reserve or deduct the required credits atomically.
3. Execute the operation.
4. If the operation fails according to refund rules, restore the reserved credits.

Never execute a paid operation without sufficient balance.

---

# 6. Failed Operations

If a paid operation fails because of an internal platform error:

The user's credits must be refunded.

If the failure is caused by invalid user input:

Credits may be consumed only if the platform has already performed meaningful processing.

This rule must be implemented consistently per feature.

---

# 7. Payment Rules

A payment must not add credits until the payment is confirmed.

Frontend success messages are NOT proof of payment.

The backend must verify payment status.

Every successful payment must have an immutable transaction record.

---

# 8. Duplicate Payments

The same provider transaction must never generate credits more than once.

Payment processing must be idempotent.

---

# 9. Credit Purchases

Each credit package contains:

- package ID
- amount in MT
- base credits
- bonus credits
- total credits
- status

The total credits credited to the user must be explicitly recorded.

---

# 10. CV Rules

Users can create multiple CVs.

Every save must create a version or update according to the versioning strategy.

Users must be able to recover previous versions when versioning is enabled.

---

# 11. AI Rules

AI-generated content must be considered assistance, not guaranteed truth.

The system must not invent:

- Qualifications
- Degrees
- Jobs
- Companies
- Certifications
- Skills
- Professional achievements

The system may improve wording but must preserve factual user information.

---

# 12. Job Description Analysis

When analysing a CV against a job description:

The system must:

- Extract requirements
- Compare skills
- Compare experience
- Identify missing keywords
- Identify strengths
- Provide recommendations

The system must not guarantee employment.

---

# 13. Tests

Every test may contain:

- Questions
- Multiple-choice answers
- Correct answers
- Explanations
- Score
- Time limit

Question banks must be managed independently from test sessions.

---

# 14. Interview Practice

Interview sessions must store:

- Session ID
- Questions
- User answers
- Evaluation
- Suggestions
- Score
- Timestamp

---

# 15. History

Important user actions must appear in history.

Examples:

- Login
- CV created
- CV improved
- Test completed
- Interview completed
- Credits purchased
- Credits consumed

---

# 16. Refunds

Credits may be refunded when:

- AI service fails
- Internal server error occurs
- Duplicate charge occurs
- Administrator approves refund

Every refund must have a reason.

---

# 17. Administrative Actions

Administrative changes involving:

- Credits
- Payments
- Users
- Permissions
- AI configurations

must generate audit logs.

---

# 18. Data Ownership

Users own the professional information they submit.

The platform must provide mechanisms for:

- Export
- Update
- Deletion, subject to legal and operational requirements

---

# 19. No Hidden Costs

Before every paid action, show:

Feature

Credit cost

Current balance

Remaining balance after operation

---

# 20. Configuration

Business rules that may change over time should be configurable instead of hardcoded.

Examples:

- Credit prices
- Credit costs
- Promotional bonuses
- Test prices
- Limits
- Feature availability

---

# 21. Golden Rule

Financial operations and credit operations must always be:

Atomic

Auditable

Idempotent

Recoverable