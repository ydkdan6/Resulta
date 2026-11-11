You are helping me build a school result management platform for Nigerian schools.
Stack: Next.js (App Router, TypeScript), Tailwind, PostgreSQL on Supabase, Prisma.
Work in small steps, explain what you changed, and write tests for security-critical logic. Do not add features I have not asked for.

What it does: schools upload exam results, and parents view report cards online using a PIN card tied to one student and one term.

Roles: platform_admin (me), school_admin, teacher. Students and parents have no accounts.

Rules:
1. Multi-tenant: every school-owned table has school_id, and every query is scoped to the logged-in user's school.
2. Teachers see only their assigned classes and subjects.
3. Parents log in with admission number + the current term's PIN, on a school-specific page.
4. Each PIN card is for one particular student and one term. A school year (session, for example 2026/2027) has a 1st, 2nd and 3rd term, and the next year starts a new session. A new card is generated for each student every term. Store only a hash, never the plain PIN.
5. A PIN opens its own term and all earlier published terms, never later terms. It expires when the next term's PINs are generated.
6. PINs are generated only after I confirm a payment. Card price is NGN 1,000 and my share is NGN 500 per student (configurable per school).
7. Results are hidden until the term is published. A school can lock (withhold) a student's results for a term.
8. Every change to scores, payment status, locks and PINs is written to an audit log.
9. Currency is Naira.
10. Each school gets two addresses, created automatically: a results address for parents (slug.yourplatform.com) and a staff address (slug-staff.yourplatform.com).
11. The school_admin also handles payment marking. There is no separate bursar role.
12. Every printed card shows the school name and logo, the student's full name and admission number, and belongs to that student only.
13. platform_admin creates schools (name and logo), teacher accounts, class and subject assignments and grading schemes. school_admin can edit the school name and logo.