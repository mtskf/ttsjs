# Architecture

## System Overview
`tts-js` converts text to audio using OpenAI API. It handles token splitting, parallel synthesis, and audio merging.

## Data Flow
```mermaid
graph TD
    A[Input] -->|Validate| B(FileValidator)
    B -->|Tokenize| C(TextProcessor)
    C -->|Split| D[Segments]
    D -->|Parallel Req| E(AudioSynthesizer)
    E -->|OpenAI| F[API]
    F -->|MP3| E
    E -->|Save| G[Parts]
    G -->|Merge (ffmpeg)| H[Output]
    H -->|Cleanup| I[Done]
```

## Internal Components
- **`TTSConfig`**: Manages env vars (`OPENAI_API_KEY`) and CLI options.
- **`FileValidator`**: Enforces path safety (jailbreak check), existence, and size limits.
- **`TextProcessor`**: Splits text using `js-tiktoken` to respect model token limits.
- **`AudioSynthesizer`**: Handles API calls with exponential backoff retry logic.
- **`AudioMerger`**: Concatenates MP3 segments using `ffmpeg` (`-c copy`).
- **`TTSProcessor`**: Main orchestrator.

## Directory Structure
- `tts.js`: Entry point.
- `data/`: Working directory for inputs/outputs.
- `.agent/`: Agent workflows.
- `docs/`: Project documentation.