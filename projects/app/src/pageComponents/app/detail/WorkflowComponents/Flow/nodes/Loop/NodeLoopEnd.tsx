import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import NodeCard from '../render/NodeCard';
import Reference from '../render/RenderInput/templates/Reference';
import { Box } from '@chakra-ui/react';
import React from 'react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useTranslation } from 'next-i18next';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useNode } from '@/web/core/workflow/editor/react/useNode';

const NodeLoopEnd = ({ data, selected }: CanvasNodeProps) => {
  const { nodeId, parentNodeId } = data;
  const inputs = useNode<FlowNodeItemType['inputs']>(nodeId, (node) => node?.data.inputs) ?? [];
  const parentId = parentNodeId ?? '';
  const parentData = useNode<WorkflowNodeData>(parentId, (node) => node?.data);
  const parentFlowNodeType = parentData?.flowNodeType;
  const { t } = useTranslation();

  const inputItem = useMemoEnhance(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.nestedEndInput),
    [inputs]
  );

  const parallelRunIntro = useMemoEnhance(() => {
    return parentFlowNodeType === FlowNodeTypeEnum.parallelRun
      ? t('workflow:parallel_run_end_intro')
      : undefined;
  }, [parentFlowNodeType, t]);

  return (
    <NodeCard
      selected={selected}
      {...data}
      {...(parallelRunIntro && { intro: parallelRunIntro })}
      w={'420px'}
      menuForbid={{
        copy: true,
        delete: true,
        debug: true
      }}
    >
      <Box px={4} pb={4} pt={2}>
        {inputItem && <Reference item={inputItem} nodeId={nodeId} />}
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeLoopEnd);
