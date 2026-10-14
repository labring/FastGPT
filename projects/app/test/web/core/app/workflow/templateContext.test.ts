import { describe, expect, it } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  createHideInContext,
  createShowInContext,
  getNodeContainerCheckError,
  isNodeConnectionAllowed,
  isTemplateAddable,
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
import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import type { NodeTemplateContext } from '@fastgpt/global/core/workflow/type/node';

const ctx = (patch: Partial<NodeTemplateContext>): NodeTemplateContext => ({
  isSidebar: false,
  sourceNodeId: 'n1',
  sourceType: null,
  isConnectedTool: false,
  handleId: null,
  parentType: null,
  hasToolNode: false,
  hasLoopRunNode: false,
  takenUniqueTypes: [],
  ...patch
});

describe('template context', () => {
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

  it('unique 模板只在根作用域且未被占用时提供', () => {
    // 根作用域已有「流程开始」：目录不再提供，画布上只会存在一个开始节点。
    expect(
      isTemplateAddable(
        WorkflowStart,
        ctx({ isSidebar: true, takenUniqueTypes: [FlowNodeTypeEnum.workflowStart] })
      )
    ).toBe(false);
    // 容器作用域的 takenUniqueTypes 只统计容器内系统子节点，根级唯一节点必须直接隐藏，
    // 否则容器内点 handle 展开的快捷添加面板会出现「流程开始」。
    expect(
      isTemplateAddable(
        WorkflowStart,
        ctx({
          parentType: FlowNodeTypeEnum.loopRun,
          takenUniqueTypes: [FlowNodeTypeEnum.loopRunStart]
        })
      )
    ).toBe(false);
    // 建不出上下文时同样不提供。
    expect(isTemplateAddable(WorkflowStart, null)).toBe(false);
    // 根作用域没有开始节点（异常文档）时仍提供，保留修复入口。
    expect(isTemplateAddable(WorkflowStart, ctx({ isSidebar: true }))).toBe(true);
    // 普通模板不受影响。
    expect(isTemplateAddable(AiChatModule, ctx({ parentType: FlowNodeTypeEnum.loopRun }))).toBe(
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

  it('连接 ToolParams 时复用模板上下文白名单', () => {
    const targetNode = { parentNodeId: undefined };
    const connect = (context: NodeTemplateContext | null) =>
      isNodeConnectionAllowed({
        context,
        targetTemplate: ToolParamsNode,
        targetNode,
        sourceParentNodeId: undefined
      });

    expect(
      connect(
        ctx({ sourceType: FlowNodeTypeEnum.toolCall, handleId: NodeOutputKeyEnum.selectedTools })
      )
    ).toBe(true);
    // 普通输出 handle 不匹配 toolParams 的白名单规则。
    expect(connect(ctx({ sourceType: FlowNodeTypeEnum.toolCall, handleId: 'x' }))).toBe(false);
    // 来源不是工具调用时同样拒绝。
    expect(
      connect(
        ctx({ sourceType: FlowNodeTypeEnum.aiChat, handleId: NodeOutputKeyEnum.selectedTools })
      )
    ).toBe(false);
  });

  it('连接节点必须属于同一容器并满足容器规则', () => {
    const parallelContext = ctx({ parentType: FlowNodeTypeEnum.parallelRun });
    const connect = (targetNode: { parentNodeId?: string }, sourceParentNodeId?: string) =>
      isNodeConnectionAllowed({
        context: parallelContext,
        targetTemplate: UserSelectNode,
        targetNode,
        sourceParentNodeId
      });

    // 交互节点不能进 parallelRun。
    expect(connect({ parentNodeId: 'parallel' }, 'parallel')).toBe(false);
    // 跨容器一律拒绝。
    expect(connect({ parentNodeId: 'other' }, 'parallel')).toBe(false);
    expect(connect({ parentNodeId: 'parallel' }, undefined)).toBe(false);
    // 建不出上下文时只剩同容器约束：调用方把 null 当「允许」。
    expect(
      isNodeConnectionAllowed({
        context: null,
        targetTemplate: UserSelectNode,
        targetNode: { parentNodeId: 'parallel' },
        sourceParentNodeId: 'parallel'
      })
    ).toBe(true);
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
