**RH DIGITAL AGENCY**

**RH Agentic Operations Platform**

PDR — internal CRM, KPI dashboard, audit engine and delivery
infrastructure

Internal strategy document · Version 1.0 · 20 October 2026

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 1. Product purpose

Build a lightweight internal operating platform for RH Agentic
Operations. The platform must provide one source of truth from lead
acquisition through paid audit, proposal, deployment, recurring
optimization and client ROI. It is not intended to become a generic CRM
or a new SaaS product in v1.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Product principle<br />
</strong>Build only the infrastructure required to sell, deliver,
measure and scale RH Agentic Operations. Reuse the Instagram Growth
Automation already being developed; integrate with it rather than
rebuilding it.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 2. Scope: what must exist

| **Module**                | **Purpose**                                                              | **MVP?**                          |
|---------------------------|--------------------------------------------------------------------------|-----------------------------------|
| CRM + Sales Pipeline      | Track accounts, contacts, sources, reps, stages, values and next actions | Yes                               |
| Executive KPI Dashboard   | Measure funnel, revenue, margin, MRR, cycle and conversion               | Yes                               |
| Audit Engine              | Store discovery data, process inventory, scoring and ROI                 | Yes                               |
| Proposal / Opportunity    | Track recommended pilot/deployment, value and status                     | Yes                               |
| Delivery Tracker          | Track deployments, agent responsibilities, QA and before/after KPIs      | Yes                               |
| Case Study Metrics        | Turn delivery data into internal proof                                   | Yes                               |
| SOP / Playbook Library    | Reusable vertical assets, prompts, checklists and templates              | Phase 2                           |
| Commission / Rep Tracking | Attribute revenue and commissions to sellers/partners                    | Phase 2                           |
| Client Portal             | Client-facing audit, status and ROI access                               | Phase 3                           |
| AI Copilot                | Assist internal search/analysis across records                           | Phase 3; only after reliable data |

# 3. Existing system dependencies

| **Existing / parallel system**   | **Relationship to this PDR**                                                                                 |
|----------------------------------|--------------------------------------------------------------------------------------------------------------|
| Instagram Growth Automation v1   | Feeds leads, source, campaign, content/post and keyword into CRM. Remains a separate implementation project. |
| RH website / landing pages       | Create leads and purchases; should pass source/campaign metadata.                                            |
| Payment processor                | Confirms audit/product/deployment payments; integration can be manual in MVP then automated.                 |
| Calendar / meetings              | Fit calls and audit presentations; optional integration after MVP.                                           |
| Agent platforms / client systems | Delivery systems. The CRM stores metadata and outcomes; it does not replace them.                            |

# 4. Core data model

| **Entity**            | **Minimum fields / relationships**                                                                         |
|-----------------------|------------------------------------------------------------------------------------------------------------|
| Company               | Name, website, city/country, vertical, employee band, revenue band if known, owner, source, status         |
| Contact               | Name, role, email, phone, Instagram/LinkedIn, company, consent/status                                      |
| Lead / Opportunity    | Source, campaign, content, keyword, rep, stage, estimated value, next step, dates, loss reason             |
| Fit Call              | Date, qualification outcome, pain summary, audit recommended Y/N                                           |
| Audit                 | Price, paid date, owner, status, process count, overall score, deliverable link, presentation date         |
| Process               | Company, name, owner, frequency, volume, hours, cost, systems, risk, judgment level, classification, score |
| Agentic Opportunity   | Linked process, proposed responsibility, expected benefit, difficulty, risk, priority, projected ROI       |
| Proposal              | Type: pilot/deployment/retainer, amount, sent date, status, decision date                                  |
| Deployment            | Scope, start/end, team owner, agents, integrations, controls, status, hours, direct cost                   |
| Agent Role            | Responsibility, allowed/prohibited actions, approvals, escalation, tools, owner                            |
| KPI Baseline / Result | Metric, unit, baseline, target, post-deployment value, measurement window                                  |
| Retainer              | MRR, start date, services, active/paused/cancelled                                                         |
| Activity              | Call, email, DM, meeting, task, note, owner, timestamp                                                     |
| Rep / Partner         | Territory, role, commission rule, attributed opportunities and revenue                                     |

# 5. Sales pipeline

The CRM must use a fixed stage model so conversion metrics remain
comparable.

| **Stage**                | **Exit condition**                             |
|--------------------------|------------------------------------------------|
| New Lead                 | Owner assigned and next action defined         |
| Contacted                | First outreach completed                       |
| Fit Call Booked          | Meeting scheduled                              |
| Fit Qualified            | Audit recommended and commercial fit confirmed |
| Audit Offered            | Price/terms presented                          |
| Audit Paid               | Payment confirmed                              |
| Audit In Progress        | Discovery and mapping started                  |
| Audit Presented          | Client received findings                       |
| Proposal Sent            | Pilot/deployment/retainer proposal delivered   |
| Won — Pilot / Deployment | Implementation contracted                      |
| Won — Retainer           | Recurring optimization active                  |
| Lost / Nurture           | Loss reason mandatory or nurture date defined  |

# 6. CRM views

- Pipeline board by stage with opportunity value.

- Company/account view showing contacts, opportunities, audits,
  processes, deployments and KPIs.

- Rep view with assigned leads, next actions and conversion.

- Vertical view comparing Contractor, Beauty, Legal Admin, Dental Admin
  and future categories.

- Source/campaign view linking Instagram, organic, outbound, referral,
  partner and ads to revenue.

- Lost opportunities view with standardized loss reasons.

- Follow-up queue: overdue / today / next 7 days.

# 7. Executive dashboard

| **KPI**                  | **Definition / formula**                                              | **Filters**                             |
|--------------------------|-----------------------------------------------------------------------|-----------------------------------------|
| Leads                    | New qualified records created                                         | Source, campaign, rep, vertical, period |
| Fit-call rate            | Completed fit calls ÷ leads                                           | Same                                    |
| Paid audits              | Count + revenue of audits paid                                        | Source, rep, vertical                   |
| Audit conversion         | Paid audits ÷ qualified fit calls                                     | Source, rep, vertical                   |
| Audit → deployment       | Won pilot/deployment ÷ audits presented                               | Vertical, rep                           |
| Average deployment value | Won deployment revenue ÷ deployments                                  | Vertical, period                        |
| Sales cycle              | Median days lead → paid audit / deployment                            | Source, vertical                        |
| Delivery hours           | Actual internal hours by deployment                                   | Vertical, team                          |
| Gross margin             | (Revenue − direct delivery cost) ÷ revenue                            | Client, vertical                        |
| MRR                      | Active optimization/retainer monthly recurring revenue                | Vertical, cohort                        |
| CAC                      | Acquisition spend ÷ new paying clients                                | Channel/campaign once spend exists      |
| Win rate                 | Won opportunities ÷ decided opportunities                             | Rep, vertical, source                   |
| Reusable %               | Reusable delivery components ÷ total components or standardized proxy | Vertical                                |
| Client ROI               | Measured benefit ÷ implementation cost, when available                | Client, vertical                        |

# 8. Audit Engine v1

The Audit Engine converts discovery into structured, comparable data. It
should be usable by trained RH staff without needing a developer.

## Audit workflow

1.  Create or select company.

2.  Record business goals, team and systems.

3.  Create process inventory.

4.  For each process, capture frequency, volume, time, cost, inputs,
    outputs, tools, exceptions, human judgment and error consequence.

5.  Classify process: Human only / Automate / Agent-ready / Redesign
    first.

6.  Calculate Agentic Opportunity Score.

7.  Estimate expected value and time-to-value.

8.  Select recommended pilot.

9.  Generate audit summary and 90-day roadmap.

10. Present to client and create proposal from selected opportunity.

## Scoring dimensions

| **Dimension**             | **Scale**   | **Notes**                                      |
|---------------------------|-------------|------------------------------------------------|
| Economic impact           | 1–5         | Savings, capacity, revenue protection/recovery |
| Frequency / volume        | 1–5         | Higher volume increases leverage               |
| Repetitiveness            | 1–5         | Consistent steps favor delegation              |
| Data availability         | 1–5         | Digital and accessible data                    |
| Rule clarity              | 1–5         | Clear boundaries and expected outputs          |
| Human judgment required   | 1–5 inverse | High judgment reduces autonomy                 |
| Error consequence         | 1–5 inverse | High consequence requires stronger control     |
| Implementation difficulty | 1–5 inverse | Integrations, exceptions, system access        |
| Time-to-value             | 1–5         | Faster value ranks higher                      |

The exact weighting should remain configurable until real client data
shows which dimensions best predict successful deployment. v1 should
store raw component scores and a calculated total, not hard-code
business decisions that cannot be changed.

# 9. ROI engine

The ROI engine should make value transparent without pretending
precision. Every assumption must remain editable and visible.

| **Input**       | **Examples**                                                           |
|-----------------|------------------------------------------------------------------------|
| Current labor   | Hours/month, loaded hourly cost, number of people involved             |
| Revenue leakage | Unanswered leads, slow follow-up, missed appointments, stale estimates |
| Quality cost    | Errors, rework, backlog, escalation time                               |
| Future state    | Agent/platform cost, supervision time, expected recovered capacity     |
| Implementation  | One-time RH fee + client-side setup costs                              |
| Output          | Monthly value, payback period, annualized value, ROI range             |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>ROI rule<br />
</strong>Display ranges when assumptions are uncertain. Never present
model output as guaranteed savings or revenue. The platform should
preserve the assumptions that produced each estimate.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 10. Delivery Tracker

| **Section**    | **What must be tracked**                                |
|----------------|---------------------------------------------------------|
| Scope          | Processes included/excluded, contractual deliverables   |
| Agent roles    | Responsibility, tools, permissions, prohibited actions  |
| Human controls | Approval gates, escalation owner, exception rules       |
| Build          | Configuration/integration tasks and owners              |
| QA             | Test cases, passed/failed, evidence, rollback readiness |
| Launch         | Date, version, initial monitoring window                |
| Effort         | Internal hours and direct costs                         |
| Performance    | Baseline, target and actual metrics                     |
| Reusability    | Which assets became templates for future deployments    |

# 11. Case Study Metrics module

The platform should make case-study creation a byproduct of delivery
rather than a separate manual project.

- Store before-state narrative and baseline metrics.

- Store intervention summary and control model.

- Store after-state metrics by measurement window.

- Flag client approval status for public use.

- Generate an internal one-page case summary.

- Allow anonymized export later; public publishing is not part of MVP.

# 12. SOP / Playbook Library — Phase 2

The library is critical for scale but should follow the CRM/audit MVP.
Each vertical should contain versioned reusable assets.

| **Asset type**         | **Examples**                                         |
|------------------------|------------------------------------------------------|
| Discovery              | Questions, qualification checklist                   |
| Process maps           | Current-state / target-state patterns                |
| Agent roles            | Role cards, responsibilities, boundaries             |
| Prompts / instructions | Versioned system instructions and evaluation rubrics |
| Integrations           | Recipes, credentials requirements, test steps        |
| Controls               | Approval matrices and escalation patterns            |
| QA                     | Test cases and acceptance criteria                   |
| Commercial             | Proposal blocks, case studies, common objections     |

# 13. Integration requirements

| **Integration**             | **MVP behavior**                             | **Later behavior**                                        |
|-----------------------------|----------------------------------------------|-----------------------------------------------------------|
| Instagram Growth Automation | Receive lead + campaign/post/keyword/source  | Bi-directional status and attribution                     |
| Website forms               | Create lead and preserve UTM/source          | Personalized routing / scoring                            |
| Stripe or payment processor | Manual payment confirmation acceptable in v1 | Webhook creates paid audit / invoice status automatically |
| Calendar                    | Manual link acceptable                       | Sync fit calls and presentations                          |
| Email                       | Manual send acceptable                       | Log threads / templates                                   |
| Agent platforms             | Store links/metadata only                    | Selective telemetry where APIs justify it                 |
| Accounting                  | No MVP integration                           | Revenue/cost sync if needed                               |

# 14. Roles and permissions

| **Role**               | **Access**                                                                            |
|------------------------|---------------------------------------------------------------------------------------|
| Admin / Manager        | All companies, settings, financial KPIs, users, exports                               |
| Sales Rep              | Assigned leads/accounts, fit calls, audits/proposals, limited financial views         |
| Delivery               | Assigned clients, processes, deployments, agent roles, QA, metrics                    |
| Analyst / Auditor      | Audit data, scoring, process maps, ROI, reports                                       |
| Partner / External Rep | Only attributed opportunities and permitted status; no delivery/client-sensitive data |
| Read-only Executive    | Dashboard and selected account summaries                                              |

Permissions should be implemented at the data level where practical, not
only hidden in the user interface. Sensitive client information and
regulated-sector records should be minimized; the RH platform should
store what is necessary to run the engagement, not become a duplicate
system of record for client legal or health data.

# 15. Non-functional requirements

- Responsive web app; desktop-first but usable on mobile.

- Fast search across companies, contacts and opportunities.

- Audit trail for changes to pipeline, financial values and deployment
  status.

- Export to CSV for leads, pipeline and KPIs.

- Backups and documented recovery procedure.

- Environment separation: development/test vs production.

- Secure secrets management; no client credentials in plain text
  records.

- Reasonable role-based access controls.

- Data retention and deletion controls sufficient for normal business
  operations.

- All calculated metrics traceable to underlying records.

# 16. Recommended technical shape

Keep the implementation boring and maintainable. A conventional web
application with a relational database is sufficient. Suggested shape:
Postgres/Supabase for core data; a lightweight web UI for
CRM/audit/dashboard; API/webhooks for Instagram and future payment
integrations. The PDR intentionally does not require n8n, Grok Bot or
any agentic layer for core CRM logic.

An AI assistant may be added later for internal search, audit drafting
or pattern detection only after the underlying structured data and
permissions are reliable. Deterministic CRM actions should remain
deterministic.

# 17. MVP screens

11. Dashboard — KPI cards, funnel, revenue, vertical/source breakdowns
    and overdue follow-ups.

12. Pipeline — Kanban/list by stage with value, owner and next action.

13. Company / Account — 360° record with contacts, activities, audits,
    processes, proposals, deployments and KPIs.

14. Lead / Opportunity — source attribution, stage, value, dates, rep
    and loss reason.

15. Audit Workspace — discovery, process inventory, scores, ROI and
    recommended pilot.

16. Deployment — scope, agent roles, controls, tasks, QA, effort and
    performance.

17. Reports — conversion, sales cycle, margin, MRR, source/vertical/rep
    performance.

18. Settings — users/roles, stage definitions, scoring weights and basic
    reference data.

# 18. MVP acceptance criteria

- A lead from Instagram or manual entry can be attributed to a
  source/campaign and moved through the full sales pipeline.

- A paid audit can be created, assigned, completed and linked to
  multiple process records.

- Each process can be scored and classified, and a recommended pilot can
  be created from it.

- A proposal and deployment can be linked to the same account without
  duplicate data entry.

- Baseline and post-deployment metrics can be stored and compared.

- Dashboard metrics reconcile with underlying records.

- Lost reasons, next actions and overdue follow-ups are visible.

- Manager can filter performance by vertical, source, rep and time
  period.

- Delivery hours and direct costs can be recorded to estimate gross
  margin.

- Access permissions prevent external/limited roles from seeing
  unauthorized records.

# 19. Development roadmap

| **Phase**       | **Target**     | **Build**                                                                      |
|-----------------|----------------|--------------------------------------------------------------------------------|
| 0 · Alignment   | 1–2 days       | Data model, stages, KPI definitions, roles, integration contracts              |
| 1 · CRM MVP     | Week 1         | Companies, contacts, leads, pipeline, activities, attribution, basic dashboard |
| 2 · Audit / ROI | Week 2         | Process inventory, scoring, classification, ROI, audit status                  |
| 3 · Delivery    | Week 3         | Deployment tracker, agent roles, controls, QA, effort, before/after KPIs       |
| 4 · Analytics   | Week 4         | Conversion, margin, MRR, vertical/source/rep views, case-study summary         |
| 5 · Scale       | After real use | SOP library, commission tracking, payment/calendar integrations, client portal |

# 20. Explicit non-goals for v1

- Do not build a generic Salesforce/HubSpot replacement.

- Do not rebuild the Instagram comment-to-DM automation inside this app.

- Do not build a client-facing SaaS product.

- Do not embed a full AI agent just to move pipeline stages or calculate
  KPIs.

- Do not store unnecessary legal, clinical or other sensitive client
  records.

- Do not automate invoices, contracts, calendars and email before the
  core workflow works manually.

- Do not create complex project management beyond what is required to
  track deployment delivery.

# 21. Success criteria after 90 days

| **Outcome**           | **Evidence**                                                                     |
|-----------------------|----------------------------------------------------------------------------------|
| Commercial visibility | Every lead, audit, proposal, win/loss and source is in one system                |
| Audit repeatability   | Auditors use one structured process and comparable scoring                       |
| Delivery economics    | Actual hours, direct costs and gross margin visible by project                   |
| Proof generation      | Before/after results captured for real deployments                               |
| Management control    | Weekly KPI review can be done from dashboard without manual spreadsheet assembly |
| Scalability           | New reps and delivery staff can work from defined stages, fields and playbooks   |

# 22. Final product decision

The platform is an internal execution system for the business model, not
the business model itself. Development should begin only with the data
and workflows necessary to support real selling and delivery. The first
release is successful when RH can trace a lead from its original
campaign through a paid audit, implementation, margin and client ROI
using one coherent system.
