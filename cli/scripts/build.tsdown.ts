import { dirname, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsdown';
import {
  CLI_SKILLS_BUNDLE_FILE,
  readCliSkillsSource
} from '../src/infra/skills/cli-skill-catalog.ts';
import {
  readWorkflowBuildSkillSource,
  WORKFLOW_BUILD_SKILL_FILE
} from '../src/infra/workflow/skill-catalog.ts';

export default defineConfig({
  cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  entry: {
    run: 'src/cli/run.ts',
    cli: 'src/cli/cli.ts'
  },
  minify: true,
  clean: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  deps: {
    alwaysBundle: [
      /^@fastgpt\/global/,
      /^@fastgpt\/workflow-core/,
      /^crypto-js/,
      /^zod/,
      /^commander/,
      /^@clack\/prompts/,
      /^@clack\/core/,
      /^ky/,
      /^picocolors/,
      /^sisteransi/
    ],
    onlyBundle: false
  },
  dts: false,
  onSuccess: async ({ outDir }) => {
    const [workflowSkill, cliSkills] = await Promise.all([
      readWorkflowBuildSkillSource(),
      readCliSkillsSource()
    ]);
    await Promise.all([
      writeFile(resolve(outDir, WORKFLOW_BUILD_SKILL_FILE), JSON.stringify(workflowSkill)),
      writeFile(resolve(outDir, CLI_SKILLS_BUNDLE_FILE), JSON.stringify(cliSkills))
    ]);
  }
});
