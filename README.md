# GPT-TTS - GPT-4o Text-to-Speech (TTS) Tool

This Node.js script converts long text files into high-quality MP3 audio using OpenAI's `gpt-4o-mini-tts` model. It automatically splits the input text based on token limits, synthesizes audio for each segment, and merges the segments into one seamless output file.

## Features

- **Smart Text Splitting**: Automatically splits large text inputs into token-safe segments
- **Expressive Narration**: Uses warm, clear, engaging tone suitable for educational purposes
- **Automatic Audio Merging**: Seamlessly combines audio segments using `ffmpeg`
- **Robust Error Handling**: Automatic retry functionality for API failures
- **Security Features**: File path validation and access control
- **Safe Output Location**: Generated MP3 files are saved in the same directory as the input file
- **Clean Temporary Files**: Automatic cleanup of temporary files after processing

## Requirements

- Node.js 18+
- ffmpeg (must be installed and accessible via command line)
- OpenAI API key

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file with your OpenAI API key:

```
OPENAI_API_KEY=your_openai_api_key_here
```

## Usage

### Global Execution (Recommended)

```bash
tts your_text_file.txt [options]
```

### Options

| Option | Alias | Description | Default |
|Params|---|---|---|
| `--model` | `-m` | OpenAI model | `gpt-4o-mini-tts` |
| `--voice` | `-v` | Voice (alloy, echo, fable, onyx, nova, shimmer) | `alloy` |
| `--parallel` | `-p` | Concurrent request limit | `5` |
| `--speed` | `-s` | Audio speed (0.25 to 4.0) | `1.0` |
| `--help` | `-h` | Show help | |

### Local Execution

```bash
node tts.js your_text_file.txt -m gpt-4 -v echo
```

## Configuration

Settings are loaded in the following priority:
1. **CLI Arguments**
2. **`tts-config.json`** (in current directory)
3. **Environment Variables** (`OPENAI_API_KEY`)
4. **Defaults**

### `tts-config.json` Example

```json
{
  "model": "gpt-4",
  "voice": "nova",
  "tokenLimit": 2000,
  "parallel": 10,
  "speed": 1.25
}
```

## License

MIT License
