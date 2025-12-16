import openai
import os
import sys
import tiktoken
import re
from pathlib import Path
from dotenv import load_dotenv
import subprocess
import time
from typing import List, Tuple, Optional


class TTSConfig:
    """Configuration class for TTS settings"""

    def __init__(self):
        load_dotenv()
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = "gpt-4o-mini-tts"
        self.voice = "alloy"
        self.response_format = "mp3"
        self.token_limit = 1600
        self.max_retries = 3
        self.retry_delay = 2
        self.max_file_size = 100 * 1024 * 1024  # 100MB

        self.instructions = (
            "Speak with a warm, clear, and engaging tone suitable for educational narration in both Japanese and English. "
            "Use natural pacing with gentle emphasis on key points. "
            "For Japanese text: pronounce each character clearly with proper pitch accent and natural rhythm. "
            "For English in Japanese context: maintain clear pronunciation while flowing naturally. "
            "Add appropriate pauses at punctuation marks and between sentences for comprehension. "
            "Maintain consistent energy and deliver as a friendly, knowledgeable tutor."
        )

        # Initialize OpenAI API
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        openai.api_key = self.api_key


class FileValidator:
    """File validation utilities"""

    @staticmethod
    def validate_path(file_path: str) -> Tuple[bool, str]:
        """Validate the safety and accessibility of the file path"""
        try:
            path = Path(file_path).resolve()

            # Prevent path traversal attacks
            if ".." in str(path):
                return False, "Path contains '..' (potential path traversal attack)"

            # Check if absolute path is within safe range
            home_dir = Path.home()
            try:
                path.relative_to(home_dir)
            except ValueError:
                return False, f"File must be located under home directory ({home_dir})"

            # Check file existence and type
            if not path.exists():
                return False, "File does not exist"

            if not path.is_file():
                return False, "Specified path is not a file"

            # Check permissions
            if not os.access(path, os.R_OK):
                return False, "No read permission for the file"

            return True, "File path is safe"

        except Exception as e:
            return False, f"File path validation error: {str(e)}"

    @staticmethod
    def validate_file_size(file_path: Path, max_size: int) -> Tuple[bool, str]:
        """Validate file size"""
        try:
            if file_path.stat().st_size > max_size:
                return False, f"File size too large (limit: {max_size//1024//1024}MB)"
            return True, "File size OK"
        except Exception as e:
            return False, f"File size check error: {str(e)}"

    @staticmethod
    def read_file(file_path: Path) -> Tuple[bool, str, str]:
        """Read and validate file content"""
        try:
            with file_path.open("r", encoding="utf-8") as f:
                content = f.read().strip()

            if not content:
                return False, "", "File is empty"

            return True, content, "File read successfully"

        except UnicodeDecodeError:
            return False, "", "File is not UTF-8 encoded"
        except Exception as e:
            return False, "", f"File reading error: {e}"


class TextProcessor:
    """Text processing utilities"""

    def __init__(self, token_limit: int):
        self.token_limit = token_limit
        self.encoder = tiktoken.get_encoding("cl100k_base")

    def split_by_tokens(self, text: str) -> List[str]:
        """Split text into segments based on token limit"""
        parts = []
        current = ""

        sentences = re.split(r'(?<=[。．！？\n])', text)

        for sentence in sentences:
            if not sentence.strip():
                continue

            test_text = current + sentence
            tokens = self.encoder.encode(test_text)

            if len(tokens) > self.token_limit:
                if current.strip():
                    parts.append(current.strip())
                current = sentence
            else:
                current = test_text

        if current.strip():
            parts.append(current.strip())

        return parts

    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        return len(self.encoder.encode(text))


class AudioSynthesizer:
    """Audio synthesis with retry logic"""

    def __init__(self, config: TTSConfig):
        self.config = config

    def _create_audio(self, text: str) -> bytes:
        """Create audio using OpenAI API"""
        response = openai.audio.speech.create(
            model=self.config.model,
            voice=self.config.voice,
            input=text,
            instructions=self.config.instructions,
            response_format=self.config.response_format,
        )
        return response.content

    def synthesize_with_retry(self, text: str) -> bytes:
        """Synthesize audio with retry logic"""
        last_error = None

        for attempt in range(self.config.max_retries):
            try:
                return self._create_audio(text)
            except Exception as e:
                last_error = e
                if attempt < self.config.max_retries - 1:
                    print(f"⚠️ API call failed (attempt {attempt + 1}/{self.config.max_retries}): {str(e)}")
                    print(f"🔄 Retrying in {self.config.retry_delay} seconds...")
                    time.sleep(self.config.retry_delay * (attempt + 1))
                else:
                    print(f"❌ API call failed {self.config.max_retries} times")

        raise last_error

    def create_segment(self, text: str, index: int, prefix: str, output_dir: Path) -> Path:
        """Create a single audio segment"""
        print(f"🎙️ Generating Part {index + 1}...")

        audio_content = self.synthesize_with_retry(text)

        part_path = output_dir / f"{prefix}_part{index + 1}.mp3"
        with open(part_path, "wb") as f:
            f.write(audio_content)

        print(f"✅ Saved: {part_path}")
        return part_path


class AudioMerger:
    """Audio file merging utilities"""

    @staticmethod
    def merge_files(parts: List[Path], output_path: Path, output_dir: Path) -> None:
        """Merge multiple audio files into one"""
        list_file = output_dir / "concat_list.txt"

        try:
            # Create concatenation list file
            with open(list_file, "w") as f:
                for part_path in parts:
                    f.write(f"file '{part_path}'\n")

            print("🔄 Merging audio segments...")

            # Run FFmpeg
            subprocess.run([
                "ffmpeg", "-f", "concat", "-safe", "0", "-i", str(list_file),
                "-c", "copy", str(output_path)
            ], check=True)

            print(f"🎧 Merged file created: {output_path}")

        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"FFmpeg execution error: {e}")
        except Exception as e:
            raise RuntimeError(f"File merge error: {e}")
        finally:
            # Clean up temporary file
            try:
                os.remove(list_file)
            except:
                pass


class FileCleanup:
    """File cleanup utilities"""

    @staticmethod
    def remove_files(file_paths: List[Path]) -> None:
        """Remove multiple files safely"""
        for file_path in file_paths:
            try:
                os.remove(file_path)
                print(f"🗑️ Deleted: {file_path}")
            except Exception as e:
                print(f"⚠️ Failed to delete: {file_path} ({e})")

    @staticmethod
    def cleanup_on_error(file_paths: List[Path]) -> None:
        """Clean up files when an error occurs"""
        for file_path in file_paths:
            try:
                os.remove(file_path)
            except:
                pass


class TTSProcessor:
    """Main TTS processing class"""

    def __init__(self):
        self.config = TTSConfig()
        self.validator = FileValidator()
        self.text_processor = TextProcessor(self.config.token_limit)
        self.synthesizer = AudioSynthesizer(self.config)
        self.merger = AudioMerger()
        self.cleanup = FileCleanup()

    def process_file(self, input_file: str) -> None:
        """Process a text file and convert to audio"""
        # Validate file path
        is_valid, message = self.validator.validate_path(input_file)
        if not is_valid:
            print(f"❌ File path validation error: {message}")
            sys.exit(1)

        print(f"✅ File path validation OK: {message}")

        input_path = Path(input_file).resolve()

        # Validate file size
        is_valid, message = self.validator.validate_file_size(input_path, self.config.max_file_size)
        if not is_valid:
            print(f"❌ {message}")
            sys.exit(1)

        # Read file content
        success, content, message = self.validator.read_file(input_path)
        if not success:
            print(f"❌ {message}")
            sys.exit(1)

        # Process text
        print("✂️ Splitting text based on token length...")
        text_parts = self.text_processor.split_by_tokens(content)
        print(f"📚 Number of segments: {len(text_parts)}")

        # Generate audio segments
        prefix = input_path.stem
        output_dir = input_path.parent
        output_parts = []

        try:
            for i, part_text in enumerate(text_parts):
                char_count = len(part_text)
                token_count = self.text_processor.count_tokens(part_text)
                print(f"🧮 Part {i+1} Character count: {char_count} / Token count: {token_count}")

                part_path = self.synthesizer.create_segment(part_text, i, prefix, output_dir)
                output_parts.append(part_path)

        except Exception as e:
            print(f"❌ Failed to generate audio: {e}")
            self.cleanup.cleanup_on_error(output_parts)
            sys.exit(1)

        # Merge audio files
        merged_file = output_dir / f"{prefix}_merged.mp3"

        try:
            self.merger.merge_files(output_parts, merged_file, output_dir)
        except Exception as e:
            print(f"❌ Failed to merge audio files: {e}")
            sys.exit(1)

        # Clean up temporary files
        self.cleanup.remove_files(output_parts)

        print("✅ All done!")
        print(f"🎧 Output file: {merged_file}")


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python tts.py input.txt")
        sys.exit(1)

    try:
        processor = TTSProcessor()
        processor.process_file(sys.argv[1])
    except ValueError as e:
        print(f"❌ Configuration error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
