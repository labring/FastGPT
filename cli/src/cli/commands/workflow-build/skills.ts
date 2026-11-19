import { loadWorkflowBuildSkill } from '../../../infra/workflow/skill-catalog';
import { CliArgumentError } from '../../../shared/errors';
import type { CliCommandSpec } from '../../pipeline';

/** 提供随 CLI 发布的搭建入口和公开参考文档。 */
export function createWorkflowBuildSkillsCommandSpec(): CliCommandSpec {
  return {
    path: ['workflow-build', 'skills'],
    summary: 'Read the workflow-building skill or a bundled reference',
    risk: 'read',
    authModes: ['none'],
    positionalArgs: [
      { name: 'reference', required: false, description: 'Reference ID, e.g. changesets-and-plans' }
    ],
    options: [],
    examples: [
      { description: 'Read the skill and reference index', args: ['workflow-build', 'skills'] },
      {
        description: 'Read one reference as Markdown',
        args: ['workflow-build', 'skills', 'changesets-and-plans', '--format', 'text']
      }
    ],
    execute: async ({ positional: [reference], global }) => {
      const { markdown, references } = await loadWorkflowBuildSkill();
      if (reference === undefined) {
        const ids = Object.keys(references);
        return {
          changed: false,
          data:
            global.format === 'text'
              ? `${markdown.trimEnd()}\n\n## Reference IDs\n\n${ids.map((id) => `- ${id}`).join('\n')}`
              : { markdown, references: ids }
        };
      }
      if (!Object.hasOwn(references, reference)) {
        throw new CliArgumentError(
          `Unknown workflow skill reference "${reference}".`,
          undefined,
          'Run: fastgpt workflow-build skills'
        );
      }
      return {
        changed: false,
        data:
          global.format === 'text'
            ? references[reference]
            : { id: reference, markdown: references[reference] }
      };
    }
  };
}
