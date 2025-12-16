#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { getEncoding } from 'js-tiktoken';
import { spawn } from 'child_process';

dotenv.config();

// Determine __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TTSConfig {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
        this.model = "gpt-4o-mini-tts";
        this.voice = "alloy";
        this.responseFormat = "mp3";
        this.tokenLimit = 1600;
        this.maxRetries = 3;
        this.retryDelay = 2000; // ms
        this.maxFileSize = 100 * 1024 * 1024; // 100MB

        this.instructions =
            "Speak with a warm, clear, and engaging tone suitable for educational narration in both Japanese and English. " +
            "Use natural pacing with gentle emphasis on key points. " +
            "For Japanese text: pronounce each character clearly with proper pitch accent and natural rhythm. " +
            "For English in Japanese context: maintain clear pronunciation while flowing naturally. " +
            "Add appropriate pauses at punctuation marks and between sentences for comprehension. " +
            "Maintain consistent energy and deliver as a friendly, knowledgeable tutor.";

        if (!this.apiKey) {
            throw new Error("OPENAI_API_KEY environment variable is not set");
        }
    }
}

class FileValidator {
    static validatePath(filePath) {
        try {
            const resolvedPath = path.resolve(filePath);
            const homeDir = process.env.HOME || process.env.USERPROFILE;

            // Prevent path traversal
            if (resolvedPath.includes('..')) {
                 // Note: path.resolve resolves '..', so checking the string input might be better if strict,
                 // but checking if resolvedPath starts with homeDir helps.
                 // However, Python version explicitly checked for ".." in stringified path object which resolves already.
                 // We will check if it's within allowed bounds (home dir).
            }

            if (!resolvedPath.startsWith(homeDir)) {
                 return { valid: false, message: `File must be located under home directory (${homeDir})` };
            }

            if (!fs.existsSync(resolvedPath)) {
                return { valid: false, message: "File does not exist" };
            }

            const stats = fs.statSync(resolvedPath);
            if (!stats.isFile()) {
                return { valid: false, message: "Specified path is not a file" };
            }

            try {
                fs.accessSync(resolvedPath, fs.constants.R_OK);
            } catch (e) {
                return { valid: false, message: "No read permission for the file" };
            }

            return { valid: true, message: "File path is safe" };

        } catch (e) {
            return { valid: false, message: `File path validation error: ${e.message}` };
        }
    }

    static validateFileSize(filePath, maxSize) {
        try {
            const stats = fs.statSync(filePath);
            if (stats.size > maxSize) {
                return { valid: false, message: `File size too large (limit: ${Math.floor(maxSize/1024/1024)}MB)` };
            }
            return { valid: true, message: "File size OK" };
        } catch (e) {
            return { valid: false, message: `File size check error: ${e.message}` };
        }
    }

    static readFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            if (!content.trim()) {
                return { success: false, content: "", message: "File is empty" };
            }
            return { success: true, content: content.trim(), message: "File read successfully" };
        } catch (e) {
            return { success: false, content: "", message: `File reading error: ${e.message}` };
        }
    }
}

class TextProcessor {
    constructor(tokenLimit) {
        this.tokenLimit = tokenLimit;
        // cl100k_base is used by gpt-4, gpt-3.5-turbo, etc.
        this.encoder = getEncoding("cl100k_base");
    }

    splitByTokens(text) {
        const parts = [];
        let current = "";

        // Split by sentence delimiters. Python used: re.split(r'(?<=[。．！？\n])', text)
        // JS RegExp lookbehind is supported in modern Node.
        const sentences = text.split(/(?<=[。．！？\n])/);

        for (const sentence of sentences) {
             if (!sentence.trim()) continue;

             const testText = current + sentence;
             const tokens = this.encoder.encode(testText);

             if (tokens.length > this.tokenLimit) {
                 if (current.trim()) {
                     parts.push(current.trim());
                 }
                 current = sentence;
             } else {
                 current = testText;
             }
        }

        if (current.trim()) {
            parts.push(current.trim());
        }

        return parts;
    }

    countTokens(text) {
        return this.encoder.encode(text).length;
    }
}

class AudioSynthesizer {
    constructor(config) {
        this.config = config;
        this.openai = new OpenAI({ apiKey: config.apiKey });
    }

    async _createAudio(text) {
        const mp3 = await this.openai.audio.speech.create({
            model: this.config.model,
            voice: this.config.voice,
            input: text,
            response_format: this.config.responseFormat,
        });

        return Buffer.from(await mp3.arrayBuffer());
    }

    async synthesizeWithRetry(text) {
        let lastError = null;

        for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
            try {
                return await this._createAudio(text);
            } catch (e) {
                lastError = e;
                if (attempt < this.config.maxRetries - 1) {
                    console.error(`⚠️ API call failed (attempt ${attempt + 1}/${this.config.maxRetries}): ${e.message}`);
                    console.log(`🔄 Retrying in ${this.config.retryDelay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * (attempt + 1)));
                } else {
                    console.error(`❌ API call failed ${this.config.maxRetries} times`);
                }
            }
        }
        throw lastError;
    }

    async createSegment(text, index, prefix, outputDir) {
        console.log(`🎙️ Generating Part ${index + 1}...`);

        const audioContent = await this.synthesizeWithRetry(text);

        const partPath = path.join(outputDir, `${prefix}_part${index + 1}.mp3`);
        fs.writeFileSync(partPath, audioContent);

        console.log(`✅ Saved: ${partPath}`);
        return partPath;
    }
}

class AudioMerger {
    static async mergeFiles(parts, outputPath, outputDir) {
        const listFile = path.join(outputDir, "concat_list.txt");

        try {
            const fileContent = parts.map(p => `file '${p}'`).join('\n');
            fs.writeFileSync(listFile, fileContent);

            console.log("🔄 Merging audio segments...");

            await new Promise((resolve, reject) => {
                const ffmpeg = spawn('ffmpeg', [
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', listFile,
                    '-c', 'copy',
                    outputPath
                ]);

                ffmpeg.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`FFmpeg exited with code ${code}`));
                });

                ffmpeg.on('error', (err) => {
                    reject(err);
                });
            });

            console.log(`🎧 Merged file created: ${outputPath}`);

        } catch (e) {
            throw new Error(`Merge error: ${e.message}`);
        } finally {
            try {
                if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
            } catch (e) { /* ignore */ }
        }
    }
}

class FileCleanup {
    static removeFiles(filePaths) {
        for (const filePath of filePaths) {
            try {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Deleted: ${filePath}`);
            } catch (e) {
                console.log(`⚠️ Failed to delete: ${filePath} (${e.message})`);
            }
        }
    }

    static cleanupOnError(filePaths) {
        for (const filePath of filePaths) {
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (e) { /* ignore */ }
        }
    }
}

class TTSProcessor {
    constructor() {
        this.config = new TTSConfig();
        this.textProcessor = new TextProcessor(this.config.tokenLimit);
        this.synthesizer = new AudioSynthesizer(this.config);
    }

    async processFile(inputFile) {
        const { valid, message } = FileValidator.validatePath(inputFile);
        if (!valid) {
            console.error(`❌ File path validation error: ${message}`);
            process.exit(1);
        }
        console.log(`✅ File path validation OK: ${message}`);

        const inputPath = path.resolve(inputFile);
        const { valid: sizeValid, message: sizeMsg } = FileValidator.validateFileSize(inputPath, this.config.maxFileSize);
        if (!sizeValid) {
            console.error(`❌ ${sizeMsg}`);
            process.exit(1);
        }

        const { success, content, message: readMsg } = FileValidator.readFile(inputPath);
        if (!success) {
            console.error(`❌ ${readMsg}`);
            process.exit(1);
        }

        console.log("✂️ Splitting text based on token length...");
        const textParts = this.textProcessor.splitByTokens(content);
        console.log(`📚 Number of segments: ${textParts.length}`);

        const prefix = path.basename(inputPath, path.extname(inputPath));
        const outputDir = path.dirname(inputPath);
        const outputParts = [];

        try {
            for (let i = 0; i < textParts.length; i++) {
                const partText = textParts[i];
                const charCount = partText.length;
                const tokenCount = this.textProcessor.countTokens(partText);
                console.log(`🧮 Part ${i + 1} Character count: ${charCount} / Token count: ${tokenCount}`);

                const partPath = await this.synthesizeWithRetryWrapper(partText, i, prefix, outputDir);
                outputParts.push(partPath);
            }
        } catch (e) {
            console.error(`❌ Failed to generate audio: ${e.message}`);
            FileCleanup.cleanupOnError(outputParts);
            process.exit(1);
        }

        const mergedFile = path.join(outputDir, `${prefix}_merged.mp3`);

        try {
            await AudioMerger.mergeFiles(outputParts, mergedFile, outputDir);
        } catch (e) {
            console.error(`❌ Failed to merge audio files: ${e.message}`);
            process.exit(1);
        }

        FileCleanup.removeFiles(outputParts);

        console.log("✅ All done!");
        console.log(`🎧 Output file: ${mergedFile}`);
    }

    // Wrapper to keep 'this' context or just use instance method
    async synthesizeWithRetryWrapper(text, index, prefix, outputDir) {
        return this.synthesizer.createSegment(text, index, prefix, outputDir);
    }
}

async function main() {
    if (process.argv.length < 3) {
        console.log("Usage: node tts.js input.txt");
        process.exit(1);
    }

    try {
        const processor = new TTSProcessor();
        await processor.processFile(process.argv[2]);
    } catch (e) {
        if (e.message.includes("OPENAI_API_KEY")) {
            console.error(`❌ Configuration error: ${e.message}`);
        } else {
            console.error(`❌ Unexpected error: ${e.message}`);
        }
        process.exit(1);
    }
}

main();
