import { readdir, readFile } from 'node:fs/promises';

export const WORKFLOW_BUILD_SKILL_FILE = 'workflow-build-skill.json';

type WorkflowBuildSkill = {
  markdown: string;
  references: Record<string, string>;
};

// 独立可执行文件没有 dist 目录，由 Bun 在编译时内嵌同一份文档。
declare const __FASTGPT_WORKFLOW_BUILD_SKILL__: WorkflowBuildSkill | undefined;

/** 读取仓库中的 Markdown，为构建产物和源码运行提供同一份文档。 */
export async function readWorkflowBuildSkillSource(): Promise<WorkflowBuildSkill> {
  const directory = new URL('../../../skills/workflow-build/', import.meta.url);
  const referenceDirectory = new URL('references/', directory);
  const [markdown, files] = await Promise.all([
    readFile(new URL('SKILL.md', directory), 'utf8'),
    readdir(referenceDirectory, { withFileTypes: true })
  ]);
  const names = files
    .filter((file) => file.isFile() && /^[a-z0-9-]+\.md$/.test(file.name))
    .map((file) => file.name)
    .sort();
  const references = await Promise.all(
    names.map(
      async (name) =>
        [name.slice(0, -3), await readFile(new URL(name, referenceDirectory), 'utf8')] as const
    )
  );
  return { markdown, references: Object.fromEntries(references) };
}

/** 读取构建产物旁的文档，编译为单文件时直接使用内嵌内容。 */
export async function loadWorkflowBuildSkill(): Promise<WorkflowBuildSkill> {
  if (typeof __FASTGPT_WORKFLOW_BUILD_SKILL__ !== 'undefined') {
    return __FASTGPT_WORKFLOW_BUILD_SKILL__;
  }
  if (import.meta.url.endsWith('/skill-catalog.ts')) {
    return readWorkflowBuildSkillSource();
  }
  const json = await readFile(new URL(WORKFLOW_BUILD_SKILL_FILE, import.meta.url), 'utf8');
  return JSON.parse(json) as WorkflowBuildSkill;
}
