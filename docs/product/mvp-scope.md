# CVLab AI — MVP Scope

Status: resolved decision (approved 2026-07-30), derived from `prompts/09-product-vision.md` §7–8 and `prompts/14-development-roadmap.md` §9. This is a boundary document — its purpose is to prevent scope creep, not to describe implementation detail.

## IN MVP

- Authentication (register, login, logout, refresh, password hashing, email-verification & password-reset architecture, roles, MFA-extensible design per [security-architecture.md](../architecture/security-architecture.md))
- User profile (personal + professional info, education, skills, experience, social links, photo architecture)
- CV builder (creation, sections, templates, autosave, preview, PDF export — see [cv-data-model.md](../architecture/cv-data-model.md))
- CV versioning (structured JSONB versions, restore — see [cv-data-model.md](../architecture/cv-data-model.md))
- AI CV improvement (wording improvement only, no fabricated content — see [ai-architecture.md](../architecture/ai-architecture.md))
- Cover letters
- ATS analysis (CV vs. job description)
- Credit wallet (balance, ledger — see [credit-architecture.md](../architecture/credit-architecture.md))
- Credit packages (database-configured, seed values in [credit-architecture.md](../architecture/credit-architecture.md) §5)
- M-Pesa architecture (provider abstraction + `MpesaProvider`, no real API calls yet — see [payment-architecture.md](../architecture/payment-architecture.md))
- Tests (question bank, sessions, retakes — see [database-overview.md](../architecture/database-overview.md) §2)
- Interview practice (AI-generated questions, answers, evaluation, scoring)
- History (centralized activity feed via domain events — see [system-architecture.md](../architecture/system-architecture.md) §4)
- Admin dashboard (users, payments, credits, tests, questions, AI usage/config, analytics, audit logs, settings)
- Notifications (in-app only)
- Portuguese UI
- Internationalization scaffolding (i18n + currency-abstraction layers exist; no second language/currency wired up — see below)

## OUTSIDE MVP (explicitly deferred — do not implement unless the user explicitly requests it)

- Job marketplace
- Recruiter accounts
- Employer accounts
- Public profiles
- Courses
- Certifications marketplace
- eMola
- Cards
- Bank payments
- Credit transfers
- Credit expiration
- International currencies

Architecture may prepare for these (e.g. the `PaymentProvider` interface already has room for `EmolaProvider`/`CardProvider`, per [payment-architecture.md](../architecture/payment-architecture.md)), but none are implemented now.

## Guardrail

Per `prompts/09-product-vision.md` §15 (Golden Rule): every feature must provide clear value to the user's professional development — features are not added because they are technically interesting. Per `prompts/14-development-roadmap.md` §9: the architecture may *prepare* for future features (interfaces, abstractions) but must not *implement* them in MVP.
