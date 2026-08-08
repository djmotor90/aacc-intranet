# Super Agent memory (Hermes / OpenClaw–aligned)

**Status:** implemented (phases 1–3).  
**Goal:** memory is **not** chat. Chat is chat. Memory is small, curated, and token-bounded.

## Layers

| Layer | Store | Injected every turn? | Purpose |
|-------|--------|----------------------|---------|
| **Hot USER** | `agent_memories` kind=`preference` (per user) | Yes, capped (~1.3k chars) | Tone, format prefs, pet peeves |
| **Hot AGENT** | kinds=`fact`, `intelligence` (shared) | Yes, capped (~2.2k chars) | Durable decisions, lessons |
| **Hot PROCEDURE** | kind=`procedure` (shared) | Yes, capped (~1.5k chars) | “When X, do Y” flows / commands |
| **Conversation window** | `chat_messages` | Last **N** raw turns only | Immediate coherence |
| **Conversation summary** | `chat_conversations.context_summary` | Yes if older turns exist | Continuity without replaying chat |
| **Cold knowledge** | linked Docs | Tool / knowledge block | Domain content |
| **Chat transcript** | `chat_messages` | **Never** as “memory rows” | Source of truth for history UI |

## Rules

1. **Do not** write `User:… / Agent:…` clones into `agent_memories` (old `recent` kind is retired).
2. **Declarative** memory only: preferences, facts, procedures — not session novels.
3. **Hard char budgets** force consolidation; overflow rejects or drops lowest importance.
4. **Hot memory is frozen for the LLM call** (loaded once per turn from DB with caps; mid-turn saves apply on the *next* turn).
5. **Procedures** are commands/flows on the prompt (“when morning brief → list overdue…”), not chat logs.
6. **Summary + short window** replace long raw history for token savings.

## Caps (defaults)

| Block | Cap (chars) |
|-------|-------------|
| USER preferences | 1_375 |
| AGENT facts + intelligence | 2_200 |
| PROCEDURES | 1_500 |
| Conversation summary | 1_200 |
| Raw history window | 6 messages |

## Write path

- Owner/admin: `memory.save` tool → `preference` \| `fact` \| `intelligence` \| `procedure`.
- Background intelligence extract: durable prefs/facts only (never chat dumps).
- After each agent reply: roll `context_summary` from turns that fell out of the window.

## Implemented follow-ups

- **conversation.search** — cold ILIKE search over past DMs; injected when the user message looks like recall intent (`looksLikeRecallIntent`).
- **Memory management UI** — add / edit / delete / filter / clear hot memory on the agent Memory tab.

## Out of scope (later)

- Vector / semantic memory providers.
- Human approval gate for memory writes.
- Dedicated playbook builder beyond free-form procedure entries.
