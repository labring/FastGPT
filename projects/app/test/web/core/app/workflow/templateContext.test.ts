import { describe, expect, it } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  buildNodeTemplateContext,
  createHideInContext,
  createShowInContext,
  getNodeContainerCheckError,
  isTemplateVisible
} from '@fastgpt/global/core/workflow/template/context';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { DatasetConcatModule } from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { LoopRunNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { LoopRunBreakNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunBreak';
import { ParallelRunNode } from '@fastgpt/global/core/workflow/template/system/parallelRun/parallelRun';
import { StopToolNode } from '@fastgpt/global/core/workflow/template/system/stopTool';
import { ToolParamsNode } from '@fastgpt/global/core/workflow/template/system/toolParams';
import { RunToolSetNode } from '@fastgpt/global/core/workflow/template/system/runToolSet';
import { UserSelectNode } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import type { NodeTemplateContext } from '@fastgpt/global/core/workflow/type/node';

const ctx = (patch: Partial<NodeTemplateContext>): NodeTemplateContext => ({
  isSidebar: false,
  sourceNodeId: 'n1',
  sourceType: null,
  sourceIsTool: false,
  isConnectedTool: false,
  handleId: null,
  parentType: null,
  hasToolNode: false,
  hasLoopRunNode: false,
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
      isSidebar: false,
      sourceNodeId: 'n1',
      sourceType: FlowNodeTypeEnum.toolParams,
      sourceIsTool: true,
      isConnectedTool: true,
      handleId: 'h',
      parentType: FlowNodeTypeEnum.loopRun,
      hasToolNode: false,
      hasLoopRunNode: false
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

  it('buildNodeTemplateContext：工具子流程后续节点保留 Stop Tool', () => {
    const result = buildNodeTemplateContext({
      sourceNode: {
        nodeId: 'n3',
        flowNodeType: FlowNodeTypeEnum.aiChat,
        isTool: false,
        parentNodeId: undefined
      },
      edges: [
        { source: 'toolCall', target: 'n1', targetHandle: NodeOutputKeyEnum.selectedTools },
        { source: 'n1', target: 'n2' },
        { source: 'n2', target: 'n3' }
      ],
      getNodeById: () => undefined
    });

    expect(result?.isConnectedTool).toBe(true);
    expect(isTemplateVisible(StopToolNode, result)).toBe(true);
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

  it('侧边栏按画布状态显示工具参数、工具终止和循环终止', () => {
    expect(isTemplateVisible(ToolParamsNode, ctx({ isSidebar: true }))).toBe(false);
    expect(isTemplateVisible(ToolParamsNode, ctx({ isSidebar: true, hasToolNode: true }))).toBe(
      true
    );
    expect(isTemplateVisible(StopToolNode, ctx({ isSidebar: true }))).toBe(false);
    expect(isTemplateVisible(StopToolNode, ctx({ isSidebar: true, hasToolNode: true }))).toBe(true);
    expect(isTemplateVisible(LoopRunBreakNode, ctx({ isSidebar: true }))).toBe(false);
    expect(
      isTemplateVisible(LoopRunBreakNode, ctx({ isSidebar: true, hasLoopRunNode: true }))
    ).toBe(true);
  });

  it('侧边栏拖入容器按目标容器属性判断', () => {
    // 容器内已有工具调用时，允许拖入工具终止/自定义工具变量
    expect(
      isTemplateVisible(
        StopToolNode,
        ctx({
          isSidebar: true,
          sourceNodeId: null,
          parentType: FlowNodeTypeEnum.loopRun,
          hasToolNode: true
        })
      )
    ).toBe(true);
    expect(
      isTemplateVisible(
        StopToolNode,
        ctx({ isSidebar: true, sourceNodeId: null, parentType: FlowNodeTypeEnum.loopRun })
      )
    ).toBe(false);
    expect(
      isTemplateVisible(
        ToolParamsNode,
        ctx({
          isSidebar: true,
          sourceNodeId: null,
          parentType: FlowNodeTypeEnum.parallelRun,
          hasToolNode: true
        })
      )
    ).toBe(true);
    // 循环终止按目标容器类型判断，不受画布是否有循环节点影响
    expect(
      isTemplateVisible(
        LoopRunBreakNode,
        ctx({ isSidebar: true, sourceNodeId: null, parentType: FlowNodeTypeEnum.loopRun })
      )
    ).toBe(true);
    expect(
      isTemplateVisible(
        LoopRunBreakNode,
        ctx({
          isSidebar: true,
          sourceNodeId: null,
          parentType: FlowNodeTypeEnum.parallelRun,
          hasLoopRunNode: true
        })
      )
    ).toBe(false);
  });

  it('画布与侧边栏共用容器加入校验', () => {
    const context = ctx({
      isSidebar: true,
      sourceNodeId: null,
      parentType: FlowNodeTypeEnum.parallelRun
    });

    expect(
      getNodeContainerCheckError({
        node: { flowNodeType: FlowNodeTypeEnum.workflowStart },
        context
      })
    ).toBe('can_not_parallel');
    expect(
      getNodeContainerCheckError({
        node: { flowNodeType: FlowNodeTypeEnum.userSelect },
        context
      })
    ).toBe('can_not_parallel');
    expect(
      getNodeContainerCheckError({
        node: LoopRunBreakNode,
        context
      })
    ).toBe('loop_run_break_must_inside_loop_run');
    expect(
      getNodeContainerCheckError({
        node: StopToolNode,
        context
      })
    ).toBe('can_not_add_inside_container');
    expect(
      getNodeContainerCheckError({
        node: StopToolNode,
        context: { ...context, hasToolNode: true }
      })
    ).toBeUndefined();
  });

  it('工具集仅在容器已有工具调用节点时可加入', () => {
    const context = ctx({
      isSidebar: true,
      sourceNodeId: null,
      parentType: FlowNodeTypeEnum.loopRun
    });

    expect(getNodeContainerCheckError({ node: RunToolSetNode, context })).toBe(
      'can_not_add_inside_container'
    );
    expect(
      getNodeContainerCheckError({
        node: RunToolSetNode,
        context: { ...context, hasToolNode: true }
      })
    ).toBeUndefined();
  });

  it('buildNodeTemplateContext 支持使用目标容器覆盖源节点容器', () => {
    const result = buildNodeTemplateContext({
      sourceNode: {
        nodeId: 'n1',
        flowNodeType: FlowNodeTypeEnum.aiChat,
        isTool: false,
        parentNodeId: 'loop1'
      },
      edges: [],
      targetParentType: FlowNodeTypeEnum.parallelRun,
      getNodeById: () =>
        ({
          nodeId: 'loop1',
          flowNodeType: FlowNodeTypeEnum.loopRun
        }) as any
    });

    expect(result?.parentType).toBe(FlowNodeTypeEnum.parallelRun);
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
