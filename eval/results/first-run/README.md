# First results (saved before any tuning)

Saved 15 Nov 2026, before any change to the matcher weights, the reader prompt or the labels.
If these cases inform tuning, report later scores as tuned, and use a fresh holdout for an unbiased final score.

- `2026-11-15-rules-reader.md`: `npm run eval` (confirmed fields and the local rules reader), both sets.
- `2026-11-15-openai-gpt-6-luna.md`: `npm run eval:live`, run by Jay on his Mac, 15 Nov 2026 02:18 UTC.
  Model `gpt-6-luna`, reasoning effort `low`. Both sets went through OpenAI, with 0 failed calls and no rules fallback (the eval calls the model directly).
