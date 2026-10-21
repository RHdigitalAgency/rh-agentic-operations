# ADR-0001: Initial Technical Stack

Status: Accepted  
Date: 2026-10-20

## Decision
Use a conventional TypeScript web stack: Next.js, PostgreSQL/Supabase, Supabase Auth, Tailwind CSS, and Vercel or equivalent deployment.

## Why
- fast agent-assisted development
- strong relational modeling
- simple managed auth/database
- straightforward webhooks/API integrations
- low operational overhead
- avoids unnecessary orchestration platforms

## Consequence
Do not add Grok Bot, Dots, n8n, or another agent/orchestration dependency for core CRM logic.
