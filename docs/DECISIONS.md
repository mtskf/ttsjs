# Decision Records

## ADR 001: Rewrite to Node.js

### Status
Accepted

### Context
The original TTS tool was written in Python. While functional, the team's primary expertise and the surrounding ecosystem for this project are increasingly centering on Node.js. Additionally, unifying the toolchain reduces context switching and simplifies dependency management (npm vs pip/venv).

### Decision
Rewrite the entire CLI tool in Node.js, utilizing:
- `openai` SDK for Node.js
- `js-tiktoken` for tokenization
- `ffmpeg` via `child_process`

### Consequences
- **Positive**:
    - Easier installation via `npm install` and `npm link`.
    - Single language stack (JavaScript/TypeScript).
- **Negative**:
    - Migration effort (completed).
    - Loss of Python-specific libraries/features (none critical identified).
