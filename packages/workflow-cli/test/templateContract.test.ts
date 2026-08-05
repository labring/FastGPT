import { listTemplates, showTemplate } from '../src/commands/template';
import type { CliContext } from '../src/type';
import { builtinTemplateProvider } from '@fastgpt/workflow-core';
import { describe, expect, it } from 'vitest';

const context = {
  locale: 'en',
  format: 'json',
  templateProvider: builtinTemplateProvider
} as CliContext;

describe('template contract commands', () => {
  it('returns versioned contracts for all builtin templates', async () => {
    const result = await listTemplates({}, context);
    const output = result.result as {
      total: number;
      counts: Record<string, number>;
      items: Array<Record<string, unknown>>;
    };

    expect(output).toMatchObject({
      total: 22,
      counts: { builtin: 22, teamApp: 0, systemTool: 0, tool: 0 }
    });
    expect(output.items).toContainEqual(
      expect.objectContaining({
        kind: 'builtin',
        ref: 'builtin:ai-chat',
        template: { kind: 'builtin', templateId: 'ai-chat' }
      })
    );
  });

  it('returns branch semantics through template show', async () => {
    const result = await showTemplate({ template: 'builtin:if-else' }, context);

    expect(result.result).toMatchObject({
      schemaVersion: 'fastgpt-workflow-node-contract/v1',
      template: { kind: 'builtin', templateId: 'if-else' },
      execution: {
        sourceKinds: ['branch'],
        targetKinds: ['target'],
        terminal: false,
        branch: {
          inputKey: 'ifElseList',
          keyField: 'branchId',
          keyFieldRequiredForNewValues: true,
          fallbackKey: 'ELSE',
          configureBeforeConnect: true
        }
      }
    });
  });

  it('returns Core reference compatibility through template show', async () => {
    const result = await showTemplate({ template: 'builtin:dataset-search' }, context);
    const descriptor = result.result as {
      inputs: Array<{
        valueType?: string;
        referencePolicy?: { acceptedSourceValueTypes: string[] };
      }>;
    };
    const searchInput = descriptor.inputs.find((input) => input.valueType === 'arrayString');

    expect(searchInput?.referencePolicy?.acceptedSourceValueTypes).toEqual([
      'string',
      'arrayString',
      'arrayAny',
      'any'
    ]);
  });
});
