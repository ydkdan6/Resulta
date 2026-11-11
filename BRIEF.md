# School Result Management Platform — Development Instructions

You are helping me build a school result management platform for Nigerian schools.

**Stack:** Next.js (App Router, TypeScript), Tailwind CSS, PostgreSQL on Supabase, Prisma.

Work in small steps, explain what you changed, and write tests for security-critical logic. Do not add features I have not asked for.

## What it does

Schools upload exam results, and parents view report cards online using a PIN card tied to one student and one term.

## Roles

- `platform_admin` (me)
- `school_admin`
- `teacher`

Students and parents have no accounts.

## Business rules

1. **Multi-tenancy:** Every school-owned table has `school_id`, and every query is scoped to the logged-in user's school.
2. **Teacher permissions:** Teachers see only their assigned classes and subjects.
3. **Parent access:** Parents log in with admission number + the current term's PIN, on a school-specific page.
4. **PIN cards:** Each PIN card is for one particular student and one term. A school year (session, for example 2026/2027) has a 1st, 2nd and 3rd term, and the next year starts a new session. A new card is generated for each student every term. Store only a hash, never the plain PIN.
5. **PIN access period:** A PIN opens its own term and all earlier published terms, never later terms. It expires when the next term's PINs are generated.
6. **Payment and PIN generation:** PINs are generated only after I confirm a payment. Card price is NGN 2,000 and my share is NGN 1,000 per student (configurable per school).
7. **Publication and withholding:** Results are hidden until the term is published. A school can lock (withhold) a student's results for a term.
8. **Audit logs:** Every change to scores, payment status, locks and PINs is written to an audit log.
9. **Currency:** Naira (NGN).
10. **School addresses:** Each school gets two addresses, created automatically: a results address for parents (`slug.yourplatform.com`) and a staff address (`slug-staff.yourplatform.com`).
11. **Payment marking:** The `school_admin` also handles payment marking. There is no separate bursar role.
12. **Printed cards:** Every printed card shows the school name and logo, the student's full name and admission number, and belongs to that student only.
13. **School setup and management:** `platform_admin` creates schools (name and logo), teacher accounts, class and subject assignments and grading schemes. `school_admin` can edit the school name and logo.

## Security and access-control requirements

Security is a priority. Never rely on frontend restrictions alone.

1. **Server-side authorization:** Enforce authentication and role-based permissions on every protected server action, route handler and data operation. Deny access by default.
2. **Tenant isolation:** Never trust a `school_id` supplied by the browser. Derive the user's school from their authenticated session and verify ownership before accessing or modifying school data.
3. **Platform admin access:** Only `platform_admin` can perform platform-wide administrative operations. Do not accidentally give school administrators cross-school access.
4. **Teacher restrictions:** Verify class and subject assignments on the server for every relevant operation, including viewing, uploading and editing results.
5. **Parent PIN security:**
   - Generate PINs using a cryptographically secure random number generator.
   - Store only a secure, non-reversible PIN hash. Never expose stored hashes or plain PINs through APIs, logs or database queries.
   - Because PINs may have limited entropy, use a keyed hash such as HMAC-SHA-256 with a secret stored outside the database, or another appropriately designed secure verification method.
   - Rate-limit PIN login attempts and protect against brute-force guessing.
   - Verify the admission number, school, student, term, PIN status, expiry and publication rules together.
   - Never allow a PIN to access another student's records.
   - Ensure PIN expiry and replacement cannot be bypassed through old links or requests.
6. **Payment integrity:** Only authorized users can mark payments as confirmed. Validate the student, school, term, payment amount and payment status before generating PINs. Prevent duplicate confirmations from generating duplicate cards.
7. **Audit integrity:** Audit records must identify the actor, school, affected record, action and timestamp. Never log passwords, PINs, authentication tokens or other sensitive credentials. Ordinary users must not be able to edit or delete audit records.
8. **Input validation:** Validate and sanitize all incoming data on the server, including scores, admission numbers, IDs, uploaded files and user-supplied text. Enforce reasonable file type and size limits for uploads.
9. **Database security:** Use parameterized queries through Prisma. Never construct unsafe SQL using user input. Use appropriate Supabase Row Level Security policies as an additional layer of protection where applicable.
10. **Session and credential safety:** Protect authentication sessions, use secure cookie settings in production, keep secrets in environment variables and never expose server credentials or privileged Supabase keys to the browser.
11. **Information protection:** Do not expose unpublished results, withheld results, other students' information or internal administrative data through API responses, page source, error messages or predictable record IDs.
12. **Error handling:** Return safe, meaningful error messages to users. Do not expose stack traces, database details, secrets or internal implementation information in production.

## Performance and reliability requirements

Build the platform to remain responsive as the number of schools, students, teachers and results grows.

1. **Efficient database queries:** Avoid unnecessary queries, N+1 query problems and fetching entire tables when only a few records are needed.
2. **Database indexes:** Add appropriate indexes for frequently queried fields, especially `school_id`, student IDs, admission numbers, session, term, class IDs and relevant foreign keys.
3. **Pagination:** Use server-side pagination for large student lists, result records, audit logs and other growing datasets. Avoid loading thousands of records into the browser at once.
4. **Data selection:** Fetch only the fields required for each operation. Avoid unnecessarily returning sensitive or large database records.
5. **React performance:** Avoid unnecessary component re-renders, duplicated API requests and expensive computations during rendering. Use memoization only where it provides a real benefit.
6. **Next.js performance:** Use server components where appropriate, keep client components focused and avoid unnecessarily increasing client-side JavaScript.
7. **Caching:** Cache only data that is safe to cache. Never allow cached school data or parent report cards to leak across schools, students or sessions. Ensure published results, locks and PIN changes cannot leave users seeing stale or unauthorized data.
8. **Database connections:** Manage Prisma connections correctly, especially in development and serverless deployment environments. Avoid creating unnecessary database clients.
9. **Transactions:** Use database transactions for operations that must succeed or fail together, particularly payment confirmation, PIN generation, PIN replacement, result publication and score updates where audit records are required.
10. **Concurrency:** Protect sensitive operations against simultaneous requests, duplicate submissions and race conditions. Use appropriate database constraints and transaction isolation.
11. **Failure handling:** Handle network failures, database timeouts and failed operations gracefully. Never report an operation as successful when its database changes were not committed.
12. **Large uploads:** Process result uploads with appropriate validation and controlled database operations. Avoid unnecessarily holding large files or datasets in memory.

## Code quality and development workflow

1. Use TypeScript properly. Avoid `any` unless absolutely necessary and explain why when used.
2. Keep components, business logic, database operations and authorization logic organized and maintainable.
3. Reuse shared utilities and components rather than duplicating logic.
4. Use clear naming conventions and consistent project structure.
5. Do not place complex business logic directly inside UI components.
6. Handle loading, empty, success and error states appropriately.
7. Ensure responsive layouts work across desktop, tablet and mobile.
8. Do not introduce unnecessary dependencies or packages.
9. Do not modify unrelated parts of the application when implementing a requested change.
10. Preserve existing functionality unless I explicitly request a change.

## Testing and verification

Write tests for security-critical and business-critical functionality.

Prioritize testing:

- School-to-school data isolation.
- Role-based access control.
- Teacher class and subject restrictions.
- Parent admission number and PIN verification.
- PIN expiry and previous-term access rules.
- Prevention of cross-student PIN access.
- Result publication and withholding restrictions.
- Payment confirmation and duplicate PIN generation.
- Audit log creation.
- Input validation and unauthorized requests.

Also test important database operations, API responses, error states and application behaviour after deployment.

Before considering a task complete:
- Run relevant tests.
- Run TypeScript checks.
- Run linting.
- Check for broken imports and build errors.
- Review the affected code for security and performance issues.
- Explain what was changed, what was tested and anything that still needs attention.

## How I want you to work

- Work in small, manageable steps.
- First inspect the existing project structure and understand the current implementation before changing anything.
- Do not assume existing code is correct or replace working code unnecessarily.
- Explain your implementation decisions in simple technical language.
- Ask before making major architectural changes or introducing new features.
- If you discover a security vulnerability, explain the risk and propose a fix.
- Prioritize correctness, data isolation, security and reliability over speed of implementation.
- Do not claim a feature is complete or secure unless it has been implemented and appropriately tested.

**Overall objective:** Build a reliable, secure, maintainable and performant school result management platform that can support multiple Nigerian schools without exposing one school's data to another or compromising students' academic records.