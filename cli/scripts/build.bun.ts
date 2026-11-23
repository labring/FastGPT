import { chmod, rm, writeFile } from 'node:fs/promises';
import {
  CLI_SKILLS_BUNDLE_FILE,
  readCliSkillsSource
} from '../src/infra/skills/cli-skill-catalog.ts';
import {
  readWorkflowBuildSkillSource,
  WORKFLOW_BUILD_SKILL_FILE
} from '../src/infra/workflow/skill-catalog.ts';

type BunBuildResult = {
  success: boolean;
  logs: unknown[];
};

type BunBuildOptions = {
  entrypoints: string[];
  outdir?: string;
  target?: 'node' | 'bun' | 'browser';
  format?: 'esm' | 'cjs' | 'iife';
  splitting?: boolean;
  minify?: boolean;
  define?: Record<string, string>;
  naming?: {
    entry?: string;
    chunk?: string;
  };
  compile?: {
    outfile: string;
    target?: string;
  };
};

type BunGlobal = {
  build: (options: BunBuildOptions) => Promise<BunBuildResult>;
};

const bunRuntime = (globalThis as { Bun?: BunGlobal }).Bun;
if (!bunRuntime) {
  throw new Error('scripts/build.bun.ts must be executed with Bun.');
}

const args = process.argv.slice(2);
const compileOnly = args.includes('--compile-only');
const bundleOnly = args.includes('--bundle-only');

if (compileOnly && bundleOnly) {
  throw new Error('Cannot pass both --compile-only and --bundle-only.');
}

function readFlagValue(flag: string): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag) return args[i + 1];
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
  }
  return undefined;
}

const skillJson = JSON.stringify(await readWorkflowBuildSkillSource());
const cliSkillsJson = JSON.stringify(await readCliSkillsSource());

if (!compileOnly) {
  await rm('dist', { recursive: true, force: true });

  const bundleResult = await bunRuntime.build({
    entrypoints: ['src/cli/cli.ts', 'src/cli/run.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'esm',
    splitting: true,
    minify: true,
    naming: {
      entry: '[name].mjs',
      chunk: '[name]-[hash].mjs'
    }
  });

  if (!bundleResult.success) {
    throw new AggregateError(bundleResult.logs, 'Bun bundle build failed');
  }

  await chmod('dist/cli.mjs', 0o755);
  await writeFile(`dist/${WORKFLOW_BUILD_SKILL_FILE}`, skillJson);
  await writeFile(`dist/${CLI_SKILLS_BUNDLE_FILE}`, cliSkillsJson);
}

if (!bundleOnly) {
  const target = readFlagValue('--target');
  const outfile =
    readFlagValue('--outfile') ??
    `bin/${target ? `fastgpt-${target}` : 'fastgpt'}${target?.includes('windows') ? '.exe' : ''}`;

  const compileResult = await bunRuntime.build({
    entrypoints: ['src/cli/cli.ts'],
    minify: true,
    define: {
      __FASTGPT_WORKFLOW_BUILD_SKILL__: skillJson,
      __FASTGPT_CLI_SKILLS__: cliSkillsJson
    },
    compile: target ? { outfile, target } : { outfile }
  });

  if (!compileResult.success) {
    throw new AggregateError(compileResult.logs, 'Bun compile build failed');
  }
}
