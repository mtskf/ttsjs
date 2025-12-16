#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { getEncoding } from 'js-tiktoken';
import { spawn } from 'child_process';
import { Command } from 'commander';
import cliProgress from 'cli-progress';
import pLimit from 'p-limit';

dotenv.config();

// Determine __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TTSConfig {
    constructor(options = {}) {
        this.apiKey = process.env.OPENAI_API_KEY;
        this.model = options.model || "gpt-4o-mini-tts";
        this.voice = options.voice || "alloy";
        this.responseFormat = "mp3";
        this.tokenLimit = 1600;
        this.maxRetries = 3;
        this.retryDelay = 2000; // ms
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.concurrency = parseInt(options.parallel) || 3;

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
                 // Check if it's within allowed bounds (home dir).
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

        // Split by sentence delimiters.
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
                    // Suppress log if we want cleaner progress bar output, or use external logger
                    // For now, minimal logging
                    // console.error(`⚠️ API call failed (attempt ${attempt + 1}/${this.config.maxRetries}): ${e.message}`);
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * (attempt + 1)));
                }
            }
        }
        throw lastError;
    }

    async createSegment(text, index, prefix, outputDir) {
        const audioContent = await this.synthesizeWithRetry(text);
        const partPath = path.join(outputDir, `${prefix}_part${index + 1}.mp3`);
        fs.writeFileSync(partPath, audioContent);
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
            } catch (e) {
                console.log(`⚠️ Failed to delete: ${filePath} (${e.message})`);
            }
        }
    }

    static cleanupOnError(filePaths) {
        for (const filePath of filePaths) {
            if (!filePath) continue;
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (e) { /* ignore */ }
        }
    }
}

class TTSProcessor {
    constructor(options = {}) {
        this.config = new TTSConfig(options);
        this.textProcessor = new TextProcessor(this.config.tokenLimit);
        this.synthesizer = new AudioSynthesizer(this.config);
    }

    async processFile(inputFile) {
        const { valid, message } = FileValidator.validatePath(inputFile);
        if (!valid) {
            console.error(`❌ File path validation error: ${message}`);
            process.exit(1);
        }

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

        console.log(`Processing: ${path.basename(inputFile)}`);
        console.log(`Model: ${this.config.model} | Voice: ${this.config.voice} | Parallel: ${this.config.concurrency}`);

        const textParts = this.textProcessor.splitByTokens(content);
        console.log(`📚 Segments: ${textParts.length}`);

        const prefix = path.basename(inputPath, path.extname(inputPath));
        const outputDir = path.dirname(inputPath);

        // Parallel Processing with p-limit
        const limit = pLimit(this.config.concurrency);
        const outputParts = new Array(textParts.length);

        // Progress Bar
        const bar = new cliProgress.SingleBar({
            format: 'Generating Audio |' + '{bar}' + '| {percentage}% || {value}/{total} Segments',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true
        });

        bar.start(textParts.length, 0);

        try {
            const tasks = textParts.map((partText, i) => {
                return limit(async () => {
                    const partPath = await this.synthesizeWithRetryWrapper(partText, i, prefix, outputDir);
                    outputParts[i] = partPath;
                    bar.increment();
                });
            });

            await Promise.all(tasks);
        } catch (e) {
            bar.stop();
            console.error(`\n❌ Failed to generate audio: ${e.message}`);
            FileCleanup.cleanupOnError(outputParts);
            process.exit(1);
        }

        bar.stop();

        const mergedFile = path.join(outputDir, `${prefix}_merged.mp3`);

        try {
            await AudioMerger.mergeFiles(outputParts, mergedFile, outputDir);
        } catch (e) {
            console.error(`❌ Failed to merge audio files: ${e.message}`);
            process.exit(1);
        }

        FileCleanup.removeFiles(outputParts);

        console.log("✅ All done!");
    }

    async synthesizeWithRetryWrapper(text, index, prefix, outputDir) {
        return this.synthesizer.createSegment(text, index, prefix, outputDir);
    }
}

async function main() {
    const program = new Command();

    program
      .name('tts')
      .description('Convert text file to speech using OpenAI API')
      .version('1.1.0')
      .argument('<file>', 'Input text file path')
      .option('-m, --model <model>', 'OpenAI model to use', 'gpt-4o-mini-tts')
      .option('-v, --voice <voice>', 'Voice to use (alloy, echo, fable, onyx, nova, shimmer)', 'alloy')
      .option('-p, --parallel <number>', 'Number of concurrent API requests', '3')
      .action(async (file, options) => {
          try {
              const processor = new TTSProcessor(options);
              await processor.processFile(file);
          } catch (e) {
              if (e.message.includes("OPENAI_API_KEY")) {
                  console.error(`❌ Configuration error: ${e.message}`);
              } else {
                  console.error(`❌ Unexpected error: ${e.message}`);
              }
              process.exit(1);
          }
      });

    program.parse();
}

main();
