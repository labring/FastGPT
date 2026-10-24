import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { StoreNodeItemTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import { LoopRunNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { ParallelRunNode } from '@fastgpt/global/core/workflow/template/system/parallelRun/parallelRun';
import { UserSelectNode } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { assertParentAssignment } from '../../src/nesting/service';
import { createWorkflowDocument } from '../../src/domain/document';
import { applyWorkflowCommand } from '../../src/command/apply';
import { builtinTemplateProvider } from '../template/provider';

const loop = StoreNodeItemTypeSchema.parse({ ...LoopRunNode, nodeId: 'loop' });
const parallel = StoreNodeItemTypeSchema.parse({
  ...ParallelRunNode,
  nodeId: 'parallel',
  parentNodeId: 'loop'
});

describe('parallelRun inside loopRun', () => {
  it('accepts the supported direction but preserves all other container restrictions', () => {
    const document = createWorkflowDocument({ nodes: [loop, parallel] });
    expect(() =>
      assertParentAssignment({ document, node: parallel, parentNodeId: 'loop' })
    ).not.toThrow();
    expect(() =>
      assertParentAssignment({ document, node: loop, parentNodeId: 'parallel' })
    ).toThrow();
    expect(() =>
      assertParentAssignment({ document, node: parallel, parentNodeId: 'parallel' })
    ).toThrow();
    expect(() =>
      assertParentAssignment({
        document,
        node: StoreNodeItemTypeSchema.parse({ ...UserSelectNode, nodeId: 'interactive' }),
        parentNodeId: 'parallel'
      })
    ).toThrow();
  });

  it('creates required parallel children and removes the complete subtree with the loop', async () => {
    const dependencies = { templateProvider: builtinTemplateProvider };
    const added = await applyWorkflowCommand({
      document: createWorkflowDocument({ nodes: [loop] }),
      command: {
        type: 'node.add',
        nodeId: 'parallel',
        parentNodeId: 'loop',
        template: { kind: 'builtin', templateId: 'parallel-run' }
      },
      dependencies
    });
    const parallelNode = added.document.nodes.find((n) => n.nodeId === 'parallel')!;
    expect(parallelNode.flowNodeType).toBe(FlowNodeTypeEnum.parallelRun);
    expect(parallelNode.parentNodeId).toBe('loop');
    const children = parallelNode.inputs.find(
      (i) => i.key === NodeInputKeyEnum.childrenNodeIdList
    )?.value;
    expect(children).toEqual(['parallel__start', 'parallel__end']);
    expect(added.document.nodes.find((n) => n.nodeId === 'parallel__start')?.parentNodeId).toBe(
      'parallel'
    );
    const removed = await applyWorkflowCommand({
      document: added.document,
      command: { type: 'node.remove', nodeId: 'loop' },
      dependencies
    });
    expect(removed.document.nodes).toEqual([]);
  });
});
