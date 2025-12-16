# Decision Records

## ADR 001: Rewrite to Node.js (Accepted)
**Context**: Team expertise and ecosystem shifted to Node.js.
**Decision**: Rewrite `tts.py` to `tts.js` using `openai` SDK and `p-limit`.
**Consequences**: Unified stack (JS), easier distribution (`npm link`).
