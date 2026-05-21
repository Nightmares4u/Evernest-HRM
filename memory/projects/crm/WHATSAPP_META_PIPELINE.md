# WhatsApp and Meta Pipeline

## Pipeline Principle

EN Consultants should remain WhatsApp-first. Meta ads should continue to land users in WhatsApp where that behavior produces better volume and lower friction.

The CRM should capture, normalize, and report on WhatsApp conversations without forcing every lead through a Western-style form funnel.

## Current Lead Path

1. Meta campaign runs.
2. User clicks the ad.
3. Ad opens WhatsApp.
4. User messages one of several WhatsApp business numbers.
5. Staff responds inside WhatsApp.
6. CRM must capture or receive enough data to create a structured lead.
7. Lead is assigned, followed up, converted, or marked dead/spam.

## Data To Preserve

At the moment a WhatsApp lead enters CRM, preserve:

- WhatsApp phone number receiving the message
- Lead phone number
- Lead name if available
- First message text
- First message timestamp
- Campaign if known
- Ad set if known
- Ad if known
- Product/country intent if inferable
- Source platform
- Branch mapping if known
- Raw inbound payload if available

## Campaign Attribution Challenge

When Meta ads land directly on WhatsApp, attribution can be incomplete unless the campaign uses trackable setup.

Potential attribution inputs:

- Dedicated WhatsApp number per campaign
- Click-to-WhatsApp ad metadata
- Message referral metadata from WhatsApp Cloud API
- Manual campaign mapping table
- CSV imports from Meta Ads Manager
- UTM-like campaign labels in ad opening message
- Staff-selected campaign source in CRM

## MVP Capture Strategy

Phase 1 should avoid full WhatsApp API dependency.

Recommended MVP:

1. Create campaign and WhatsApp number mapping tables.
2. Allow manual lead creation from WhatsApp conversation.
3. Allow CSV import for lead lists or campaign exports.
4. Store first message and source fields where staff can enter them.
5. Build a WhatsApp inbox scaffold in the data model without promising full sync.
6. Add duplicate detection by phone.

## Post-MVP WhatsApp API Strategy

Evaluate:

- Meta WhatsApp Cloud API
- WhatsApp Business API via BSP
- Multi-number management
- Webhooks
- Message templates
- Session windows
- Conversation costs
- Rate limits
- Media/document handling
- Staff inbox workflow
- Compliance and opt-in requirements

## Controlled Triage

Previous CRM/WhatsApp/AI attempts were clogged by chatty low-quality leads. The new CRM should avoid uncontrolled automation.

Initial triage should be structured and human-controlled:

- Capture inbound message.
- Mark as possible new lead.
- Detect duplicate phone.
- Assign source and product if clear.
- Route to branch or queue.
- Let staff qualify.
- Avoid AI replies until volume, quality, and guardrails are understood.

## Lead Inbox States

Suggested WhatsApp inbox states:

- `raw_unreviewed`
- `possible_lead`
- `duplicate`
- `spam`
- `converted_to_lead`
- `linked_to_existing_lead`
- `ignored`

## WhatsApp Number Mapping

Each WhatsApp number should have:

- Number label
- Branch owner
- Product/country focus
- Active/inactive status
- Campaign association if dedicated
- Default assignment queue
- Notes

## Meta Campaign Data Strategy

MVP:

- Manual campaign creation.
- Manual spend entry.
- CSV import if needed.
- Campaign-to-number mapping.

Later:

- Meta Marketing API sync.
- Campaign, ad set, and ad spend import.
- Click-to-WhatsApp conversation matching.
- ROI dashboards.

