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

After installing globally or linking:

```bash
tts your_text_file.txt
```

### Local Execution

```bash
node tts.js your_text_file.txt
```

Example:

```bash
tts data/article.txt
```

This will generate the final merged output in the same directory as the input file:

- `data/article_merged.mp3`

## Global Installation (Development)

To run the `tts` command globally from this source:

```bash
npm link
```

This symlinks the local package to your global `node_modules`.

## Configuration

You can modify settings in `tts.js` (TTSConfig class):

- `model`: Default "gpt-4o-mini-tts"
- `voice`: Default "alloy"
- `tokenLimit`: Default 1600

## License

MIT License
