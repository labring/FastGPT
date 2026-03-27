import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const menuForbid = {
  copy: true,
  delete: true,
  debug: true
} as const;

/** loopPro 子图中的循环终止 */
const NodeLoopProEnd = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);
  const parent = getNodeById(data.parentNodeId);
  const isUnderLoopPro = parent?.flowNodeType === FlowNodeTypeEnum.loopPro;

  const intro =
    data.intro && String(data.intro).trim() ? data.intro : ('workflow:loopPro_end_intro' as const);

  return (
    <NodeCard
      selected={selected}
      {...data}
      name={t('workflow:loopPro_end')}
      intro={intro}
      w={'420px'}
      avatar={isUnderLoopPro ? 'core/workflow/template/loopProEnd' : data.avatar}
      avatarLinear={data.avatarLinear}
      colorSchema={isUnderLoopPro ? 'workflowLoop' : data.colorSchema}
      menuForbid={menuForbid}
    />
  );
};

export default React.memo(NodeLoopProEnd);
