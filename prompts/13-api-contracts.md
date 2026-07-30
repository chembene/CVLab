# CVLab AI - API Contract Rules

# 1. General Principle

The API is the contract between frontend and backend.

API contracts must be predictable, documented and versioned.

---

# 2. Base URL

Use API versioning.

Example:

/api/v1

---

# 3. Response Format

Success:

{
  "success": true,
  "data": {},
  "meta": {}
}

Error:

{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}

---

# 4. HTTP Status Codes

Use standard HTTP codes.

200

Successful request

201

Resource created

204

Successful request without body

400

Invalid request

401

Unauthenticated

403

Unauthorized

404

Resource not found

409

Conflict

422

Validation error

429

Rate limit exceeded

500

Internal server error

502

Upstream provider error

503

Service unavailable

---

# 5. Authentication

Protected endpoints require authentication.

Use:

Authorization: Bearer <token>

Authentication must be handled by backend middleware/guards.

---

# 6. Authorization

Authentication does not automatically grant permission.

Every protected resource must check authorization.

Examples:

User can access only their own CV.

Admin can access administrative resources.

---

# 7. Pagination

List endpoints must support pagination.

Example:

?page=1&limit=20

Response:

{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 100,
  "totalPages": 5
}

---

# 8. Filtering

Filters must be explicit.

Example:

?status=completed

Do not create ambiguous query parameters.

---

# 9. Sorting

Use:

?sortBy=createdAt&sortOrder=desc

Allowed fields must be validated.

---

# 10. Validation

All request bodies must be validated.

Never trust:

- IDs
- prices
- credit amounts
- roles
- payment status

coming from the frontend.

---

# 11. Idempotency

Critical POST operations must support idempotency.

Especially:

Payments

Credit purchases

Credit consumption

AI requests where duplicate execution is expensive

---

# 12. API Endpoints

Required modules:

Authentication

/users

/profile

/cvs

/cv-versions

/cover-letters

/ai

/ats

/interviews

/tests

/test-sessions

/credits

/payments

/notifications

/history

/admin

---

# 13. Credit API

The frontend may request:

GET /credits

GET /credits/transactions

POST /credits/estimate

The backend decides whether a user can perform a paid operation.

---

# 14. Payment API

Example conceptual endpoints:

POST /payments

GET /payments/:id

POST /payments/:id/verify

Provider callbacks must use dedicated secured endpoints.

Actual provider-specific endpoint design must follow the integration documentation.

---

# 15. CV API

Support:

POST /cvs

GET /cvs

GET /cvs/:id

PATCH /cvs/:id

DELETE /cvs/:id

POST /cvs/:id/improve

POST /cvs/:id/analyse

POST /cvs/:id/translate

---

# 16. Interview API

Support:

POST /interviews

GET /interviews

GET /interviews/:id

POST /interviews/:id/answer

POST /interviews/:id/complete

---

# 17. Test API

Support:

GET /tests

GET /tests/:id

POST /tests/:id/start

POST /test-sessions/:id/answer

POST /test-sessions/:id/complete

GET /test-sessions/:id/result

---

# 18. Admin API

Admin APIs must be separated conceptually from user APIs.

Examples:

/admin/users

/admin/payments

/admin/credits

/admin/tests

/admin/questions

/admin/analytics

/admin/logs

/admin/settings

---

# 19. API Documentation

Use Swagger/OpenAPI.

Every endpoint must document:

- Description
- Authentication
- Parameters
- Body
- Responses
- Errors
- Examples

---

# 20. API Versioning

Breaking changes must use a new API version.

Never silently break an existing frontend.

---

# 21. Rate Limiting

Apply stronger rate limits to:

- Login
- Password reset
- AI
- Payment
- Test submission
- Interview submission

---

# 22. Error Messages

User-facing messages must be understandable.

Never expose:

- stack traces
- SQL errors
- internal architecture
- secrets
- provider credentials

---

# 23. Golden Rule

The backend is the source of truth for:

- permissions
- credits
- prices
- payment status
- AI costs
- business rules