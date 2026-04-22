import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowQueue } from '@fastgpt/service/core/workflow/dispatch/index';
import { createNode, createEdge } from '../utils';

describe('WorkflowQueue', () => {
  describe('WorkflowQueue utils', () => {
    // buildNodeEdgeGroupsMap 已经单独写了
    describe('buildEdgeIndex', () => {
      it('应该正确构建空边列表的索引', () => {
        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: [] });

        expect(result.bySource.size).toBe(0);
        expect(result.byTarget.size).toBe(0);
      });

      it('应该正确构建单条边的索引', () => {
        const edges = [createEdge('A', 'B', 'waiting')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('A')?.[0]).toEqual(edges[0]);
        expect(result.byTarget.get('B')).toHaveLength(1);
        expect(result.byTarget.get('B')?.[0]).toEqual(edges[0]);
      });

      it('应该正确构建多条边的索引 (A→B, B→C)', () => {
        const edges = [createEdge('A', 'B', 'waiting'), createEdge('B', 'C', 'active')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('B')).toHaveLength(1);
        expect(result.byTarget.get('B')).toHaveLength(1);
        expect(result.byTarget.get('C')).toHaveLength(1);
      });

      it('应该正确处理一个节点有多条输出边 (A→B, A→C)', () => {
        const edges = [createEdge('A', 'B', 'waiting'), createEdge('A', 'C', 'active')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(2);
        expect(result.byTarget.get('B')).toHaveLength(1);
        expect(result.byTarget.get('C')).toHaveLength(1);
      });

      it('应该正确处理一个节点有多条输入边 (A→C, B→C)', () => {
        const edges = [createEdge('A', 'C', 'waiting'), createEdge('B', 'C', 'active')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('B')).toHaveLength(1);
        expect(result.byTarget.get('C')).toHaveLength(2);
      });

      it('应该过滤掉 selectedTools 相关的边', () => {
        const edges = [
          createEdge('A', 'B', 'waiting'),
          createEdge('A', 'C', 'active', 'selectedTools', 'target-left'),
          createEdge('D', 'E', 'waiting', 'source-right', 'selectedTools')
        ];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        // 只有第一条边应该被索引
        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('A')?.[0].target).toBe('B');
        expect(result.bySource.has('D')).toBe(false);
        expect(result.byTarget.has('C')).toBe(false);
        expect(result.byTarget.has('E')).toBe(false);
      });

      it('应该正确处理循环边 (A→B→A)', () => {
        const edges = [createEdge('A', 'B', 'active'), createEdge('B', 'A', 'waiting')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('B')).toHaveLength(1);
        expect(result.byTarget.get('A')).toHaveLength(1);
        expect(result.byTarget.get('B')).toHaveLength(1);
      });

      it('应该正确处理复杂图结构', () => {
        const edges = [
          createEdge('A', 'B', 'active'),
          createEdge('A', 'C', 'active'),
          createEdge('B', 'D', 'waiting'),
          createEdge('C', 'D', 'waiting'),
          createEdge('D', 'E', 'skipped')
        ];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(2);
        expect(result.bySource.get('B')).toHaveLength(1);
        expect(result.bySource.get('C')).toHaveLength(1);
        expect(result.bySource.get('D')).toHaveLength(1);
        expect(result.byTarget.get('D')).toHaveLength(2);
      });
    });

    describe('getNodeRunStatus', () => {
      it('应该返回 run - 入口节点无输入边', () => {
        const node = createNode('A', FlowNodeTypeEnum.workflowStart);
        const nodeEdgeGroupsMap = new Map();

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 节点有空的边分组', () => {
        const node = createNode('A', FlowNodeTypeEnum.pluginInput);
        const nodeEdgeGroupsMap = new Map([['A', []]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 单组边中有 active 且无 waiting', () => {
        const node = createNode('B', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'B', 'active')];
        const nodeEdgeGroupsMap = new Map([['B', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 单组边中有多个 active 且无 waiting', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'active'), createEdge('B', 'C', 'active')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 单组边中有 active 和 skipped，无 waiting', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'active'), createEdge('B', 'C', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 多组边中任意一组满足条件（有 active 无 waiting）', () => {
        const node = createNode('D', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'D', 'waiting')];
        const group2 = [createEdge('B', 'D', 'active'), createEdge('C', 'D', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['D', [group1, group2]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 skip - 单组边全部为 skipped', () => {
        const node = createNode('B', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'B', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['B', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('skip');
      });

      it('应该返回 skip - 单组边中多条边全部为 skipped', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'skipped'), createEdge('B', 'C', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('skip');
      });

      it('应该返回 skip - 多组边中任意一组全部为 skipped', () => {
        const node = createNode('D', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'D', 'waiting')];
        const group2 = [createEdge('B', 'D', 'skipped'), createEdge('C', 'D', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['D', [group1, group2]]]);
        console.log(nodeEdgeGroupsMap);
        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 单组边全部为 waiting', () => {
        const node = createNode('B', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'B', 'waiting')];
        const nodeEdgeGroupsMap = new Map([['B', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 单组边中有 waiting 无 active', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'waiting'), createEdge('B', 'C', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 单组边中有 active 但也有 waiting', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'active'), createEdge('B', 'C', 'waiting')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 多组边都不满足 run 或 skip 条件', () => {
        const node = createNode('D', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'D', 'waiting')];
        const group2 = [createEdge('B', 'D', 'waiting'), createEdge('C', 'D', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['D', [group1, group2]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 多组边中有 active+waiting 组合', () => {
        const node = createNode('D', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'D', 'active'), createEdge('B', 'D', 'waiting')];
        const group2 = [createEdge('C', 'D', 'waiting')];
        const nodeEdgeGroupsMap = new Map([['D', [group1, group2]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('边界情况 - 空边组应该返回 skip（空数组的 every 返回 true）', () => {
        const node = createNode('A', FlowNodeTypeEnum.pluginInput);
        const nodeEdgeGroupsMap = new Map([['A', [[]]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        // 空数组的 every() 总是返回 true，所以 group.every(edge => edge.status === 'skipped') 为 true
        expect(result).toBe('skip');
      });

      it('复杂场景 - 三组边的优先级判断', () => {
        const node = createNode('E', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'E', 'waiting')]; // wait
        const group2 = [createEdge('B', 'E', 'skipped'), createEdge('C', 'E', 'skipped')]; // skip
        const group3 = [createEdge('D', 'E', 'active')]; // run
        const nodeEdgeGroupsMap = new Map([['E', [group1, group2, group3]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        // 任意一组满足 run 条件即返回 run
        expect(result).toBe('run');
      });
    });
  });
});
