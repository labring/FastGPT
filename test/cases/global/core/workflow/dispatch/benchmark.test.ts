import { describe, it, expect } from 'vitest';
import { WorkflowQueue } from '@fastgpt/service/core/workflow/dispatch/index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

/**
 * 性能测试：buildEdgeIndex 和 buildNodeEdgeGroupsMap
 *
 * 测试目标：
 * 1. 测试不同规模工作流的性能表现
 * 2. 验证算法的时间复杂度
 * 3. 确保性能在可接受范围内
 */

// 辅助函数：创建节点
function createNode(
  id: string,
  type: FlowNodeTypeEnum = FlowNodeTypeEnum.chatNode
): RuntimeNodeItemType {
  return {
    nodeId: id,
    name: `Node ${id}`,
    flowNodeType: type,
    avatar: '',
    intro: '',
    isEntry: false,
    inputs: [],
    outputs: []
  };
}

// 辅助函数：创建边
function createEdge(
  source: string,
  target: string,
  status: 'waiting' | 'active' | 'skipped' = 'waiting',
  sourceHandle?: string,
  targetHandle?: string
): RuntimeEdgeItemType {
  return {
    source,
    target,
    status,
    sourceHandle: sourceHandle || `${source}-source-right`,
    targetHandle: targetHandle || `${target}-target-left`
  };
}

// 生成线性工作流：start → N1 → N2 → ... → Nn
function generateLinearWorkflow(nodeCount: number) {
  const nodes: RuntimeNodeItemType[] = [createNode('start', FlowNodeTypeEnum.workflowStart)];
  const edges: RuntimeEdgeItemType[] = [];

  for (let i = 1; i <= nodeCount; i++) {
    nodes.push(createNode(`N${i}`));
    edges.push(createEdge(i === 1 ? 'start' : `N${i - 1}`, `N${i}`));
  }

  return { nodes, edges };
}

// 生成分支工作流：每个节点有 branchCount 个分支
function generateBranchWorkflow(depth: number, branchCount: number) {
  const nodes: RuntimeNodeItemType[] = [createNode('start', FlowNodeTypeEnum.workflowStart)];
  const edges: RuntimeEdgeItemType[] = [];
  let nodeCounter = 0;

  function addLevel(parentId: string, currentDepth: number) {
    if (currentDepth >= depth) return;

    for (let i = 0; i < branchCount; i++) {
      const nodeId = `N${++nodeCounter}`;
      nodes.push(createNode(nodeId, FlowNodeTypeEnum.ifElseNode));
      edges.push(createEdge(parentId, nodeId, 'waiting', `${parentId}-source-branch${i}`));
      addLevel(nodeId, currentDepth + 1);
    }
  }

  addLevel('start', 0);
  return { nodes, edges };
}

// 生成循环工作流：包含多个循环
function generateCyclicWorkflow(nodeCount: number, cycleCount: number) {
  const nodes: RuntimeNodeItemType[] = [createNode('start', FlowNodeTypeEnum.workflowStart)];
  const edges: RuntimeEdgeItemType[] = [];

  // 创建主链
  for (let i = 1; i <= nodeCount; i++) {
    nodes.push(createNode(`N${i}`));
    edges.push(createEdge(i === 1 ? 'start' : `N${i - 1}`, `N${i}`));
  }

  // 添加循环边
  for (let i = 0; i < cycleCount; i++) {
    const cycleStart = Math.floor((nodeCount / cycleCount) * i) + 1;
    const cycleEnd = Math.floor((nodeCount / cycleCount) * (i + 1));
    if (cycleStart < cycleEnd) {
      edges.push(createEdge(`N${cycleEnd}`, `N${cycleStart}`));
    }
  }

  return { nodes, edges };
}

// 生成复杂工作流：混合分支、循环、汇聚
function generateComplexWorkflow(nodeCount: number) {
  const nodes: RuntimeNodeItemType[] = [createNode('start', FlowNodeTypeEnum.workflowStart)];
  const edges: RuntimeEdgeItemType[] = [];

  // 创建多层结构
  const layerSize = Math.ceil(Math.sqrt(nodeCount));
  let nodeCounter = 0;

  for (let layer = 0; layer < layerSize && nodeCounter < nodeCount; layer++) {
    const nodesInLayer = Math.min(layerSize, nodeCount - nodeCounter);

    for (let i = 0; i < nodesInLayer; i++) {
      const nodeId = `N${++nodeCounter}`;
      const nodeType = i % 3 === 0 ? FlowNodeTypeEnum.ifElseNode : FlowNodeTypeEnum.chatNode;
      nodes.push(createNode(nodeId, nodeType));

      // 连接到上一层的节点
      if (layer === 0) {
        edges.push(createEdge('start', nodeId));
      } else {
        const prevLayerStart =
          nodeCounter -
          nodesInLayer -
          Math.min(layerSize, nodeCount - (nodeCounter - nodesInLayer));
        const prevLayerEnd = nodeCounter - nodesInLayer;

        // 每个节点连接到上一层的 1-2 个节点
        const connectCount = Math.min(2, prevLayerEnd - prevLayerStart);
        for (let j = 0; j < connectCount; j++) {
          const sourceIdx = prevLayerStart + ((i + j) % (prevLayerEnd - prevLayerStart));
          edges.push(createEdge(`N${sourceIdx}`, nodeId));
        }
      }
    }

    // 添加一些循环边
    if (layer > 0 && layer % 2 === 0) {
      const cycleSource = nodeCounter;
      const cycleTarget = Math.max(1, nodeCounter - layerSize);
      edges.push(createEdge(`N${cycleSource}`, `N${cycleTarget}`));
    }
  }

  return { nodes, edges };
}

// 性能测试辅助函数
function measurePerformance(name: string, fn: () => void, iterations: number = 1) {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  return { avg, min, max, times };
}

describe('Workflow Performance Benchmark', () => {
  describe('buildEdgeIndex 性能测试', () => {
    it('小规模工作流 (10 节点)', () => {
      const { nodes, edges } = generateLinearWorkflow(10);
      const result = measurePerformance(
        'buildEdgeIndex - 10 nodes',
        () => WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges }),
        100
      );

      console.log(`\n[buildEdgeIndex - 10 nodes]`);
      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(1); // 应该小于 1ms
    });

    it('中等规模工作流 (100 节点)', () => {
      const { nodes, edges } = generateLinearWorkflow(100);
      const result = measurePerformance(
        'buildEdgeIndex - 100 nodes',
        () => WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges }),
        100
      );

      console.log(`\n[buildEdgeIndex - 100 nodes]`);
      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(5); // 应该小于 5ms
    });

    it('大规模工作流 (1000 节点)', () => {
      const { nodes, edges } = generateLinearWorkflow(1000);
      const result = measurePerformance(
        'buildEdgeIndex - 1000 nodes',
        () => WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges }),
        10
      );

      console.log(`\n[buildEdgeIndex - 1000 nodes]`);
      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(50); // 应该小于 50ms
    });
  });

  describe('buildNodeEdgeGroupsMap 性能测试', () => {
    it('小规模线性工作流 (10 节点)', () => {
      const { nodes, edges } = generateLinearWorkflow(10);
      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

      const result = measurePerformance(
        'buildNodeEdgeGroupsMap - 10 nodes linear',
        () =>
          WorkflowQueue.buildNodeEdgeGroupsMap({
            runtimeNodes: nodes,
            edgeIndex
          }),
        100
      );

      console.log(`\n[buildNodeEdgeGroupsMap - 10 nodes linear]`);
      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(5); // 应该小于 5ms
    });

    it('中等规模线性工作流 (100 节点)', () => {
      const { nodes, edges } = generateLinearWorkflow(100);
      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

      const result = measurePerformance(
        'buildNodeEdgeGroupsMap - 100 nodes linear',
        () =>
          WorkflowQueue.buildNodeEdgeGroupsMap({
            runtimeNodes: nodes,
            edgeIndex
          }),
        10
      );

      console.log(`\n[buildNodeEdgeGroupsMap - 100 nodes linear]`);
      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(50); // 应该小于 50ms
    });

    it('小规模分支工作流 (深度5, 每层2分支)', () => {
      const { nodes, edges } = generateBranchWorkflow(5, 2);
      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

      console.log(`\n[分支工作流] 节点数: ${nodes.length}, 边数: ${edges.length}`);

      const result = measurePerformance(
        'buildNodeEdgeGroupsMap - branch workflow',
        () =>
          WorkflowQueue.buildNodeEdgeGroupsMap({
            runtimeNodes: nodes,
            edgeIndex
          }),
        10
      );

      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(100); // 应该小于 100ms
    });

    it('循环工作流 (50 节点, 5 个循环)', () => {
      const { nodes, edges } = generateCyclicWorkflow(50, 5);
      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

      console.log(`\n[循环工作流] 节点数: ${nodes.length}, 边数: ${edges.length}`);

      const result = measurePerformance(
        'buildNodeEdgeGroupsMap - cyclic workflow',
        () =>
          WorkflowQueue.buildNodeEdgeGroupsMap({
            runtimeNodes: nodes,
            edgeIndex
          }),
        10
      );

      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(100); // 应该小于 100ms
    });

    it('复杂工作流 (100 节点, 混合结构)', () => {
      const { nodes, edges } = generateComplexWorkflow(100);
      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

      console.log(`\n[复杂工作流] 节点数: ${nodes.length}, 边数: ${edges.length}`);

      const result = measurePerformance(
        'buildNodeEdgeGroupsMap - complex workflow',
        () =>
          WorkflowQueue.buildNodeEdgeGroupsMap({
            runtimeNodes: nodes,
            edgeIndex
          }),
        10
      );

      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(200); // 应该小于 200ms
    });
  });

  describe('完整流程性能测试', () => {
    it('小规模工作流完整流程 (10 节点)', () => {
      const { nodes, edges } = generateLinearWorkflow(10);

      const result = measurePerformance(
        'Complete workflow - 10 nodes',
        () => {
          const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
          WorkflowQueue.buildNodeEdgeGroupsMap({
            runtimeNodes: nodes,
            edgeIndex
          });
        },
        100
      );

      console.log(`\n[完整流程 - 10 nodes]`);
      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(10); // 应该小于 10ms
    });

    it('中等规模工作流完整流程 (100 节点)', () => {
      const { nodes, edges } = generateLinearWorkflow(100);

      const result = measurePerformance(
        'Complete workflow - 100 nodes',
        () => {
          const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
          WorkflowQueue.buildNodeEdgeGroupsMap({
            runtimeNodes: nodes,
            edgeIndex
          });
        },
        10
      );

      console.log(`\n[完整流程 - 100 nodes]`);
      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(100); // 应该小于 100ms
    });

    it('复杂工作流完整流程 (100 节点)', () => {
      const { nodes, edges } = generateComplexWorkflow(100);

      const result = measurePerformance(
        'Complete workflow - complex 100 nodes',
        () => {
          const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
          WorkflowQueue.buildNodeEdgeGroupsMap({
            runtimeNodes: nodes,
            edgeIndex
          });
        },
        10
      );

      console.log(`\n[完整流程 - complex 100 nodes]`);
      console.log(`  平均耗时: ${result.avg.toFixed(3)}ms`);
      console.log(`  最小耗时: ${result.min.toFixed(3)}ms`);
      console.log(`  最大耗时: ${result.max.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(200); // 应该小于 200ms
    });
  });

  describe('扩展性测试', () => {
    it('测试不同规模的性能增长', () => {
      const scales = [10, 50, 100, 200, 500];
      const results: Array<{ scale: number; time: number }> = [];

      console.log(`\n[扩展性测试]`);
      console.log(`规模\t节点数\t边数\t平均耗时(ms)`);
      console.log(`----\t------\t----\t------------`);

      for (const scale of scales) {
        const { nodes, edges } = generateLinearWorkflow(scale);
        const result = measurePerformance(
          `Scale ${scale}`,
          () => {
            const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
            WorkflowQueue.buildNodeEdgeGroupsMap({
              runtimeNodes: nodes,
              edgeIndex
            });
          },
          5
        );

        results.push({ scale, time: result.avg });
        console.log(`${scale}\t${nodes.length}\t${edges.length}\t${result.avg.toFixed(3)}`);
      }

      // 验证时间复杂度接近线性
      // 计算增长率
      for (let i = 1; i < results.length; i++) {
        const scaleRatio = results[i].scale / results[i - 1].scale;
        const timeRatio = results[i].time / results[i - 1].time;

        // 时间增长率应该接近规模增长率（线性复杂度）
        // 允许一定的误差范围（例如 2 倍）
        expect(timeRatio).toBeLessThan(scaleRatio * 2);
      }
    });
  });

  describe('内存使用测试', () => {
    it('测试大规模工作流的内存占用', () => {
      const { nodes, edges } = generateComplexWorkflow(500);

      // 记录初始内存
      if (global.gc) {
        global.gc();
      }
      const initialMemory = process.memoryUsage().heapUsed;

      // 执行构建
      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const nodeEdgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      // 记录最终内存
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`\n[内存使用测试 - 500 nodes]`);
      console.log(`  节点数: ${nodes.length}`);
      console.log(`  边数: ${edges.length}`);
      console.log(`  内存增长: ${memoryIncrease.toFixed(2)} MB`);
      console.log(`  平均每节点: ${(memoryIncrease / nodes.length).toFixed(3)} MB`);

      // 验证内存使用合理（每个节点平均不超过 1MB）
      expect(memoryIncrease / nodes.length).toBeLessThan(1);
    });
  });
});
