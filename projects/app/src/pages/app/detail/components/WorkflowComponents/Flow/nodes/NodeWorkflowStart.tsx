import React, { useEffect, useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { useCreation } from 'ahooks';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  chatHistoryValueDesc,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { AppContext } from '@/pages/app/detail/components/context';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/system/workflowStart';

const NodeStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, outputs } = data;
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const variablesOutputs = useCreation(() => {
    const variables = getWorkflowGlobalVariables({
      nodes: nodeList,
      chatConfig: appDetail.chatConfig,
      t
    });

    return variables.map<FlowNodeOutputItemType>((item) => {
      if (item.valueType === WorkflowIOValueTypeEnum.chatHistory) {
        return {
          id: item.key,
          type: FlowNodeOutputTypeEnum.static,
          key: item.key,
          required: item.required,
          valueType: item.valueType,
          valueDesc: chatHistoryValueDesc,
          label: item.label
        };
      }
      return {
        id: item.key,
        type: FlowNodeOutputTypeEnum.static,
        key: item.key,
        required: item.required,
        valueType: item.valueType || WorkflowIOValueTypeEnum.any,
        label: item.label
      };
    });
  }, [nodeList, t]);

  // Dynamic add or delete userFilesInput
  useEffect(() => {
    const canUploadFiles =
      appDetail.chatConfig?.fileSelectConfig?.canSelectFile ||
      appDetail.chatConfig?.fileSelectConfig?.canSelectImg;
    const repeatKey = outputs.find((item) => item.key === userFilesInput.key);

    if (canUploadFiles) {
      !repeatKey &&
        onChangeNode({
          nodeId,
          type: 'addOutput',
          value: userFilesInput
        });
    } else {
      repeatKey &&
        onChangeNode({
          nodeId,
          type: 'delOutput',
          key: userFilesInput.key
        });
    }
  }, [appDetail.chatConfig?.fileSelectConfig, nodeId, onChangeNode, outputs]);

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
        <IOTitle text={t('common:common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
      <Container>
        <IOTitle text={t('common:core.module.Variable')} />
        <RenderOutput nodeId={nodeId} flowOutputList={variablesOutputs} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeStart);
