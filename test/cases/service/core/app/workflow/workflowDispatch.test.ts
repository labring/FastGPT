import { readFileSync } from 'fs';
import { resolve } from 'path';
import { it, expect, vi, describe } from 'vitest';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import {
  getWorkflowEntryNodeIds,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { filterOrphanEdges } from '@fastgpt/service/core/workflow/dispatch/utils';
import type {
  RuntimeEdgeItemType,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';

vi.mock(import('@fastgpt/service/common/string/tiktoken'), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    countGptMessagesTokens: async () => {
      return 1;
    }
  };
});

vi.mock(import('@fastgpt/service/support/wallet/usage/utils'), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    formatModelChars2Points: () => ({
      modelName: 'test',
      totalPoints: 1
    })
  };
});

const testWorkflow = async (path: string) => {
  const fileContent = readFileSync(resolve(process.cwd(), path), 'utf-8');
  const workflow = JSON.parse(fileContent);
  console.log(workflow, 111);
  const { nodes, edges, chatConfig } = workflow;
  let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes));
  const variables = {};
  const { assistantResponses, flowResponses } = await dispatchWorkFlow({
    mode: 'test',
    usageSource: UsageSourceEnum.fastgpt,
    runningAppInfo: {
      id: 'test',
      name: 'test',
      teamId: 'test',
      tmbId: 'test'
    },
    runningUserInfo: {
      tmbId: 'test',
      teamId: 'test',
      username: 'test',
      teamName: 'test',
      memberName: 'test',
      contact: 'test'
    },
    uid: 'test',
    runtimeNodes,
    runtimeEdges: edges,
    variables,
    query: [
      {
        text: {
          content: '你是谁'
        }
      }
    ],
    chatConfig,
    histories: [],
    stream: false,
    maxRunTimes: 5
  });
  expect(assistantResponses).toBeDefined();
  expect(assistantResponses[0].text?.content).toBeDefined();
  return {
    assistantResponses,
    flowResponses
  };
};

describe('filterOrphanEdges Edge Cases & Performance', () => {
  it('should handle empty nodes array', () => {
    const nodes: RuntimeNodeItemType[] = [];
    const edges: RuntimeEdgeItemType[] = [
      { source: 'node1', target: 'node2', sourceHandle: 's', targetHandle: 't' } as any
    ];
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(filteredEdges.length).toBe(0);
  });

  it('should handle empty edges array', () => {
    const nodes: RuntimeNodeItemType[] = [
      { nodeId: 'node1', flowNodeType: 'test', inputs: [], outputs: [] } as any
    ];
    const edges: RuntimeEdgeItemType[] = [];
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(filteredEdges.length).toBe(0);
  });

  it('should handle no orphan edges', () => {
    const nodes: RuntimeNodeItemType[] = [
      { nodeId: 'n1', flowNodeType: 't', inputs: [], outputs: [] } as any,
      { nodeId: 'n2', flowNodeType: 't', inputs: [], outputs: [] } as any
    ];
    const edges: RuntimeEdgeItemType[] = [
      { source: 'n1', target: 'n2', sourceHandle: 's', targetHandle: 't' } as any
    ];
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(filteredEdges.length).toBe(1);
  });

  it('Performance test: 1000 nodes and edges', () => {
    const nodeCount = 1000;
    const nodes: RuntimeNodeItemType[] = [];
    const edges: RuntimeEdgeItemType[] = [];

    // Create 1000 nodes
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({ nodeId: `node${i}`, flowNodeType: 'test', inputs: [], outputs: [] } as any);
    }

    // Create edges: 50% valid, 50% orphan
    for (let i = 0; i < nodeCount; i++) {
      if (i % 2 === 0) {
        // Valid edge
        edges.push({
          source: `node${i}`,
          target: `node${(i + 1) % nodeCount}`,
          sourceHandle: 's',
          targetHandle: 't'
        } as any);
      } else {
        // Orphan edge
        edges.push({
          source: `node${i}`,
          target: `non-existent-node`,
          sourceHandle: 's',
          targetHandle: 't'
        } as any);
      }
    }

    const start = Date.now();
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'perf-test' });
    const duration = Date.now() - start;

    expect(filteredEdges.length).toBe(nodeCount / 2);
    // Performance check: should be very fast (e.g., < 50ms)
    // We log it instead of failing to avoid flaky tests on slow machines
    console.log(`Performance test took ${duration}ms for ${nodeCount} edges`);
    expect(duration).toBeLessThan(100);
  });
});

it('Workflow test: simple workflow', async () => {
  // create a simple app
  // await testWorkflow('test/cases/service/core/app/workflow/loopTest.json');
});

it('Workflow test: output test', async () => {
  // console.log(await testWorkflow('@/test/cases/workflow/loopTest.json'));
});
