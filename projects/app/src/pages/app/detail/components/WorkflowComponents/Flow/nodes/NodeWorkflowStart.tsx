import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import Container from '../components/Container';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { useCreation } from 'ahooks';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { AppContext } from '@/pages/app/detail/components/context';

const NodeStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, outputs } = data;
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const variablesOutputs = useCreation(() => {
    const variables = getWorkflowGlobalVariables({
      nodes: nodeList,
      chatConfig: appDetail.chatConfig,
      t
    });

    return variables.map<FlowNodeOutputItemType>((item) => ({
      id: item.key,
      type: FlowNodeOutputTypeEnum.static,
      key: item.key,
      required: item.required,
      valueType: item.valueType || WorkflowIOValueTypeEnum.any,
      label: item.label
    }));
  }, [nodeList, t]);

  return (
    <NodeCard
      minW={'240px'}
      selected={selected}
      menuForbid={{
        rename: true,
        copy: true,
        delete: true
      }}
      {...data}
    >
      <Container>
        <IOTitle text={t('common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
      <Container>
        <IOTitle text={t('core.module.Variable')} />
        <RenderOutput nodeId={nodeId} flowOutputList={variablesOutputs} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeStart);
