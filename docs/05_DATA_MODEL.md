# 05 - Data Model

The SQL starter lives in `database/schema.sql`. This document explains intent.

## Core hierarchy

```text
Organization/Company
  -> Contacts
  -> Opportunities
      -> Activities
      -> Audit
          -> Processes
              -> Agentic Opportunities
          -> ROI Scenarios
      -> Proposals
      -> Deployments
          -> Agent Roles
          -> KPI Measurements
          -> QA Items
      -> Retainers
```

## Required reference dimensions
- vertical
- source
- campaign
- sales rep / owner
- pipeline stage
- loss reason
- process classification
- proposal type
- deployment status

## Process classifications
- HUMAN_ONLY
- AUTOMATE
- AGENT_READY
- REDESIGN_FIRST

## Scoring dimensions
Store raw scores separately so weights can evolve:
- economic impact
- frequency / volume
- repetitiveness
- data availability
- rule clarity
- human judgment required (inverse contribution)
- error consequence (inverse contribution)
- implementation difficulty (inverse contribution)
- time-to-value

## Money
Store integer cents and ISO currency code. Do not use floating-point money.

## Attribution
The platform must preserve, whenever known:
- channel/source
- campaign
- content/post/reel identifier
- keyword
- UTM data
- referrer/partner

Attribution must survive from lead to paid audit, proposal, deployment, and revenue analytics.

## ROI records
Every ROI estimate must preserve assumptions and the date/version used. Never overwrite historical assumptions silently.

## Auditability
Stage changes, opportunity value, audit score, proposal amount, deployment status, and KPI/result edits require audit trail entries.
