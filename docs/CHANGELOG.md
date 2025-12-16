# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- **Rewrite**: Complete migration from Python to Node.js.
- **CLI**: Renamed project to `tts-js` and updated command to `tts`.
- **Docs**: Updated `ARCHITECTURE.md` with system diagrams and component breakdown.

### Added
- **Global Execution**: Support for `npm link` and global binary execution (`bin` entry in `package.json`).
- **Dependencies**: `openai` (Node SDK), `js-tiktoken`, `dotenv`.
- **Docs**: Added `docs/decisions.md` (ADR 001).

### Removed
- Legacy Python files (`tts.py`, `venv/`).
- Unused configuration and logs.
