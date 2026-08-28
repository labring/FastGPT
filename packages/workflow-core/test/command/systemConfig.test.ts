import {
  FlowNodeTypeEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum,
  applyWorkflowCommand,
  builtinTemplateProvider,
  createDefaultWorkflowDocument,
  createWorkflowDocument,
  ensureSystemConfigNode
} from '../../src';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

describe('legacy system config compatibility', () => {
  it('creates only workflow start as the default workflow structure', async () => {
    const result = await createDefaultWorkflowDocument({
      app: { name: 'Default workflow' },
      dependencies
    });

    expect(result.nodeIds).toEqual(['start']);
    expect(result.document.nodes).toEqual([
      expect.objectContaining({
        nodeId: 'start',
        flowNodeType: FlowNodeTypeEnum.workflowStart
      })
    ]);
  });

  it('keeps variables in chatConfig without creating a legacy config node', async () => {
    const { document } = await createDefaultWorkflowDocument({ dependencies });
    const result = await applyWorkflowCommand({
      document,
      command: {
        type: 'variable.add',
        variable: {
          key: 'tenantId',
          label: 'Tenant ID',
          description: '',
          type: VariableInputEnum.input,
          valueType: WorkflowIOValueTypeEnum.string,
          required: true
        }
      },
      dependencies
    });

    expect(result.document.chatConfig.variables).toEqual([
      expect.objectContaining({ key: 'tenantId' })
    ]);
    expect(result.document.nodes).toHaveLength(1);
  });

  it('keeps the legacy ensure call as a no-op without overwriting chatConfig', async () => {
    const document = createWorkflowDocument({ chatConfig: { welcomeText: 'Keep me' } });

    const first = await ensureSystemConfigNode({ document, dependencies });
    const second = await ensureSystemConfigNode({ document, dependencies });

    expect(first.nodeIds).toEqual([]);
    expect(second.nodeIds).toEqual([]);
    expect(document.chatConfig.welcomeText).toBe('Keep me');
    expect(document.nodes).toEqual([]);
  });
});
