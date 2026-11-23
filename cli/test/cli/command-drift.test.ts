import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  runCommandDriftChecks,
  type DriftCommandSpec,
  type DriftSkillFile,
  type DriftSourceFile
} from '../../scripts/command-drift-core';
import { getCliCommandSpecs } from '../../src/cli/registry';

const testDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(testDir, '../..');
const repoRoot = resolve(cliRoot, '..');

async function readTsTree(dirPath: string): Promise<DriftSourceFile[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: DriftSourceFile[] = [];
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readTsTree(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push({
        path: relative(repoRoot, fullPath).replace(/\\/g, '/'),
        content: await readFile(fullPath, 'utf8')
      });
    }
  }
  return files;
}

async function readSkillDocs(): Promise<DriftSkillFile[]> {
  const skillsDir = join(cliRoot, 'skills');
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const docs: DriftSkillFile[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && /^fastgpt-[a-z0-9-]+$/.test(entry.name)) {
      const filePath = join(skillsDir, entry.name, 'SKILL.md');
      if (existsSync(filePath)) {
        docs.push({
          path: relative(repoRoot, filePath).replace(/\\/g, '/'),
          content: await readFile(filePath, 'utf8')
        });
      }
    }
  }

  const publicSkill = join(repoRoot, 'document', 'public', 'cli', 'skill.md');
  if (existsSync(publicSkill)) {
    docs.push({
      path: relative(repoRoot, publicSkill).replace(/\\/g, '/'),
      content: await readFile(publicSkill, 'utf8')
    });
  }

  return docs;
}

describe('CLI Registry, Skill & Architecture Drift Gate', () => {
  it('passes registry integrity, skill doc command references, and 4-layer architecture guardrails', async () => {
    const specs = getCliCommandSpecs();
    const [skillFiles, srcFiles] = await Promise.all([
      readSkillDocs(),
      readTsTree(join(cliRoot, 'src'))
    ]);

    expect(skillFiles.length).toBe(6);

    const report = runCommandDriftChecks({
      specs,
      skillFiles,
      srcFiles
    });

    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('detects registry integrity violations including duplicates, alias collisions, invalid segments, and skill/skills conflicts', () => {
    const validBase: DriftCommandSpec = {
      path: ['dataset', 'list'],
      summary: 'List datasets',
      risk: 'read',
      authModes: ['token'],
      examples: [{ description: 'List', args: ['dataset', 'list'] }]
    };

    const report = runCommandDriftChecks({
      specs: [
        validBase,
        validBase,
        {
          path: ['badName'],
          aliases: ['dataset list'],
          summary: '',
          risk: 'dangerous',
          authModes: [],
          examples: []
        },
        {
          path: ['skill', 'list'],
          summary: 'List platform skills',
          risk: 'read',
          authModes: ['token'],
          examples: [{ description: 'List', args: ['skill', 'list'] }]
        },
        {
          path: ['skills', 'list'],
          summary: 'List agent skills',
          risk: 'read',
          authModes: ['none'],
          examples: [{ description: 'List', args: ['skills', 'list'] }]
        }
      ],
      skillFiles: [],
      srcFiles: []
    });

    expect(report.ok).toBe(false);
    const kinds = new Set(report.violations.map((v) => v.kind));
    expect(kinds.has('registry-duplicate-command')).toBe(true);
    expect(kinds.has('registry-alias-collision')).toBe(true);
    expect(kinds.has('registry-invalid-segment')).toBe(true);
    expect(kinds.has('registry-missing-summary')).toBe(true);
    expect(kinds.has('registry-missing-examples')).toBe(true);
    expect(kinds.has('registry-invalid-risk')).toBe(true);
    expect(kinds.has('registry-missing-auth-modes')).toBe(true);
    expect(kinds.has('registry-skill-skills-collision')).toBe(true);
  });

  it('detects stale or invalid fastgpt command references across inline, fenced bash, and $ prompt lines', () => {
    const specs: DriftCommandSpec[] = [
      {
        path: ['dataset', 'list'],
        summary: 'List datasets',
        risk: 'read',
        authModes: ['token'],
        examples: [{ description: 'List', args: ['dataset', 'list'] }]
      },
      {
        path: ['logout'],
        aliases: ['auth logout'],
        summary: 'Logout',
        risk: 'write',
        authModes: ['none'],
        examples: [{ description: 'Logout', args: ['logout'] }]
      }
    ];

    const report = runCommandDriftChecks({
      specs,
      skillFiles: [
        {
          path: 'cli/skills/fastgpt-test/SKILL.md',
          content: [
            '# Test',
            '',
            'Valid inline: `fastgpt dataset list --format json` and `fastgpt auth logout` and `fastgpt dataset --help` and `fastgpt --version`.',
            '',
            'Invalid inline: `fastgpt dataset train wait`',
            '',
            '```bash',
            'fastgpt dataset list --format json',
            'fastgpt dataset tag list',
            '```',
            '',
            '$ fastgpt --bogus-flag'
          ].join('\n')
        }
      ],
      srcFiles: []
    });

    expect(report.ok).toBe(false);
    expect(report.violations).toHaveLength(3);
    expect(report.violations.map((v) => ({ line: v.line, command: v.command }))).toEqual([
      { line: 5, command: 'fastgpt dataset train wait' },
      { line: 9, command: 'fastgpt dataset tag list' },
      { line: 12, command: 'fastgpt --bogus-flag' }
    ]);
  });

  it('detects forbidden imports, domain layer leaks, and re-exports', () => {
    const report = runCommandDriftChecks({
      specs: [],
      skillFiles: [],
      srcFiles: [
        {
          path: 'cli/src/domain/sample/bad-service.ts',
          content: [
            "import { readFile } from 'node:fs/promises';",
            "import { homedir } from 'node:os';",
            "import { Command } from 'commander';",
            "import * as clack from '@clack/prompts';",
            "import pc from 'picocolors';",
            "import mongoose from 'mongoose';",
            "export { readFile } from 'node:fs/promises';",
            "export * from './other';",
            'export function run() { process.stdout.write("hi"); }'
          ].join('\n')
        },
        {
          path: 'cli/src/infra/sample/bad-infra.ts',
          content: [
            "import type { BunFile } from '@types/bun';",
            "import { Database } from 'bun:sqlite';",
            "import { serviceFn } from '@fastgpt/service/core/app';",
            "import next from 'next';"
          ].join('\n')
        }
      ]
    });

    expect(report.ok).toBe(false);
    const kinds = report.violations.map((v) => v.kind);
    expect(kinds).toContain('arch-domain-forbidden-import');
    expect(kinds).toContain('arch-forbidden-import');
    expect(kinds).toContain('arch-reexport');
  });
});
