import { listTemplates, showTemplate } from '../src/commands/template';
import type { CliContext } from '../src/type';
import { describe, expect, it } from 'vitest';

const context = {
  locale: 'en',
  format: 'json'
} as CliContext;

describe('template contract commands', () => {
  it('returns versioned contracts for all builtin templates', async () => {
    const result = await listTemplates({}, context);
    const descriptors = result.result as Array<Record<string, unknown>>;

    expect(descriptors).toHaveLength(22);
    expect(
      descriptors.every((item) => item.schemaVersion === 'fastgpt-workflow-node-contract/v1')
    ).toBe(true);
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
});
