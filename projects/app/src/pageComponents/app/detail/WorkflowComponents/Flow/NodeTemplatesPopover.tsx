import MyBox from '@fastgpt/web/components/common/MyBox';
import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../context';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'react-i18next';
import { useReactFlow } from 'reactflow';
import { useWorkflowUtils } from './hooks/useUtils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { WorkflowInitContext, WorkflowNodeEdgeContext } from '../context/workflowInitContext';
import { useMemoizedFn } from 'ahooks';
import { nanoid } from 'nanoid';
import NodeTemplateListHeader, { TemplateTypeEnum } from './components/NodeTemplates/header';
import NodeTemplateList from './components/NodeTemplates/list';
import { createNodeTemplate } from '../utils';
import { Popover, PopoverContent, PopoverBody } from '@chakra-ui/react';
import { WorkflowEventContext } from '../context/workflowEventContext';

const popoverWidth = 400;
const popoverHeight = 600;

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
  const setTemplateType = useContextSelector(WorkflowContext, (v) => v.setTemplateType);
  const setParentId = useContextSelector(WorkflowContext, (v) => v.setParentId);
  const { computedNewNodeName } = useWorkflowUtils();
  const { setLoading } = useSystemStore();
  const { toast } = useToast();

  const currentNodeData = useMemo(() => {
    if (!handleParams?.nodeId) return null;
    return nodes.find((node) => node.id === handleParams.nodeId) || null;
  }, [handleParams?.nodeId, nodes]);

  const popoverPosition = useMemo(() => {
    if (!currentNodeData) return { x: 0, y: 0 };

    const position = flowToScreenPosition({
      x: currentNodeData.position.x,
      y: currentNodeData.position.y
    });

    const zoom = getZoom();

    let x = position.x + (currentNodeData.width || 0) * zoom;
    let y = position.y;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const margin = 20;

    // Check right boundary
    if (x + popoverWidth + margin > viewportWidth) {
      x = Math.max(margin, position.x - popoverWidth - margin);
    }

    // Check bottom boundary
    if (y + popoverHeight + margin > viewportHeight) {
      y = Math.max(margin, viewportHeight - popoverHeight - margin);
    }

    // Check top boundary
    if (y < margin) {
      y = margin;
    }

    return { x, y };
  }, [currentNodeData, flowToScreenPosition, getZoom]);

  const getAddNodePosition = useMemoizedFn((nodeTemplate) => {
    if (!currentNodeData) return { x: 0, y: 0 };

    const x = currentNodeData.position.x + (currentNodeData.width || 0) + 120;
    const y = currentNodeData.position.y;

    return { x, y };
  });

  const onAddNode = useMemoizedFn(async ({ template }: { template: NodeTemplateListItemType }) => {
    const nodePosition = getAddNodePosition(template);

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
    const isToolHandle = handleParams?.handleId === 'selectedTools';

    const newEdges = newNodes
      .filter((node) => {
        // Exclude nodes that don't meet the conditions
        // 1. Tool set nodes must be connected through tool handle
        if (!isToolHandle && node.data.flowNodeType === FlowNodeTypeEnum.toolSet) {
          return false;
        }

        // 2. Exclude loop start and end nodes
        if (
          [FlowNodeTypeEnum.loopStart, FlowNodeTypeEnum.loopEnd].includes(node.data.flowNodeType)
        ) {
          return false;
        }

        // 3. Tool handle can only connect to tool nodes
        if (isToolHandle && !node.data.isTool) {
          return false;
        }

        return true;
      })
      .map((node) => ({
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

  if (!handleParams) return null;

  return (
    <Popover
      isOpen={!!handleParams}
      onClose={() => {
        setHandleParams(null);
        setTemplateType(TemplateTypeEnum.basic);
        setParentId('');
      }}
      closeOnBlur={true}
      closeOnEsc={true}
      autoFocus={true}
      isLazy
    >
      <PopoverContent
        position="fixed"
        top={`${popoverPosition.y}px`}
        left={`${popoverPosition.x + 10}px`}
        width={popoverWidth}
        height={popoverHeight}
        boxShadow="3px 0 20px rgba(0,0,0,0.2)"
        border={'none'}
      >
        <PopoverBody padding={0} h={'full'}>
          <MyBox
            isLoading={isLoading}
            display={'flex'}
            flexDirection={'column'}
            py={4}
            h={'full'}
            userSelect="none"
          >
            <NodeTemplateListHeader isPopover={true} />
            <NodeTemplateList onAddNode={onAddNode} isPopover={true} />
          </MyBox>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export default React.memo(NodeTemplatesPopover);
