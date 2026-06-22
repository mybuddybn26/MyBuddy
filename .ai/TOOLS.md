# TOOLS.md — Buddy AI Tool/Function Calling Architecture

> **Tool system specification for Buddy.**
> Currently a design document — structured tool calling is not yet implemented.
> The current "budget" and "transaction" extraction uses text-pattern regex, not true function calling.

---

## 1. Tool Philosophy

Buddy's tools should transform the AI from a **passive responder** into an **active assistant** that can understand, decide, act, and verify.

- **Understand** — recognize when a tool is the right response.
- **Decide** — select the correct tool with the right parameters.
- **Act** — execute the tool safely, respecting permissions.
- **Verify** — confirm the result before presenting it to the user.

Tools should make Buddy useful, not just impressive. Every tool must have a clear purpose and safety boundary.

---

## 2. Current Tool Status

### What Exists (Text-Pattern Extraction, NOT Tool Calling)
- **Budget creation**: AI returns ` ```budget ``` ` JSON block → backend regex-parses and inserts into `budgets` table.
- **Transaction recording**: AI returns ` ```transaction ``` ` JSON block → regex-parsed and inserted into `transactions` table.
- **Document analysis**: Dedicated `analyzeImage()` function called directly from route handler.
- **AI budget editing**: `POST /api/budgets/:id/ai-edit` — sends user prompt through `streamChat(..., 'financial')`, parses ` ```proposal ``` ` block.

### What Does NOT Exist
- Structured function/tool calling (OpenAI-style or Anthropic-style tool use).
- AI-initiated API calls based on user intent.
- Permission system for tool execution.
- Tool result feedback loop into conversation.

---

## 3. Tool Architecture (FUTURE)

```
User Request ("Make me a weekly food budget")
    ↓
Buddy AI (DeepSeek with function calling enabled)
    ↓
Tool Selection (AI chooses: create_budget)
    ↓
Permission Check (WRITE tool → requires confirmation)
    ↓
Tool Execution (validates input, calls POST /api/budgets)
    ↓
Result Returned ({ id: "...", title: "Weekly Food Budget", ... })
    ↓
Buddy Response ("I've created a budget for you. Here it is: [display]")
```

### Prompt Integration
```
System: You are Buddy.
System: Available tools:
- create_budget(title, period, items) — Creates a new budget.
- create_transaction(type, amount, description, category) — Records a sale or expense.
- search_documents(query) — Finds user's documents.
...
User: Make me a $100 weekly food budget.
```

---

## 4. Tool Categories

### Memory Tools
| Tool | Purpose | Permission |
|---|---|---|
| `memory.search` | Find relevant memories for context | READ |
| `memory.create` | Save a new memory | WRITE |
| `memory.update` | Modify an existing memory | WRITE |
| `memory.delete` | Remove a memory | WRITE |

### Document Tools
| Tool | Purpose | Permission |
|---|---|---|
| `document.search` | Find documents by type or content | READ |
| `document.summarize` | Get AI summary of a document | READ |
| `document.analyze` | Analyze a new document image | WRITE |

### Finance Tools
| Tool | Purpose | Permission |
|---|---|---|
| `transaction.search` | Query transactions by date/type/category | READ |
| `transaction.create` | Record a new transaction | WRITE |
| `budget.create` | Create a new budget | WRITE |
| `budget.update` | Modify a budget | WRITE |
| `budget.analyze` | Get AI analysis of spending | READ |

### User Tools
| Tool | Purpose | Permission |
|---|---|---|
| `settings.get` | Read user settings | READ |
| `settings.update` | Modify user settings | WRITE |

### Future Productivity Tools
| Tool | Purpose | Permission |
|---|---|---|
| `calendar.create_event` | Schedule an event | WRITE |
| `calendar.search` | Find upcoming events | READ |
| `tasks.create` | Create a task/reminder | WRITE |
| `email.search` | Search recent emails | READ |

---

## 5. Tool Definition Standard

Every tool must define:

```typescript
interface Tool {
  name: string;           // e.g. "budget.create"
  description: string;    // What it does, when to use it
  inputSchema: object;    // JSON Schema for parameters
  outputSchema: object;   // Expected return shape
  permission: 'READ' | 'WRITE' | 'EXTERNAL';
  handler: (params: unknown, userId: string) => Promise<unknown>;
  errors: Record<string, string>;  // Error codes → user messages
}
```

---

## 6. Permission System

| Level | Description | Behavior |
|---|---|---|
| **READ** | Retrieve information only | Auto-execute — no confirmation needed |
| **WRITE** | Modify user data | Require user confirmation before execution |
| **EXTERNAL** | Contact outside services | Require explicit user approval per-action |

### Confirmation Flow (WRITE tools)
```
Buddy: "I'll create a $100 weekly food budget. Confirm?"
User: "Yes" / "Go ahead" / Click confirm button
→ Tool executes
Buddy: "Done! Here's your budget: [display]"
```

---

## 7. Tool Safety

**The AI must NOT:**
- Delete data without user confirmation.
- Spend money or trigger payments.
- Expose private data to other users.
- Modify important system settings silently.
- Bypass the permission system.

**Implementation safeguards:**
- All WRITE tools require confirmation before execution.
- Tool parameters validated server-side (never trust AI-generated arguments).
- Rate-limited: max 5 tool calls per conversation turn.
- All tool executions logged for audit.

---

## 8. Tool + Memory Integration

Memory enhances tool usage:

```
Memory: User tracks weekly budget for food stall.
User: "How's my budget looking?"
Buddy: [retrieves memory] → [selects budget.analyze tool] → "You've spent 60% of this week's budget..."
```

Memories can suggest the right tool and provide default parameters (e.g., "User always uses weekly period").

---

## 9. Tool + Voice Integration

Voice mode can use tools with spoken confirmation:

```
User: "Add a sale for $20, kuih."
Buddy: [understands] → [selects transaction.create] → "I'll record a sale of $20 for kuih. Confirm?"
User: "Yes."
Buddy: [executes] → "Recorded. Your balance is updated."
```

---

## 10. Tool Error Handling

Tools must return structured results:

```typescript
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;       // e.g. "VALIDATION_ERROR"
    message: string;    // Human-readable
    recovery?: string;  // Suggested fix
  };
}
```

Buddy explains failures naturally: "I couldn't create that budget because the amount wasn't valid. Want to try again with a specific number?"

---

## 11. Tool Logging

Every tool execution logged:

| Field | Purpose |
|---|---|
| `tool_name` | Which tool was called |
| `user_id` | Who called it |
| `timestamp` | When |
| `success` | Outcome |
| `error_code` | If failed |

Never log: tool parameters containing PII, financial amounts in plaintext.

---

## 12. Adding New Tools

1. **Define**: Create tool definition with schema, permissions, handler.
2. **Register**: Add to tool registry (future `fastify/src/ai/tools/`).
3. **Update prompt**: Add tool description to system prompt function list.
4. **Add tests**: Unit test the handler; integration test the AI's tool selection.
5. **Document**: Update TOOLS.md (this file).

---

## 13. Tool Anti-Patterns

**Do NOT:**
- Give AI direct database access — always go through validated service layer.
- Skip input validation — AI can hallucinate parameters.
- Create invisible actions — user must be aware of what tools did.
- Duplicate tool functionality — one tool per capability.
- Trust AI-generated arguments without server-side validation.

---

## 14. Tool Roadmap

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Internal tools: budget.create, transaction.create, document.analyze | PLANNED |
| **Phase 2** | Memory tools: memory.search, memory.create, memory.delete | PLANNED |
| **Phase 3** | Productivity: calendar, reminders, tasks | FUTURE |
| **Phase 4** | External integrations: email, third-party APIs | FUTURE |

---

## 15. Tool Completion Checklist

Before releasing any tool:

- [ ] Schema defined (input/output types)
- [ ] Permission level assigned (READ/WRITE/EXTERNAL)
- [ ] Server-side validation implemented
- [ ] Confirmation flow for WRITE tools
- [ ] Error handling with recovery suggestions
- [ ] Tool execution logged
- [ ] AI prompt updated with tool description
- [ ] Tests written (unit + integration)
- [ ] Security reviewed
- [ ] TOOLS.md updated
