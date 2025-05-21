import MyBox from '@fastgpt/web/components/common/MyBox';
import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../context';
import { EDGE_TYPE } from '@fastgpt/global/core/workflow/node/constant';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'react-i18next';
import { useReactFlow } from 'reactflow';
import { useWorkflowUtils } from './hooks/useUtils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { WorkflowInitContext, WorkflowNodeEdgeContext } from '../context/workflowInitContext';
import { useMemoizedFn } from 'ahooks';
import { nanoid } from 'nanoid';
import TemplateHeader from './components/NodeTemplates/header';
import TemplateList from './components/NodeTemplates/list';
import { createNodeTemplate } from '../utils';
import { WorkflowEventContext } from '../context/workflowEventContext';

const NodeTemplatesPopover = () => {
  const handleParams = useContextSelector(WorkflowEventContext, (v) => v.handleParams);
  const setHandleParams = useContextSelector(WorkflowEventContext, (v) => v.setHandleParams);
  const { templatesIsLoading: isLoading } = useContextSelector(WorkflowContext, (state) => ({
    templatesIsLoading: state.templatesIsLoading
  }));

  const { t } = useTranslation();

  const { flowToScreenPosition, getZoom, screenToFlowPosition } = useReactFlow();
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setNodes);
  const setEdges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setEdges);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const { computedNewNodeName } = useWorkflowUtils();
  const { setLoading } = useSystemStore();
  const { toast } = useToast();

  const popoverPosition = useMemo(() => {
    if (!handleParams?.nodeId) return { x: 0, y: 0 };
    const currentNodeData = nodes.find((node) => node.id === handleParams?.nodeId);
    if (!currentNodeData) return { x: 0, y: 0 };

    const position = flowToScreenPosition({
      x: currentNodeData.position.x,
      y: currentNodeData.position.y
    });

    const zoom = getZoom();

    return {
      x: position.x + (currentNodeData.width || 0) * zoom,
      y: position.y
    };
  }, [handleParams?.nodeId, flowToScreenPosition, nodes, getZoom]);

  const onAddNode = useMemoizedFn(async ({ template }: { template: NodeTemplateListItemType }) => {
    const isToolHandle = handleParams?.handleId === 'selectedTools';

    const nodePosition = screenToFlowPosition({
      x: popoverPosition.x + 80,
      y: popoverPosition.y
    });

    const newNodes = await createNodeTemplate({
      template,
      position: nodePosition,
      t,
      setLoading,
      toast,
      computedNewNodeName,
      nodeList
    });

    setNodes((state) => {
      const newState = state
        .map((node) => ({
          ...node,
          selected: false
        }))
        // @ts-ignore
        .concat(newNodes);
      return newState;
    });

    if (!handleParams) return;

    const newEdges = newNodes.map((node) => ({
      id: nanoid(16),
      source: handleParams.nodeId as string,
      sourceHandle: handleParams.handleId,
      target: node.id,
      targetHandle: isToolHandle ? 'selectedTools' : `${node.id}-target-left`,
      type: EDGE_TYPE
    }));

    setEdges((state) => {
      const newState = state.concat(newEdges);
      return newState;
    });

    setHandleParams(null);
  });

  return (
    <MyBox
      isLoading={isLoading}
      display={'flex'}
      zIndex={3}
      flexDirection={'column'}
      position={'absolute'}
      top={popoverPosition ? `${popoverPosition.y}px` : '10px'}
      left={popoverPosition ? `${popoverPosition.x}px` : 0}
      pt={5}
      pb={4}
      h={!!handleParams ? '600px' : '0'}
      w={!!handleParams ? '400px' : '0'}
      bg={'white'}
      boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
      rounded={'2xl'}
      userSelect={'none'}
      overflow={!!handleParams ? 'none' : 'hidden'}
    >
      <TemplateHeader onClose={() => setHandleParams(null)} isPopover={true} />
      <TemplateList onAddNode={onAddNode} isPopover={true} />
    </MyBox>
  );
};

export default React.memo(NodeTemplatesPopover);
