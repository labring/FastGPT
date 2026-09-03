import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import Container from '../components/Container';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { type FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { AppContext } from '@/pageComponents/app/detail/context';
import { workflowSystemVariables } from '@/web/core/app/utils';
import {
  formatEditorVariablePickerIcon,
  getAppChatConfig
} from '@fastgpt/global/core/workflow/utils';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

const NodeStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useSafeTranslation();
  const { nodeId, outputs } = data;
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const customGlobalVariables = useMemoEnhance(() => {
    const globalVariables = formatEditorVariablePickerIcon(
      getAppChatConfig({
        chatConfig: appDetail.chatConfig,
        isPublicFetch: true
      })?.variables || []
    );

    return globalVariables.map<FlowNodeOutputItemType>((item) => {
      return {
        id: item.key,
        type: FlowNodeOutputTypeEnum.static,
        key: item.key,
        required: item.required,
        valueType: item.valueType || WorkflowIOValueTypeEnum.any,
        label: t(item.label as any),
        valueDesc: item.valueDesc,
        ...(item.icon ? { icon: item.icon } : {})
      };
    });
  }, [appDetail.chatConfig, t]);

  const systemVariables = useMemoEnhance(
    () =>
      workflowSystemVariables.map((item) => ({
        id: item.key,
        type: FlowNodeOutputTypeEnum.static,
        key: item.key,
        required: item.required,
        valueType: item.valueType || WorkflowIOValueTypeEnum.any,
        label: t(item.label as any),
        valueDesc: item.valueDesc,
        ...(item.icon ? { icon: item.icon } : {})
      })),
    [t]
  );

  return (
    <NodeCard
      selected={selected}
      menuForbid={{
        copy: true,
        delete: true
      }}
      {...data}
    >
      <Container>
        <IOTitle text={t('common:Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
      <Container>
        <IOTitle text={t('common:core.module.Variable')} />
        {customGlobalVariables.length > 0 && (
          <>
            <RenderOutput nodeId={nodeId} flowOutputList={customGlobalVariables} />
            <MyDivider />
          </>
        )}

        <RenderOutput nodeId={nodeId} flowOutputList={systemVariables} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeStart);
