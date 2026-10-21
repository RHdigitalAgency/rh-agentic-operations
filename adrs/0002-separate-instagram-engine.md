# ADR-0002: Instagram Automation Remains Separate

Status: Accepted  
Date: 2026-10-20

## Decision
The Instagram Growth Automation project remains a separate system. RH Agentic Operations Platform receives normalized lead events and attribution from it.

## Why
- avoids duplicate development
- keeps responsibilities clear
- allows Instagram automation to evolve independently
- preserves a clean CRM domain model

## Required integration fields
source, campaign, content/post identifier, keyword, contact identity/data available, external event ID, timestamp, metadata.
