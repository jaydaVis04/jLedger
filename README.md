# jLedger!

A personal financial ledger system built around double-entry accounting, immutable journal history, and derived financial reporting.

## Overview

jLedger! is a finance-focused software engineering project that models how real ledger systems record and validate money movement. Instead of mutating balances directly, the system records transactions as balanced journal entries (debits and credits) and derives account balances and reports from the ledger.

The goal is correctness, traceability, and integrity: the ledger is the source of truth, and financial state is reconstructed from recorded events.

## Key Features

- Double-entry journal entry posting (debits must equal credits)
- Append-only ledger history (audit-friendly transaction trail)
- Account types and structured chart of accounts (Assets, Liabilities, Equity, Revenue, Expense)
- Derived balances (computed from ledger data, not manually edited)
- Trial balance reporting for verification of ledger consistency
- Authentication and access control for protected financial data
- Multi-ledger support with a single active ledger context

## Architecture

- Full-stack TypeScript
- API-first backend responsible for financial correctness and data integrity
- Frontend focused on dashboard UX and reporting views
- Database-backed ledger with transactional guarantees

## Tech Stack

Planned / Target stack:

- Backend: Node.js (LTS), TypeScript (strict), NestJS
- Database: PostgreSQL, Prisma ORM
- Auth: JWT (access + refresh tokens), password hashing (bcrypt/argon2)
- Async/Caching (optional): Redis, BullMQ
- Frontend: Next.js (TypeScript), React, Tailwind CSS, TanStack Query
- Testing: Jest, Supertest
- Tooling: Docker, Docker Compose, ESLint, Prettier

## Domain Model (Conceptual)

- **Ledger**: isolated set of financial records (one active at a time)
- **Account**: categorized by account type (A/L/E/R/Ex)
- **Journal Entry**: a single financial event
- **Posting / Line Item**: debit or credit applied to an account
- **Invariant**: total debits == total credits for every journal entry

## Getting Started

### Prerequisites
- Node.js (LTS)
- Docker + Docker Compose (recommended for Postgres/Redis)

### Setup (Typical)
1. Clone the repository
2. Create environment files:
   - Copy `.env.example` to `.env` and fill values
3. Start dependencies:
   - `docker compose up -d`
4. Install dependencies:
   - `npm install`
5. Run migrations (if applicable):
   - `npx prisma migrate dev`
6. Start development servers:
   - Backend: `npm run dev`
   - Frontend: `npm run dev` (if in a separate app directory)

> Note: Exact commands may differ depending on the final monorepo layout.

## API Documentation

If using NestJS Swagger/OpenAPI, API docs are available at:

- `http://localhost:<port>/docs`

## Testing

- Unit and integration tests validate financial invariants and transaction posting behavior.
- Example focus areas:
  - Balanced journal entries
  - Atomic posting (all-or-nothing)
  - Derived balances and trial balance correctness

Run tests:
- `npm test`

## Project Documentation

- Requirements and specifications are stored in `/docs`.
- Architecture and design notes should be added to `/docs/architecture.md`.

## Status

Active development.

## License

Specify a license if you plan to open-source this project (e.g., MIT). Otherwise, omit this section.
