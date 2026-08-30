# CVLab AI - Project Instructions

## Project Identity

CVLab AI is a production-oriented career development SaaS platform.

The platform allows users to:

- Create professional CVs
- Edit CVs
- Improve CVs using AI
- Generate cover letters
- Analyse CVs against job descriptions
- Practice technical tests
- Practice job interviews
- Manage professional profiles
- Purchase credits
- Consume credits
- View activity history

Initial market:

Mozambique

Primary currency:

MZN / MT

Primary language:

Portuguese

The architecture must support future internationalization.

---

# Mandatory Instructions

Before making any code changes, read all relevant files inside:

prompts/

At minimum, always consider:

prompts/00-rules.md
prompts/01-coding-standards.md
prompts/02-ui-guidelines.md
prompts/03-ai-prompts.md
prompts/04-database-rules.md
prompts/05-security.md
prompts/06-git-workflow.md
prompts/07-testing.md
prompts/08-deployment.md
prompts/09-product-vision.md
prompts/10-business-rules.md
prompts/11-credit-system.md
prompts/12-mpesa-integration.md
prompts/13-api-contracts.md
prompts/14-development-roadmap.md

These files are authoritative project rules.

If two rules conflict, stop and identify the conflict before implementing.

Never silently override project rules.

---

# Development Philosophy

Act as a senior software engineering team.

Think about:

- Architecture
- Security
- Scalability
- Maintainability
- Testing
- UX
- Performance
- Observability

Do not optimize merely for speed of implementation.

---

# Important Rule

Never implement the entire application in one step.

Work milestone by milestone.

Before implementing a milestone:

1. Understand the requirement.
2. Inspect the existing code.
3. Inspect relevant documentation.
4. Identify dependencies.
5. Create an implementation plan.
6. Implement.
7. Test.
8. Review.
9. Document.

---

# Existing Architecture

Preferred stack:

Frontend:

Next.js
React
TypeScript
Tailwind CSS

Backend:

NestJS
TypeScript

Database:

PostgreSQL

ORM:

Prisma

Cache:

Redis

Storage:

Cloudflare R2

AI:

OpenAI API

Authentication:

JWT
Refresh Tokens

Payments:

M-Pesa initially

Future:

eMola
Cards
Other payment providers

---

# Architecture Principles

Use:

- Clean Architecture
- SOLID
- DRY
- KISS
- Separation of Concerns
- Dependency Inversion

Business logic must not depend directly on infrastructure implementations.

---

# Financial Integrity

Payments and credits are critical systems.

Never:

- Trust frontend credit values
- Trust frontend payment status
- Grant credits twice
- Allow negative balances
- Process the same payment twice
- Modify wallet balances without ledger entries

All credit operations must be:

- Atomic
- Idempotent
- Auditable
- Recoverable

---

# AI Integrity

AI must never invent user qualifications, experiences, degrees, companies, certifications or achievements.

AI may improve wording while preserving factual information.

AI operations that consume credits must go through the backend credit system.

---

# Security

Never expose:

- API keys
- Secrets
- Passwords
- Tokens
- Payment credentials

Never commit `.env` files.

All sensitive configuration must use environment variables or secure secret management.

---

# Testing

No production feature is considered complete until appropriate tests exist.

Critical modules require:

- Unit tests
- Integration tests
- End-to-end tests where appropriate

Critical systems include:

- Authentication
- Credits
- Payments
- AI
- CV generation
- Tests
- Interviews

---

# Git

Use conventional commits.

Never make destructive Git operations without explicit authorization.

Never delete existing work simply to simplify implementation.

---

# Communication

Before a significant implementation:

Explain briefly:

- What will be implemented
- Why
- Which files/modules will change
- Potential risks

After implementation:

Report:

- What changed
- Tests executed
- Results
- Remaining issues

---

# Do Not Guess

When implementation depends on external documentation, verify the official documentation.

This is especially important for:

- M-Pesa
- OpenAI
- Next.js
- NestJS
- Prisma
- PostgreSQL
- Cloudflare
- Authentication providers

Never invent API endpoints, parameters or authentication mechanisms.

---

# Source of Truth

For product behavior:

prompts/09-product-vision.md

For business rules:

prompts/10-business-rules.md

For credits:

prompts/11-credit-system.md

For M-Pesa:

prompts/12-mpesa-integration.md

For API:

prompts/13-api-contracts.md

For development sequence:

prompts/14-development-roadmap.md

<!-- cloude-code-toolbox:mcp-skills-awareness-begin -->

### MCP & Skills awareness (Cloude Code ToolBox)

_Last synced: 2026-08-23T18:21:10.582Z._

- **Full report:** `.claude/cloude-code-toolbox-mcp-skills-awareness.md` in this workspace (auto-overwritten on each scan). Use it as ground truth for configured servers and skill folders.
- **MCP:** For **live tools** in Claude Code, enable the matching server via `/mcp`. Servers are configured in `~/.claude.json` (user) and `.mcp.json` (project).
- **When the user’s task matches a server** (e.g. Confluence work and a **Confluence** / **Atlassian** MCP is listed), **prefer that server id** and plan on tool use—not only file search.
- **Skills:** Folders below contain `SKILL.md`; attach or cite paths in chat when relevant.

#### Workspace MCP

- `c:\Users\user\prompts\.mcp.json` _(workspace: prompts)_ — _file missing_

_No active workspace servers in mcp.json._

#### User MCP

- `C:\Users\user\.claude.json` — _no servers defined_

_No active user-scoped servers in mcp.json._

#### Project skills

_None found (or no workspace open)._

#### User skills

_None found._

<!-- cloude-code-toolbox:mcp-skills-awareness-end -->
