# Database Rules

Database:

PostgreSQL


ORM:

Prisma


---

# Design Principles

Database must be:

Normalized

Secure

Scalable


---

# Naming

Tables:

plural snake_case


Example:

users

credit_transactions


Columns:

snake_case


Example:

created_at


---

# Every table must contain:

id

created_at

updated_at


---

# Relations

Always define:

Foreign Keys

Indexes

Constraints


---

# Never:

Delete important data permanently.

Use:

soft delete


Example:

deleted_at


---

# Transactions

Use transactions for:

Payments

Credits

Orders


---

# Performance

Always analyze:

Queries

Indexes

Relations


---

# Migration

Never manually modify production database.

Always use migrations.