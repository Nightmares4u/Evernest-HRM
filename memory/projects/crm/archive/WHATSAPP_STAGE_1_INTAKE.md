# WhatsApp Stage 1 Intake

## Stage 1 Goal

Design the first operational CRM pipeline from WhatsApp message to assigned human follow-up.

Stage 1 ends at:

Raw WhatsApp message -> structured intake -> parsed lead details -> assigned branch/agent -> human follow-up.

Stage 1 does not include client portal, invoices, university database, commissions, payroll integration, full Meta spend sync, or advanced KPI implementation.

## Core Principle

Raw message is not the same as a qualified lead.

Separate:

- Raw WhatsApp intake
- CRM lead
- Converted client/case

This prevents the CRM from being polluted by random messages such as "hi", "details?", spam, duplicates, and low-intent chats.

## Multiple-Number Strategy

EN should not collapse all campaigns into one generic WhatsApp number yet.

Preferred Stage 1 model:

- Keep multiple campaign/product WhatsApp numbers.
- Connect only 2-3 high-value numbers first.
- Preserve number-level attribution.
- Map each incoming number to product, branch, team, or campaign.
- Assign internally to employees while the customer continues seeing the company/campaign number.

Initial candidate number categories:

1. Italy / study visa number
2. Korea number
3. B2B partner number

The final first numbers should be confirmed before implementation.

## Why Not Employee Personal Numbers

Employees should not use personal WhatsApp numbers as the main CRM channel.

Preferred model:

- Customer messages company/campaign number.
- CRM receives the message.
- CRM assigns lead internally to an employee.
- Later, employee replies can happen inside CRM using the company/campaign number.
- CRM records which employee sent the reply.

This protects attribution, ownership, continuity, and management visibility.

## Full Stage 1 Flow

### 1. Meta Ad Opens WhatsApp

Lead clicks a Meta ad and messages a campaign-specific WhatsApp number.

Capture:

- Lead phone number
- Incoming WhatsApp number
- Timestamp
- First message
- Source channel
- Campaign/source mapping if known
- Raw webhook payload

Create:

- Raw inbox item
- Message history entry

Do not immediately create a fully qualified lead.

### 2. Raw Intake Record

Create a lightweight raw intake record.

Suggested raw intake statuses:

- `raw_new`
- `awaiting_details`
- `details_received`
- `needs_review`
- `qualified`
- `spam_duplicate`

Purpose:

- Keep raw WhatsApp traffic separate from qualified CRM leads.
- Preserve message history.
- Give managers/staff a review queue.
- Avoid polluting sales pipeline metrics.

### 3. Greeting and Structured Info Request

The system may send a light, human-style greeting. It should not sell, counsel, or behave like a heavy chatbot.

Recommended initial message:

```text
Assalamualaikum, welcome to EverNest Consultants.

Please send these details so our counselor can guide you:

1. Country interested:
2. Last qualification:
3. Marks/CGPA:
4. Study gap:
5. City:
6. Budget range:
7. English test: Yes/No
```

Tone requirements:

- Simple
- Human
- Short enough for WhatsApp
- Not aggressive
- Not a formal web form
- Not a sales pitch

Possible future variants:

- Italy-specific greeting
- Korea-specific greeting
- B2B partner greeting
- Outside-office-hours greeting

### 4. Lead Replies With Details

Example reply:

```text
1 Italy
2 BSCS
3 3.1 CGPA
4 2 years
5 Lahore
6 25 lac
7 no IELTS
```

Store:

- Full reply text
- Timestamp
- Message payload
- Associated raw inbox item
- Associated lead shell if already created

### 5. Parsing and Extraction

Use a cheap structured parser first.

Parser should detect:

- Numbered answers
- Country interest
- Last qualification
- Marks/CGPA
- Study gap
- City
- Budget range
- English test status

Parser should return:

- Extracted fields
- Confidence score
- Missing fields
- Warnings

If parser confidence is high:

- Update raw inbox item.
- Create or update CRM lead shell.
- Continue to assignment.

If parser confidence is medium:

- Update whatever fields are confident.
- Mark missing/unclear fields.
- Send to manual review or ask one simple clarification.

If parser confidence is low:

- Send to manual review queue.
- Optionally use Gemini only if conditions match the fallback policy.

## Gemini Fallback Policy

Gemini should not run on every message.

Use Gemini only when:

- Reply is messy or unstructured.
- Rule-based parser confidence is low.
- Lead appears high-value.
- Agent manually asks to extract or summarize.

Do not use Gemini for:

- Every "hi" or "details?" message.
- Every structured numbered reply.
- Spam/duplicate messages.
- Low-quality chats without enough signal.

The default should be cheap parser first, manual review second, Gemini selectively third.

## Assignment Rules

Use rule-based assignment first.

Assignment inputs:

- Incoming WhatsApp number
- Campaign/product mapping
- City
- Country/product interest
- B2B versus B2C
- Branch ownership
- Agent workload
- Agent availability
- Lead quality

Example rules:

- Incoming number = Italy Lahore number -> product Italy, branch Lahore
- Incoming number = Korea number -> product Korea, branch/team Korea
- Incoming number = B2B number -> category B2B, assign B2B handler
- City = Lahore/Punjab -> Lahore branch
- City = Karachi/Sindh -> Karachi branch
- Hot/high-budget lead -> branch manager/closer
- Unknown/low-confidence -> unassigned review queue

Required assignment capabilities:

- Auto-assignment
- Manual reassignment
- Assignment history
- Reason for assignment/reassignment
- No disappearing leads

## Agent Lead Board

After assignment, the agent dashboard should show:

- New assigned leads
- Lead source
- Incoming WhatsApp number/source
- Campaign/source mapping
- Extracted details
- Lead quality
- Next required action
- Follow-up due date
- Message history snapshot

## Human Handoff

After structured details are captured and assignment is complete:

- Human counselor/agent contacts the lead.
- CRM tracks lead status, notes, follow-ups, and outcome.
- Later stages can add documents, invoice/payment, application tracking, and case conversion.

## Data Captured By Step

### Meta/WhatsApp Entry

- Customer phone
- Company WhatsApp number
- First message
- Timestamp
- Source channel
- Raw webhook payload
- Campaign mapping if known

### Raw Inbox

- Raw intake status
- Duplicate/spam review status
- Message count
- Last message timestamp
- Parser status
- Confidence score

### Structured Intake

- Country interest
- Qualification
- Marks/CGPA
- Study gap
- City
- Budget range
- English test
- Missing fields

### Assignment

- Branch
- Agent
- Rule matched
- Assignment reason
- Assigned by
- Assigned at

### Human Follow-Up

- Lead status
- Next action
- Follow-up due date
- Notes
- Activity history

## Failure Cases

### Duplicate Phone

If customer phone already exists:

- Link message to existing raw inbox or lead.
- Mark new raw item as duplicate if needed.
- Alert assigned owner if lead is active.

### Unknown Campaign

If campaign mapping is missing:

- Use incoming WhatsApp number mapping.
- If number mapping is also missing, place in central review queue.

### Weak Message

If message is only "hi", "details", or similar:

- Send greeting/details request.
- Keep status `awaiting_details`.
- Do not create qualified lead metrics.

### Messy Reply

If parser confidence is low:

- Mark `needs_review`.
- Optionally use Gemini if high-value or manually requested.

### No Reply After Greeting

If no reply after configured time:

- Keep raw inbox item.
- Mark follow-up opportunity if desired.
- Avoid over-messaging.

### API/Webhook Failure

If webhook fails:

- Retry where supported.
- Preserve raw event logs.
- Show integration health warnings later.

### Assignment Failure

If no rule matches or no agent is available:

- Put lead in unassigned review queue.
- Notify branch manager or central reviewer.

## MVP Boundaries

Stage 1 includes:

- Manual WhatsApp number/campaign mapping
- Raw inbox
- Greeting template
- Structured reply parser
- Parser confidence scoring
- Manual review queue
- Rule-based assignment
- Assignment history
- Agent lead board
- Testing with one number first, then 2-3 numbers

Stage 1 excludes:

- Full AI chatbot
- Full Meta spend sync
- Client portal
- Invoice system
- University database
- Commission/payroll integration
- Advanced reporting
- Automated counseling
- Routing chats to employee personal numbers by default

