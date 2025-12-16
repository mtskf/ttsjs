# Lessons Learned

- **Process**: Always run the `start_task` workflow before beginning ANY work to ensure correct branching and context loading.
- **Node.js**: `npm link` requires a `bin` entry in `package.json` and a shebang `#!/usr/bin/env node` in the executable file.