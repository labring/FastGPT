import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useWorkflowStore,
  syncEdgesZIndex,
  syncParentNodesZIndex
} from '@/pageComponents/app/detail/WorkflowComponents/store/useWorkflowStore';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { Edge } from '@xyflow/react';
import type { FastGPTWorkflowNode } from '@/pageComponents/app/detail/WorkflowComponents/context/type';

describe('useWorkflowStore', () => {
  beforeEach(() => {
    useWorkflowStore.getState().resetWorkflowStore();
  });

  describe('Node Slice', () => {
    const mockNode: FastGPTWorkflowNode = {
      id: 'node-1',
      type: FlowNodeTypeEnum.workflowStart,
      position: { x: 100, y: 100 },
      data: {
        nodeId: 'node-1',
        name: 'Start Node',
        avatar: 'avatar.png',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        showStatus: true,
        inputs: [],
        outputs: []
      }
    };

    it('should set nodes and retrieve by id', () => {
      useWorkflowStore.getState().setNodes([mockNode]);
      expect(useWorkflowStore.getState().nodes).toHaveLength(1);

      const found = useWorkflowStore.getState().getNodeById('node-1');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Start Node');

      const rawNode = useWorkflowStore.getState().getRawNodeById('node-1');
      expect(rawNode).toBeDefined();
      expect(rawNode?.id).toBe('node-1');
    });

    it('should update node data via object patch and functional updater', () => {
      useWorkflowStore.getState().setNodes([mockNode]);

      // Object patch
      useWorkflowStore.getState().updateNodeData('node-1', { name: 'Updated Start Node' });
      expect(useWorkflowStore.getState().getNodeById('node-1')?.name).toBe('Updated Start Node');

      // Functional updater
      useWorkflowStore.getState().updateNodeData('node-1', (prev) => ({
        name: `${prev.name} - Edited`
      }));
      expect(useWorkflowStore.getState().getNodeById('node-1')?.name).toBe(
        'Updated Start Node - Edited'
      );
    });

    it('should apply node changes', () => {
      useWorkflowStore.getState().setNodes([mockNode]);
      useWorkflowStore.getState().onNodesChange([
        {
          type: 'position',
          id: 'node-1',
          position: { x: 250, y: 300 }
        }
      ]);

      const node = useWorkflowStore.getState().getRawNodeById('node-1');
      expect(node?.position).toEqual({ x: 250, y: 300 });
    });
  });

  describe('Edge Slice', () => {
    it('should connect new edges via onConnect', () => {
      useWorkflowStore.getState().onConnect({
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'source-right',
        targetHandle: 'target-left'
      });

      expect(useWorkflowStore.getState().edges).toHaveLength(1);
      expect(useWorkflowStore.getState().edges[0]).toMatchObject({
        source: 'node-1',
        target: 'node-2'
      });
    });
  });

  describe('History / Snapshot Slice', () => {
    const nodeA: FastGPTWorkflowNode = {
      id: 'node-a',
      type: FlowNodeTypeEnum.workflowStart,
      position: { x: 0, y: 0 },
      data: {
        nodeId: 'node-a',
        name: 'Node A',
        avatar: '',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        showStatus: true,
        inputs: [],
        outputs: []
      }
    };

    const nodeB: FastGPTWorkflowNode = {
      id: 'node-b',
      type: FlowNodeTypeEnum.workflowStart,
      position: { x: 100, y: 100 },
      data: {
        nodeId: 'node-b',
        name: 'Node B',
        avatar: '',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        showStatus: true,
        inputs: [],
        outputs: []
      }
    };

    it('should push snapshots and support undo and redo', () => {
      const resetCallback = vi.fn();

      // Push state 1
      const saved1 = useWorkflowStore.getState().pushPastSnapshot({
        pastNodes: [nodeA],
        pastEdges: [],
        chatConfig: {} as any,
        customTitle: 'Snapshot 1'
      });
      expect(saved1).toBe(true);
      expect(useWorkflowStore.getState().past).toHaveLength(1);

      // Push state 2
      const saved2 = useWorkflowStore.getState().pushPastSnapshot({
        pastNodes: [nodeA, nodeB],
        pastEdges: [],
        chatConfig: {} as any,
        customTitle: 'Snapshot 2'
      });
      expect(saved2).toBe(true);
      expect(useWorkflowStore.getState().past).toHaveLength(2);

      // Undo -> restores state 1
      useWorkflowStore.getState().undo(resetCallback);
      expect(useWorkflowStore.getState().past).toHaveLength(1);
      expect(useWorkflowStore.getState().future).toHaveLength(1);
      expect(useWorkflowStore.getState().nodes).toEqual([nodeA]);
      expect(resetCallback).toHaveBeenCalledTimes(1);

      // Redo -> restores state 2
      useWorkflowStore.getState().redo(resetCallback);
      expect(useWorkflowStore.getState().past).toHaveLength(2);
      expect(useWorkflowStore.getState().future).toHaveLength(0);
      expect(useWorkflowStore.getState().nodes).toEqual([nodeA, nodeB]);
      expect(resetCallback).toHaveBeenCalledTimes(2);
    });

    it('should skip duplicate snapshots', () => {
      useWorkflowStore.getState().pushPastSnapshot({
        pastNodes: [nodeA],
        pastEdges: [],
        chatConfig: {} as any
      });
      expect(useWorkflowStore.getState().past).toHaveLength(1);

      // Push identical snapshot
      const savedAgain = useWorkflowStore.getState().pushPastSnapshot({
        pastNodes: [nodeA],
        pastEdges: [],
        chatConfig: {} as any
      });
      expect(savedAgain).toBe(false);
      expect(useWorkflowStore.getState().past).toHaveLength(1);
    });

    it('should reset all slices via resetWorkflowStore', () => {
      useWorkflowStore.getState().setNodes([nodeA]);
      useWorkflowStore.getState().setMenu({ top: 10, left: 10 });
      useWorkflowStore.getState().setPresentationMode(true);
      useWorkflowStore.getState().setPast([
        {
          nodes: [nodeA],
          edges: [],
          chatConfig: {} as any,
          title: 'test',
          isSaved: true
        }
      ]);

      useWorkflowStore.getState().resetWorkflowStore();

      expect(useWorkflowStore.getState().nodes).toEqual([]);
      expect(useWorkflowStore.getState().edges).toEqual([]);
      expect(useWorkflowStore.getState().menu).toBeNull();
      expect(useWorkflowStore.getState().presentationMode).toBe(false);
      expect(useWorkflowStore.getState().past).toEqual([]);
      expect(useWorkflowStore.getState().future).toEqual([]);
    });
  });

  describe('Z-Index Layering & Synchronization', () => {
    const parentNode: FastGPTWorkflowNode = {
      id: 'loop-parent',
      type: FlowNodeTypeEnum.loop,
      position: { x: 0, y: 0 },
      data: {
        nodeId: 'loop-parent',
        name: 'Loop Node',
        avatar: '',
        flowNodeType: FlowNodeTypeEnum.loop,
        showStatus: true,
        inputs: [],
        outputs: []
      }
    };

    const childNode1: FastGPTWorkflowNode = {
      id: 'child-1',
      type: FlowNodeTypeEnum.chatNode,
      position: { x: 50, y: 50 },
      zIndex: 2001,
      data: {
        nodeId: 'child-1',
        name: 'Child 1',
        avatar: '',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        parentNodeId: 'loop-parent',
        showStatus: true,
        inputs: [],
        outputs: []
      }
    };

    const childNode2: FastGPTWorkflowNode = {
      id: 'child-2',
      type: FlowNodeTypeEnum.chatNode,
      position: { x: 200, y: 50 },
      zIndex: 2001,
      data: {
        nodeId: 'child-2',
        name: 'Child 2',
        avatar: '',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        parentNodeId: 'loop-parent',
        showStatus: true,
        inputs: [],
        outputs: []
      }
    };

    const topNode: FastGPTWorkflowNode = {
      id: 'top-node',
      type: FlowNodeTypeEnum.workflowStart,
      position: { x: 500, y: 500 },
      data: {
        nodeId: 'top-node',
        name: 'Top Node',
        avatar: '',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        showStatus: true,
        inputs: [],
        outputs: []
      }
    };

    it('should assign zIndex: 2000 to edges connecting child nodes and undefined to top-level edges', () => {
      const edges: Edge[] = [
        {
          id: 'child-edge',
          source: 'child-1',
          target: 'child-2'
        },
        {
          id: 'top-edge',
          source: 'top-node',
          target: 'loop-parent'
        }
      ];

      const synced = syncEdgesZIndex(edges, [parentNode, childNode1, childNode2, topNode]);
      expect(synced.find((e) => e.id === 'child-edge')?.zIndex).toBe(2000);
      expect(synced.find((e) => e.id === 'top-edge')?.zIndex).toBeUndefined();
    });

    it('should dynamically sync edge zIndex when nodes are loaded into store', () => {
      useWorkflowStore.getState().initWorkflowStore({
        nodes: [parentNode, childNode1, childNode2],
        edges: [
          {
            id: 'child-edge',
            source: 'child-1',
            target: 'child-2'
          }
        ]
      });

      const storeEdges = useWorkflowStore.getState().edges;
      expect(storeEdges[0].zIndex).toBe(2000);
    });

    it('should elevate parent node zIndex when child is selected or dragging and restore when inactive', () => {
      const activeChild: FastGPTWorkflowNode = {
        ...childNode1,
        selected: true
      };

      const nodesWithActiveChild = syncParentNodesZIndex([parentNode, activeChild]);
      expect(nodesWithActiveChild.find((n) => n.id === 'loop-parent')?.zIndex).toBe(1000);

      const inactiveChild: FastGPTWorkflowNode = {
        ...childNode1,
        selected: false,
        dragging: false
      };
      const nodesWithInactiveChild = syncParentNodesZIndex([parentNode, inactiveChild]);
      expect(nodesWithInactiveChild.find((n) => n.id === 'loop-parent')?.zIndex).toBe(0);
    });
  });
});
