# GPT-TTS - GPT-4o Text-to-Speech (TTS) Tool

This Python script converts long text files into high-quality MP3 audio using OpenAI's `gpt-4o-mini-tts` model. It automatically splits the input text based on token limits, synthesizes audio for each segment, and merges the segments into one seamless output file.

## Features

- **Smart Text Splitting**: Automatically splits large text inputs into token-safe segments
- **Expressive Narration**: Uses warm, clear, engaging tone suitable for educational purposes
- **Automatic Audio Merging**: Seamlessly combines audio segments using `ffmpeg`
- **Robust Error Handling**: Automatic retry functionality for API failures with exponential backoff
- **Security Features**: File path validation and access control to prevent security vulnerabilities
- **Safe Output Location**: Generated MP3 files are saved in the same directory as the input file
- **Clean Temporary Files**: Automatic cleanup of temporary files after processing
- **Comprehensive Validation**: Input file encoding, size, and permission checks

## Security Features

- **Path Traversal Protection**: Prevents access to files outside the user's home directory
- **File Size Limits**: Restricts processing to files under 100MB
- **Permission Checks**: Validates read permissions before processing
- **Input Validation**: Checks for UTF-8 encoding and non-empty files

## Requirements

- Python 3.8+
- ffmpeg (must be installed and accessible via command line)
- OpenAI API key

Create a virtual environment and activate it:

```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install openai python-dotenv tiktoken
```

## Usage

```bash
python tts.py your_text_file.txt
```

Example:

```bash
python tts.py data/article.txt
```

This will generate the final merged output in the same directory as the input file:

- `data/article_merged.mp3` — the final merged audio file

**Note**: Individual segment files (`article_part1.mp3`, `article_part2.mp3`, etc.) are automatically deleted after merging.

## Environment Variables

Create a `.env` file with the following content:

```
OPENAI_API_KEY=your_openai_api_key_here
```

## Configuration

You can modify the following settings in `tts.py`:

- `VOICE`: Default is "nova" (OpenAI voice options: alloy, echo, fable, onyx, nova, shimmer)
- `TOKEN_LIMIT`: Maximum tokens per segment (default: 2000)
- `MAX_RETRIES`: Number of retry attempts for API failures (default: 3)
- `RETRY_DELAY`: Base delay between retries in seconds (default: 2)

## Error Handling

The script includes robust error handling for common issues:

- **API Failures**: Automatic retry with exponential backoff (2s, 4s, 6s delays)
- **Network Issues**: Graceful handling of temporary connectivity problems
- **File System Errors**: Comprehensive validation and error reporting
- **Encoding Issues**: Detection and reporting of non-UTF-8 files
- **FFmpeg Errors**: Clear error messages for audio processing failures

## File Security

For security reasons, the script only processes files that:

- Are located within your home directory
- Have read permissions
- Are smaller than 100MB
- Are encoded in UTF-8
- Do not contain path traversal attempts (`..`)

## Output

The generated MP3 files feature:

- High-quality audio optimized for speech
- Natural pacing with gentle variation in pitch
- Thoughtful delivery suitable for educational content
- Seamless transitions between text segments

## Troubleshooting

**API Key Issues**:

```bash
❌ OPENAI_API_KEY environment variable is not set.
```

Solution: Ensure your `.env` file contains a valid OpenAI API key.

**FFmpeg Not Found**:

```bash
❌ FFmpeg not found. Please install FFmpeg.
```

Solution: Install ffmpeg using your system's package manager (e.g., `brew install ffmpeg` on macOS).

**File Access Denied**:

```bash
❌ ファイルパス検証エラー: ファイルはホームディレクトリ以下にある必要があります
```

Solution: Move your text file to a location within your home directory.

**Large File Warning**:

```bash
❌ ファイルサイズが大きすぎます（制限: 100MB）
```

Solution: Split your text file into smaller chunks before processing.

## License

MIT License
