import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { apiDocOpenAPIDocument } from '@fastgpt/global/openapi/provider/systemopenapi';
import { openAPIDocument as devOpenAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import {
  runCommandDriftChecks,
  type DriftCommandSpec,
  type DriftSkillFile,
  type DriftSourceFile
} from './command-drift-core.ts';

const execFileAsync = promisify(execFile);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, '..');
const repoRoot = resolve(cliRoot, '..');

async function collectTsFiles(dirPath: string): Promise<DriftSourceFile[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const results: DriftSourceFile[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const content = await readFile(fullPath, 'utf8');
      results.push({
        path: relative(repoRoot, fullPath).replace(/\\/g, '/'),
        content
      });
    }
  }

  return results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function collectSkillFiles(): Promise<DriftSkillFile[]> {
  const skillsRoot = join(cliRoot, 'skills');
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const files: DriftSkillFile[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && /^fastgpt-[a-z0-9-]+$/.test(entry.name)) {
      const fullPath = join(skillsRoot, entry.name, 'SKILL.md');
      if (existsSync(fullPath)) {
        files.push({
          path: relative(repoRoot, fullPath).replace(/\\/g, '/'),
          content: await readFile(fullPath, 'utf8')
        });
      }
    }
  }

  const publicSkillPath = join(repoRoot, 'document', 'public', 'cli', 'skill.md');
  if (existsSync(publicSkillPath)) {
    files.push({
      path: relative(repoRoot, publicSkillPath).replace(/\\/g, '/'),
      content: await readFile(publicSkillPath, 'utf8')
    });
  }

  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function loadSpecs(): Promise<readonly DriftCommandSpec[]> {
  try {
    const registryMod = (await import('../src/cli/registry.ts')) as {
      getCliCommandSpecs: () => readonly DriftCommandSpec[];
    };
    return registryMod.getCliCommandSpecs();
  } catch (importError) {
    const builtCli = join(cliRoot, 'dist', 'cli.mjs');
    if (existsSync(builtCli)) {
      const { stdout } = await execFileAsync(
        process.execPath,
        [builtCli, 'commands', '--format', 'json'],
        { cwd: cliRoot }
      );
      const parsed = JSON.parse(stdout) as {
        data?: { commands?: DriftCommandSpec[] };
      };
      if (Array.isArray(parsed.data?.commands)) {
        return parsed.data.commands;
      }
    }
    throw new Error(
      `Unable to load CLI command registry directly (${importError instanceof Error ? importError.message : String(importError)}). Run with Bun ("bun ./scripts/check-command-drift.ts") or build dist/cli.mjs first.`
    );
  }
}

/**
 * 严格模式执行 CLI 命令注册表、官方 Skill 文档与四层架构漂移检查（CI 门禁脚本）。
 */
async function main(): Promise<void> {
  const [specs, skillFiles, srcFiles] = await Promise.all([
    loadSpecs(),
    collectSkillFiles(),
    collectTsFiles(join(cliRoot, 'src'))
  ]);

  const report = runCommandDriftChecks({
    specs,
    skillFiles,
    srcFiles,
    allowedPendingCommands: [],
    openapiDocs: {
      system: apiDocOpenAPIDocument,
      dev: devOpenAPIDocument
    }
  });

  if (!report.ok) {
    process.stderr.write(
      `CLI drift check failed with ${report.violations.length} violation(s):\n${report.violations
        .map((item) => `- [${item.kind}] ${item.message}`)
        .join('\n')}\n`
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `CLI drift check passed (${report.checkedSpecs} commands, ${report.checkedSkillFiles} skill docs, ${report.checkedSrcFiles} src files).\n`
  );
}

await main();
