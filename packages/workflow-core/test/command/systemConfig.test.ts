import {
  FlowNodeTypeEnum,
  VariableInputEnum,
  WorkflowCommandError,
  WorkflowIOValueTypeEnum,
  applyWorkflowCommand,
  builtinTemplateProvider,
  createDefaultWorkflowDocument,
  createWorkflowDocument,
  ensureSystemConfigNode,
  validateWorkflow
} from '../../src';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

describe('system config node', () => {
  it('creates system config and workflow start as the default workflow structure', async () => {
    const result = await createDefaultWorkflowDocument({
      app: { name: 'Default workflow' },
      dependencies
    });

    expect(result.nodeIds).toEqual(['userGuide', 'start']);
    expect(result.document.nodes).toEqual([
      expect.objectContaining({
        nodeId: 'userGuide',
        flowNodeType: FlowNodeTypeEnum.systemConfig
      }),
      expect.objectContaining({
        nodeId: 'start',
        flowNodeType: FlowNodeTypeEnum.workflowStart
      })
    ]);
  });

  it('keeps variables in chatConfig while the system config node provides the editor entry', async () => {
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
    expect(
      result.document.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.systemConfig)
        ?.inputs
    ).toEqual([]);
  });

  it('adds a missing system config node once without overwriting chatConfig', async () => {
    const document = createWorkflowDocument({ chatConfig: { welcomeText: 'Keep me' } });

    const first = await ensureSystemConfigNode({ document, dependencies });
    const second = await ensureSystemConfigNode({ document, dependencies });

    expect(first.nodeIds).toEqual(['userGuide']);
    expect(second.nodeIds).toEqual([]);
    expect(document.chatConfig.welcomeText).toBe('Keep me');
    expect(
      document.nodes.filter((node) => node.flowNodeType === FlowNodeTypeEnum.systemConfig)
    ).toHaveLength(1);
  });

  it.each(['node.remove', 'node.clone'] as const)('rejects %s for system config', async (type) => {
    const { document } = await createDefaultWorkflowDocument({ dependencies });
    const command =
      type === 'node.remove'
        ? ({ type, nodeId: 'userGuide' } as const)
        : ({ type, sourceNodeId: 'userGuide', nodeId: 'userGuide-copy' } as const);

    await expect(applyWorkflowCommand({ document, command, dependencies })).rejects.toThrow(
      WorkflowCommandError
    );
  });

  it('reports duplicate system config nodes as a validation error', async () => {
    const { document } = await createDefaultWorkflowDocument({ dependencies });
    const systemConfigNode = document.nodes.find(
      (node) => node.flowNodeType === FlowNodeTypeEnum.systemConfig
    )!;
    document.nodes.push({ ...structuredClone(systemConfigNode), nodeId: 'userGuide-copy' });

    expect(validateWorkflow(document)).toContainEqual(
      expect.objectContaining({
        code: 'WORKFLOW_SYSTEM_CONFIG_NODE_DUPLICATED',
        severity: 'error'
      })
    );
  });
});
