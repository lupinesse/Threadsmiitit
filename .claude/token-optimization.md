# Token optimisation guidelines

- **Compact at ~60% context**: run `/compact` with a scope note before the window fills.
  Format: `/compact Working on: X | Unresolved: Y | Agreed: Z | Next: W`
- **Clear between unrelated domains**: `/clear` when switching to a completely different task.
- **Patches, not rewrites**: when editing, send only the changed sections — not entire files.
- **Skills over conversation**: use skills (`/pr-review`, `/dead-code`, etc.) to offload
  structured work into a fresh context rather than accumulating results inline.
- **Structured prompts**: ask for lists or JSON output rather than prose when you need
  to process results programmatically.
