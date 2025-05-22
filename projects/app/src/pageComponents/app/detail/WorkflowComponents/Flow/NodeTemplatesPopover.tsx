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
import TemplateHeader, { TemplateTypeEnum } from './components/NodeTemplates/header';
import TemplateList from './components/NodeTemplates/list';
import { createNodeTemplate } from '../utils';
import { Popover, PopoverContent, PopoverBody } from '@chakra-ui/react';
import { WorkflowEventContext } from '../context/workflowEventContext';

const popoverWidth = 400;
const popoverHeight = 600;
const margin = 20;

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

  // TODO: 需要优化，区分 popoverPosition & addNodePosition
  const popoverPosition = useMemo(() => {
    if (!handleParams?.nodeId) return { x: 0, y: 0 };
    const currentNodeData = nodes.find((node) => node.id === handleParams?.nodeId);
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

    if (x + popoverWidth + margin > viewportWidth) {
      x = Math.max(margin, position.x - popoverWidth - margin);
    }

    if (y + popoverHeight + margin > viewportHeight) {
      y = Math.max(margin, viewportHeight - popoverHeight - margin);
    }

    if (y < margin) {
      y = margin;
    }

    return { x, y };
  }, [handleParams?.nodeId, flowToScreenPosition, nodes, getZoom]);

  const onAddNode = useMemoizedFn(async ({ template }: { template: NodeTemplateListItemType }) => {
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
    const isToolHandle = handleParams?.handleId === 'selectedTools';

    const newEdges = newNodes
      .filter((node) => isToolHandle || node.data.flowNodeType !== FlowNodeTypeEnum.toolSet)
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
          <MyBox isLoading={isLoading} py={4} h={'full'} userSelect="none">
            <TemplateHeader isPopover={true} />
            <TemplateList onAddNode={onAddNode} isPopover={true} />
          </MyBox>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export default React.memo(NodeTemplatesPopover);
