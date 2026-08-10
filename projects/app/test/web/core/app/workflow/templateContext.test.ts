import { describe, expect, it } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  buildNodeTemplateContext,
  createHideInContext,
  createShowInContext,
  isTemplateVisible
} from '@fastgpt/global/core/workflow/template/context';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { DatasetConcatModule } from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { LoopRunNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { LoopRunBreakNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunBreak';
import { ParallelRunNode } from '@fastgpt/global/core/workflow/template/system/parallelRun/parallelRun';
import { StopToolNode } from '@fastgpt/global/core/workflow/template/system/stopTool';
import { ToolParamsNode } from '@fastgpt/global/core/workflow/template/system/toolParams';
import { UserSelectNode } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import type { NodeTemplateContext } from '@fastgpt/global/core/workflow/type/node';

const ctx = (patch: Partial<NodeTemplateContext>): NodeTemplateContext => ({
  sourceNodeId: 'n1',
  sourceType: null,
  sourceIsTool: false,
  isConnectedTool: false,
  handleId: null,
  parentType: null,
  ...patch
});

describe('template context', () => {
  it('buildNodeTemplateContext：源节点不存在返回 null，字段正确映射', () => {
    const node = {
      nodeId: 'n1',
      flowNodeType: FlowNodeTypeEnum.toolParams,
      isTool: true,
      parentNodeId: 'loop1'
    };
    const loopNode = { nodeId: 'loop1', flowNodeType: FlowNodeTypeEnum.loopRun };
    const edges = [
      { target: 'n1', targetHandle: NodeOutputKeyEnum.selectedTools },
      { target: 'other', targetHandle: 'x' }
    ];

    expect(
      buildNodeTemplateContext({
        sourceNode: undefined,
        edges,
        handleId: 'h',
        getNodeById: () => undefined
      })
    ).toBeNull();

    const result = buildNodeTemplateContext({
      sourceNode: node,
      edges,
      handleId: 'h',
      getNodeById: (id) => (id === 'loop1' ? (loopNode as any) : undefined)
    });
    expect(result).toEqual({
      sourceNodeId: 'n1',
      sourceType: FlowNodeTypeEnum.toolParams,
      sourceIsTool: true,
      isConnectedTool: true,
      handleId: 'h',
      parentType: FlowNodeTypeEnum.loopRun
    });
  });

  it('buildNodeTemplateContext：未被工具调用挂载时 isConnectedTool 为 false', () => {
    const result = buildNodeTemplateContext({
      sourceNode: {
        nodeId: 'n1',
        flowNodeType: FlowNodeTypeEnum.aiChat,
        isTool: false,
        parentNodeId: undefined
      },
      edges: [{ target: 'n2', targetHandle: NodeOutputKeyEnum.selectedTools }],
      handleId: null,
      getNodeById: () => undefined
    });
    expect(result?.isConnectedTool).toBe(false);
    expect(result?.parentType).toBeNull();
  });

  it('工厂函数：白名单仅在匹配任一规则且上下文非空时可见', () => {
    const predicate = createShowInContext([
      { sourceType: FlowNodeTypeEnum.toolCall, handleId: NodeOutputKeyEnum.selectedTools },
      { parentType: FlowNodeTypeEnum.loopRun }
    ]);

    expect(predicate(null)).toBe(false);
    expect(predicate(ctx({ sourceType: FlowNodeTypeEnum.toolCall }))).toBe(false);
    expect(
      predicate(
        ctx({ sourceType: FlowNodeTypeEnum.toolCall, handleId: NodeOutputKeyEnum.selectedTools })
      )
    ).toBe(true);
    expect(predicate(ctx({ parentType: FlowNodeTypeEnum.loopRun }))).toBe(true);
  });

  it('工厂函数：黑名单在匹配任一规则时隐藏，ctx 为 null 时可见', () => {
    const predicate = createHideInContext([
      { sourceType: FlowNodeTypeEnum.toolCall, handleId: NodeOutputKeyEnum.selectedTools }
    ]);

    expect(predicate(null)).toBe(true);
    expect(predicate(ctx({ sourceType: FlowNodeTypeEnum.toolCall }))).toBe(true);
    expect(
      predicate(
        ctx({ sourceType: FlowNodeTypeEnum.toolCall, handleId: NodeOutputKeyEnum.selectedTools })
      )
    ).toBe(false);
  });

  it('未声明谓词的模板为顶级节点，处处可见', () => {
    expect(isTemplateVisible(AiChatModule, null)).toBe(true);
    expect(isTemplateVisible(AiChatModule, ctx({ sourceType: FlowNodeTypeEnum.toolCall }))).toBe(
      true
    );
  });

  it('toolParams 仅在工具调用底部（selectedTools）可见', () => {
    expect(isTemplateVisible(ToolParamsNode, null)).toBe(false);
    expect(
      isTemplateVisible(
        ToolParamsNode,
        ctx({ sourceType: FlowNodeTypeEnum.toolCall, handleId: NodeOutputKeyEnum.selectedTools })
      )
    ).toBe(true);
    expect(isTemplateVisible(ToolParamsNode, ctx({ sourceType: FlowNodeTypeEnum.toolCall }))).toBe(
      false
    );
  });

  it('stopTool 仅在已挂载工具节点（工具子流程）可见', () => {
    expect(isTemplateVisible(StopToolNode, null)).toBe(false);
    expect(isTemplateVisible(StopToolNode, ctx({ isConnectedTool: true }))).toBe(true);
    expect(isTemplateVisible(StopToolNode, ctx({ isConnectedTool: false }))).toBe(false);
  });

  it('datasetConcat 不在工具调用底部可见', () => {
    expect(isTemplateVisible(DatasetConcatModule, null)).toBe(true);
    expect(
      isTemplateVisible(
        DatasetConcatModule,
        ctx({ sourceType: FlowNodeTypeEnum.toolCall, handleId: NodeOutputKeyEnum.selectedTools })
      )
    ).toBe(false);
    expect(
      isTemplateVisible(DatasetConcatModule, ctx({ sourceType: FlowNodeTypeEnum.toolCall }))
    ).toBe(true);
  });

  it('loopRunBreak 仅在循环节点内部可见', () => {
    expect(isTemplateVisible(LoopRunBreakNode, null)).toBe(false);
    expect(isTemplateVisible(LoopRunBreakNode, ctx({ parentType: FlowNodeTypeEnum.loopRun }))).toBe(
      true
    );
    expect(
      isTemplateVisible(LoopRunBreakNode, ctx({ parentType: FlowNodeTypeEnum.parallelRun }))
    ).toBe(false);
  });

  it('userSelect 不在批量执行内部可见', () => {
    expect(isTemplateVisible(UserSelectNode, null)).toBe(true);
    expect(
      isTemplateVisible(UserSelectNode, ctx({ parentType: FlowNodeTypeEnum.parallelRun }))
    ).toBe(false);
    expect(isTemplateVisible(UserSelectNode, ctx({ parentType: FlowNodeTypeEnum.loopRun }))).toBe(
      true
    );
  });

  it('loopRun/parallelRun 不在嵌套容器内部可见', () => {
    expect(isTemplateVisible(LoopRunNode, null)).toBe(true);
    expect(isTemplateVisible(LoopRunNode, ctx({ parentType: FlowNodeTypeEnum.loopRun }))).toBe(
      false
    );
    expect(isTemplateVisible(LoopRunNode, ctx({ parentType: FlowNodeTypeEnum.parallelRun }))).toBe(
      false
    );
    expect(isTemplateVisible(ParallelRunNode, ctx({ parentType: FlowNodeTypeEnum.loopRun }))).toBe(
      false
    );
    expect(
      isTemplateVisible(ParallelRunNode, ctx({ parentType: FlowNodeTypeEnum.parallelRun }))
    ).toBe(false);
  });
});
