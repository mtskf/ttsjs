# Architecture Overview


## Implementation Stack

- **Runtime**: Node.js (v18+)
- **Language**: JavaScript (ESM)
- **Core Dependencies**:
    - `openai`: For Text-to-Speech API
    - `js-tiktoken`: For token counting to handle API limits
    - `dotenv`: For configuration
- **External Dependencies**:
    - `ffmpeg`: For merging audio segments

## Key Components

- **TTSConfig**: Manages environment variables and configuration.
- **FileValidator**: Ensures file safety (path traversal prevention, size limits, permissions).
- **TextProcessor**: Splits text into token-safe chunks using `cl100k_base` encoding.
- **AudioSynthesizer**: interact with OpenAI API, handles rate limits and retries.
- **AudioMerger**: Invokes FFmpeg to concatenate audio segments.
- **Main**: Orchestrates the pipeline and CLI interaction.