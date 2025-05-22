import React from 'react';
import { Box } from '@chakra-ui/react';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { useReactFlow } from 'reactflow';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../context';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useWorkflowUtils } from './hooks/useUtils';
import { WorkflowNodeEdgeContext } from '../context/workflowInitContext';
import { useMemoizedFn } from 'ahooks';
import TemplateHeader from './components/NodeTemplates/header';
import TemplateList from './components/NodeTemplates/list';
import { createNodeTemplate } from '../utils';

type ModuleTemplateListProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const sliderWidth = 460;

const NodeTemplatesModal = ({ isOpen, onClose }: ModuleTemplateListProps) => {
  const { templatesIsLoading: isLoading } = useContextSelector(WorkflowContext, (state) => ({
    templatesIsLoading: state.templatesIsLoading
  }));

  const { t } = useTranslation();
  const { setLoading } = useSystemStore();
  const { screenToFlowPosition } = useReactFlow();
  const { computedNewNodeName } = useWorkflowUtils();
  const { toast } = useToast();
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setNodes);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const onAddNode = useMemoizedFn(
    async ({
      template,
      position
    }: {
      template: NodeTemplateListItemType;
      position?: { x: number; y: number };
    }) => {
      const nodePosition = screenToFlowPosition(position || { x: sliderWidth * 1.5, y: 200 });
      const mouseX = nodePosition.x - 100;
      const mouseY = nodePosition.y - 20;

      const newNodes = await createNodeTemplate({
        template,
        position: { x: mouseX, y: mouseY },
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
    }
  );

  return (
    <>
      <Box
        zIndex={2}
        display={isOpen ? 'block' : 'none'}
        position={'absolute'}
        top={0}
        left={0}
        bottom={0}
        w={`${sliderWidth}px`}
        maxW={'100%'}
        onClick={onClose}
        fontSize={'sm'}
      />
      <MyBox
        isLoading={isLoading}
        display={'flex'}
        zIndex={3}
        flexDirection={'column'}
        position={'absolute'}
        top={'10px'}
        left={0}
        pt={5}
        pb={4}
        h={isOpen ? 'calc(100% - 20px)' : '0'}
        w={isOpen ? ['100%', `${sliderWidth}px`] : '0'}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'0 20px 20px 0'}
        transition={'.2s ease'}
        userSelect={'none'}
        overflow={isOpen ? 'none' : 'hidden'}
      >
        <TemplateHeader onClose={onClose} />
        <TemplateList onAddNode={onAddNode} />
      </MyBox>
    </>
  );
};

export default React.memo(NodeTemplatesModal);
