---
name: claude-crm
description: Operate this repository's plain-text CRM when the user wants to add or update a lead, log client activity, change a pipeline stage, schedule or check follow-ups, review a client or pipeline, or capture lessons from a lost deal.
---

# Plain-text CRM

Read [the complete CRM workflow](../../../SKILL.md) before acting on a CRM request and follow it.
Resolve its `crm.mjs`, `README.md`, and vault paths from the repository root, regardless of the
current working directory. Route every record mutation through `crm.mjs`; do not hand-edit client
records.
