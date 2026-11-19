import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DOCUMENT_ROOT = path.resolve(CURRENT_DIR, '../../../../document');

describe('System OpenAPI docs sync gate', () => {
  it('keeps generated OpenAPI specs and bilingual reference MDX in sync with @fastgpt/global contracts', async () => {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ['--experimental-strip-types', '--test', './script/sync-openapi-docs.test.mjs'],
        {
          cwd: DOCUMENT_ROOT,
          maxBuffer: 10 * 1024 * 1024
        }
      );
      expect(stderr).not.toContain('not ok');
      expect(stdout).not.toMatch(/fail [1-9]/i);
      expect(stdout).toContain('pass');
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      throw new Error(
        `OpenAPI docs drift check failed. Run \`pnpm sync:openapi-docs\` and commit updated artifacts.\n${err.message ?? ''}\nSTDOUT:\n${err.stdout ?? ''}\nSTDERR:\n${err.stderr ?? ''}`
      );
    }
  }, 120_000);
});
