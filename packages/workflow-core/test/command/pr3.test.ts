import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowCommandError,
  applyWorkflowCommand,
  builtinTemplateProvider,
  compileStoreWorkflow,
  decompileStoreWorkflow,
  parseNodeTemplateRef,
  validateWorkflow
} from '../../src';
import { describe, expect, it } from 'vitest';
import {
  createBranchingFixture,
  createDynamicIoCatchFixture,
  createNestedLoopFixture,
  createToolCallToolsFixture,
  pr3FixtureFactories
} from '../fixtures/pr3';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

describe('PR3 workflow commands', () => {
  it('builds four complex golden fixtures and preserves StoreWorkflow semantics', async () => {
    for (const [name, factory] of Object.entries(pr3FixtureFactories)) {
      const document = await factory();
      expect(validateWorkflow(document), name).toEqual([]);
      const storeWorkflow = compileStoreWorkflow(document);
      expect(
        compileStoreWorkflow(decompileStoreWorkflow({ workflow: storeWorkflow })),
        name
      ).toEqual(storeWorkflow);
    }
  });

  it('connects stable branch ports and rejects unknown branch keys', async () => {
    const document = await createBranchingFixture();
    await expect(
      applyWorkflowCommand({
        document,
        command: {
          type: 'edge.connect',
          edge: {
            source: { kind: 'branch', nodeId: 'route', branchKey: 'missing' },
            target: { kind: 'target', nodeId: 'yes' }
          }
        },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
  });

  it('inserts a node atomically between an existing complex edge', async () => {
    const document = await createBranchingFixture();
    const result = await applyWorkflowCommand({
      document,
      command: {
        type: 'node.insert',
        nodeId: 'middle',
        template: parseNodeTemplateRef('builtin:text-editor'),
        from: { kind: 'branch', nodeId: 'route', branchKey: 'positive' },
        to: { kind: 'target', nodeId: 'yes' }
      },
      dependencies
    });
    expect(result.document.executionEdges).toContainEqual({
      source: { kind: 'branch', nodeId: 'route', branchKey: 'positive' },
      target: { kind: 'target', nodeId: 'middle' }
    });
    expect(result.document.executionEdges).toContainEqual({
      source: { kind: 'next', nodeId: 'middle' },
      target: { kind: 'target', nodeId: 'yes' }
    });
    expect(document.nodes.some((node) => node.nodeId === 'middle')).toBe(false);

    const branchInsert = await applyWorkflowCommand({
      document,
      command: {
        type: 'node.insert',
        nodeId: 'outer-route',
        template: parseNodeTemplateRef('builtin:if-else'),
        from: { kind: 'next', nodeId: 'start' },
        to: { kind: 'target', nodeId: 'route' }
      },
      dependencies
    });
    expect(branchInsert.document.executionEdges).toContainEqual({
      source: { kind: 'branch', nodeId: 'outer-route', branchKey: 'ELSE' },
      target: { kind: 'target', nodeId: 'route' }
    });
  });

  it('attaches and detaches tool nodes through selectedTools ports', async () => {
    const document = await createToolCallToolsFixture();
    expect(document.executionEdges).toContainEqual({
      source: { kind: 'selectedTools', nodeId: 'caller' },
      target: { kind: 'selectedTools', nodeId: 'confirm' }
    });
    const detached = await applyWorkflowCommand({
      document,
      command: { type: 'tool.detach', toolCallNodeId: 'caller', toolNodeId: 'confirm' },
      dependencies
    });
    expect(detached.document.executionEdges).toHaveLength(1);
  });

  it('creates system children, moves nodes between scopes and cascades container removal', async () => {
    let document = await createNestedLoopFixture();
    expect(document.nodes.find((node) => node.nodeId === 'loop__start')).toMatchObject({
      parentNodeId: 'loop',
      flowNodeType: 'loopRunStart'
    });
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'node.add',
          nodeId: 'inside',
          template: parseNodeTemplateRef('builtin:text-editor'),
          parentNodeId: 'loop'
        },
        dependencies
      })
    ).document;
    const moved = await applyWorkflowCommand({
      document,
      command: { type: 'node.move', nodeId: 'inside', parentNodeId: null },
      dependencies
    });
    expect(
      moved.document.nodes.find((node) => node.nodeId === 'inside')?.parentNodeId
    ).toBeUndefined();
    const removed = await applyWorkflowCommand({
      document: moved.document,
      command: { type: 'node.remove', nodeId: 'loop' },
      dependencies
    });
    expect(removed.document.nodes.map((node) => node.nodeId)).not.toContain('loop__start');
  });

  it('removes source-output edges and reports remaining data references', async () => {
    let document = await createDynamicIoCatchFixture();
    const score = document.nodes
      .find((node) => node.nodeId === 'code')!
      .outputs.find((output) => output.key === 'score')!;
    score.type = FlowNodeOutputTypeEnum.source;
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'edge.connect',
          edge: {
            source: { kind: 'sourceOutput', nodeId: 'code', outputKey: 'score' },
            target: { kind: 'target', nodeId: 'recover' }
          }
        },
        dependencies
      })
    ).document;
    document.nodes.find((node) => node.nodeId === 'recover')!.inputs[0].value = ['code', 'score'];
    const result = await applyWorkflowCommand({
      document,
      command: { type: 'output.remove', nodeId: 'code', outputKey: 'score' },
      dependencies
    });
    expect(result.document.executionEdges.some((edge) => edge.source.kind === 'sourceOutput')).toBe(
      false
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'WORKFLOW_OUTPUT_REFERENCES_REMAIN' })
    );
  });

  it('cleans branch and catch edges when their source configuration is disabled', async () => {
    let branching = await createBranchingFixture();
    const branchResult = await applyWorkflowCommand({
      document: branching,
      command: {
        type: 'input.set',
        nodeId: 'route',
        inputKey: 'ifElseList',
        value: [
          {
            branchId: 'replacement',
            condition: 'AND',
            list: [
              {
                variable: ['start', 'userChatInput'],
                condition: 'isNotEmpty',
                valueType: 'input'
              }
            ]
          }
        ]
      },
      dependencies
    });
    branching = branchResult.document;
    expect(
      branching.executionEdges.some(
        (edge) => edge.source.kind === 'branch' && edge.source.branchKey === 'positive'
      )
    ).toBe(false);
    expect(branchResult.warnings).toContainEqual(
      expect.objectContaining({ code: 'WORKFLOW_BRANCH_EDGES_REMOVED' })
    );

    const caught = await createDynamicIoCatchFixture();
    const catchResult = await applyWorkflowCommand({
      document: caught,
      command: { type: 'node.update', nodeId: 'code', catchError: false },
      dependencies
    });
    expect(catchResult.document.executionEdges.some((edge) => edge.source.kind === 'catch')).toBe(
      false
    );
  });

  it('synchronizes form fields to outputs and protects required system children', async () => {
    let document = await createToolCallToolsFixture();
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'node.add',
          nodeId: 'form',
          template: parseNodeTemplateRef('builtin:form-input')
        },
        dependencies
      })
    ).document;
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.set',
          nodeId: 'form',
          inputKey: 'userInputForms',
          value: [
            {
              type: 'input',
              key: 'email',
              label: 'Email',
              value: '',
              valueType: 'string',
              required: true
            }
          ]
        },
        dependencies
      })
    ).document;
    expect(document.nodes.find((node) => node.nodeId === 'form')?.outputs).toContainEqual(
      expect.objectContaining({ key: 'email', valueType: 'string' })
    );

    const nested = await createNestedLoopFixture();
    await expect(
      applyWorkflowCommand({
        document: nested,
        command: { type: 'node.remove', nodeId: 'loop__start' },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
    await expect(
      applyWorkflowCommand({
        document: nested,
        command: { type: 'node.remove', nodeId: 'break' },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
  });
});
