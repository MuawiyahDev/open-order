# OpenOrder — Agent Instructions

## 1. Project Overview

OpenOrder is an open-source, self-hosted order management panel for social-commerce sellers who manage orders through Facebook, Instagram, WhatsApp, and other messaging channels.

The goal is to provide a simple, reliable way to manage products, customers, orders, payments, delivery, and invoices.

### Core Principles

- Self-hosted and open-source.
- Designed for a single business per installation.
- Simple to install, configure, maintain, and extend.
- Prioritize practical features that solve real seller problems.
- Build production-quality software without unnecessary complexity.

## 2. Technology Stack

- **Monorepo:** pnpm workspaces and Turborepo.
- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, shadcn/ui.
- **Forms:** React Hook Form and Zod.
- **Backend:** NestJS and TypeScript.
- **Database:** PostgreSQL and Prisma ORM.
- **Authentication:** JWT and secure password hashing.
- **Deployment:** Docker and Docker Compose.

Before introducing new libraries or tools, inspect the existing dependencies and project conventions.

## 3. Monorepo Architecture

Follow the existing repository structure:

- `apps/web`: Next.js frontend application.
- `apps/api`: NestJS backend API and business logic.
- `packages/database`: Prisma schema, migrations, and shared database setup, if this package is used.
- `packages/types`: Shared TypeScript types when genuinely needed.
- `packages/validation`: Shared Zod schemas when genuinely needed.
- `packages/config`: Shared configuration when genuinely needed.

### Architecture Rules

- Keep frontend and backend responsibilities separate.
- Keep business logic out of UI components.
- Keep database access and persistence logic on the server.
- Put shared code in packages only when multiple applications genuinely need it.
- Avoid circular dependencies between packages and applications.
- Follow the existing architecture instead of introducing competing patterns.
- Do not create unnecessary packages, layers, services, or abstractions.
- Do not move files or restructure the project unless required by the task.

## 4. Code Quality Standards

Write clean, reusable, maintainable, readable, and production-ready code.

- Prefer simple, clear solutions over clever or unnecessarily complex implementations.
- Follow SOLID principles where appropriate without overengineering.
- Apply DRY principles without sacrificing readability.
- Give variables, functions, components, types, and files descriptive names.
- Keep functions, components, and modules focused on a single responsibility.
- Separate presentation, business logic, validation, and data access appropriately.
- Reuse existing components, hooks, utilities, services, and patterns.
- Avoid duplicated code and unnecessary abstractions.
- Use composition and small, focused modules where they improve maintainability.
- Avoid giant components, oversized services, and functions that do too many things.
- Avoid deeply nested conditionals when simpler control flow is possible.
- Prefer immutable data transformations where appropriate.
- Handle edge cases, errors, loading states, and empty states explicitly.
- Consider performance, accessibility, responsiveness, and security where relevant.
- Avoid premature optimization.
- Do not leave placeholder implementations, fake functionality, or unnecessary TODOs in completed features.
- Do not add dependencies unless they provide clear value.
- Do not introduce features beyond the task's scope.
- Never sacrifice correctness or security for fewer lines of code.

## 5. TypeScript Standards

- Use TypeScript strict mode and preserve existing compiler settings.
- Avoid `any`; prefer specific types, generics, `unknown`, and proper narrowing.
- Avoid unsafe type assertions and unnecessary `@ts-ignore` or `@ts-expect-error`.
- Define clear interfaces and types for domain concepts and API contracts.
- Reuse shared types when appropriate.
- Avoid duplicating types across frontend and backend when they can safely be shared.
- Do not use TypeScript types as a replacement for runtime validation.
- Avoid unnecessary abstractions for simple data structures.
- Keep types accurate and aligned with actual runtime behavior.

## 6. Frontend Standards

For `apps/web`:

- Follow Next.js conventions and the existing routing structure.
- Use React Server Components by default when appropriate.
- Add `"use client"` only when client-side interactivity or browser APIs require it.
- Use client components thoughtfully; do not turn entire pages into client components unnecessarily.
- Use Tailwind CSS and existing shadcn/ui components consistently.
- Build reusable UI components when reuse or clear separation justifies them.
- Keep page components focused on composition rather than complex business logic.
- Use React Hook Form and Zod for form handling and validation where appropriate.
- Provide clear validation messages and useful error feedback.
- Implement loading, empty, success, and error states where relevant.
- Ensure interfaces work on mobile, tablet, and desktop.
- Follow accessibility best practices, including semantic HTML, keyboard navigation, labels, and visible focus states.
- Avoid unnecessary client-side state and effects.
- Avoid duplicating API request logic across components.
- Keep API communication consistent with existing frontend patterns.
- Never expose secrets through `NEXT_PUBLIC_*` environment variables.
- Do not trust client-side validation as the only security boundary.

## 7. Backend Standards

For `apps/api`:

- Follow NestJS conventions and use dependency injection appropriately.
- Keep controllers focused on HTTP concerns and request/response handling.
- Put business logic in appropriate services or domain modules.
- Use DTOs and runtime validation for incoming requests.
- Keep database operations within the established data-access patterns.
- Return consistent, meaningful HTTP status codes and error responses.
- Handle expected failures explicitly without swallowing unexpected errors.
- Avoid leaking stack traces, internal details, secrets, or sensitive data to clients.
- Enforce authentication and authorization on the server.
- Validate resource ownership and permissions where applicable.
- Use pagination for endpoints that may return large collections.
- Avoid N+1 database queries and unnecessary database round trips.
- Use transactions when multiple database operations must succeed or fail together.
- Avoid unnecessary abstractions and excessive service-to-service indirection.
- Keep API contracts predictable and consistent.

## 8. Database and Prisma Standards

- Use Prisma as the ORM and PostgreSQL as the database.
- Follow the existing Prisma schema organization.
- Use clear, consistent model names and field names.
- Define appropriate relations, unique constraints, indexes, and database constraints.
- Add indexes based on query patterns and actual requirements.
- Avoid storing redundant or derived data unless there is a clear reason.
- Use appropriate field types, defaults, and nullability.
- Never store plaintext passwords or other sensitive credentials.
- Use Prisma migrations for schema changes.
- Commit migration files and schema changes to Git.
- Use `prisma migrate dev` for development migrations.
- Use `prisma migrate deploy` for production deployments.
- Never reset, drop, or destructively modify a production database without explicit authorization and a verified recovery plan.
- Do not modify migration history casually after migrations have been shared or applied.
- Avoid unnecessary queries and retrieve only the data required.
- Handle database errors safely and predictably.

## 9. Authentication and Security

- Hash passwords using an appropriate password-hashing algorithm, such as Argon2id or bcrypt with suitable parameters.
- Never store plaintext passwords.
- Never hardcode secrets, credentials, or API keys.
- Keep secrets in environment variables or an appropriate secrets manager.
- Validate authentication and authorization on the server.
- Protect private routes and sensitive operations.
- Do not rely on frontend route protection alone.
- Validate all untrusted input at the appropriate boundaries.
- Prevent users from accessing resources they are not authorized to access.
- Avoid leaking whether sensitive accounts or credentials exist when that creates a security risk.
- Use secure cookie settings when cookies are used for authentication.
- Apply appropriate rate limiting to sensitive endpoints, especially authentication endpoints.
- Avoid logging passwords, access tokens, secrets, or unnecessary personal data.
- Consider CSRF protection when the authentication and cookie architecture requires it.
- Follow the principle of least privilege.
- Never weaken security to make a feature easier to implement.

## 10. Environment Configuration

- Keep environment-specific configuration in the appropriate application's environment files.
- Maintain `.env.example` files containing variable names and safe example values only.
- Never commit real credentials or production secrets.
- Validate required environment variables during application startup where practical.
- Do not silently replace missing required configuration with unsafe defaults.
- Keep frontend and backend environment variables clearly separated.
- Document configuration changes when they affect setup or deployment.

## 11. Testing and Verification

- Add tests for important business logic and critical functionality.
- Test validation, authorization, and error-handling paths where appropriate.
- Follow the repository's existing testing framework and conventions.
- Run relevant lint, type-check, test, and build commands after making changes.
- Fix issues introduced by your changes.
- Do not modify tests simply to make incorrect implementation pass.
- Do not claim tests or builds passed unless they were actually executed successfully.
- If a check cannot be run, explain why.
- Prefer meaningful tests over tests that merely repeat implementation details.

## 12. Git and Code Changes

- Follow Conventional Commits.
- Use appropriate scopes for frontend, backend, database, and other changes.

Examples:

- `feat(api): add product endpoints`
- `feat(web): add product management page`
- `feat(auth): implement authentication system`
- `fix(api): handle invalid order status`
- `fix(web): correct mobile layout`
- `chore(db): configure Prisma`
- `docs: update installation instructions`
- `test(api): cover order creation`

### Change Management

- Make the smallest complete change that solves the task.
- Avoid modifying unrelated files.
- Do not overwrite existing work without inspecting it.
- Do not discard user changes.
- Do not run destructive Git commands without explicit authorization.
- Do not commit or push changes unless explicitly asked.
- Review the final diff for unintended changes before finishing.

## 13. Development Workflow

For every task:

1. Inspect the relevant files, existing patterns, dependencies, and configuration.
2. Understand how the requested feature fits the current architecture.
3. Identify important edge cases and potential security concerns.
4. For substantial tasks, briefly outline the implementation plan before making changes.
5. Implement the smallest complete solution using existing project conventions.
6. Add or update tests where appropriate.
7. Run relevant linting, type-checking, tests, and builds.
8. Review the diff for bugs, duplicated logic, security issues, and unnecessary changes.
9. Summarize what changed and report verification results honestly.

Do not ask for confirmation for routine, reversible implementation details when the existing codebase provides a clear answer. Ask questions when requirements are genuinely ambiguous or a decision could cause significant architectural or data-loss consequences.

## 14. Product Scope

OpenOrder is intended to remain a straightforward self-hosted application.

Do not introduce the following unless explicitly requested:

- Multi-tenancy or a multi-store platform.
- Subscription billing.
- A hosted SaaS control plane.
- Customer-facing accounts or storefronts.
- AI-based order parsing.
- Official WhatsApp Business API integration.
- Facebook or Instagram API integrations.
- Courier API integrations.
- Payment gateway integrations.
- Offline-first architecture.
- Microservices.
- A separate mobile application.
- Complex role and permission systems.

Prefer a working, reliable MVP over premature expansion.

## 15. Final Response Requirements

After completing a coding task, provide a concise summary that includes:

- What was implemented.
- Important files changed.
- Relevant commands and checks executed.
- Whether those checks passed or failed.
- Any known limitations or follow-up work.

Do not claim completion when essential functionality is missing. Be transparent about assumptions, unverified behavior, and unresolved issues.
