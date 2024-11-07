import React, { useMemo } from 'react';
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
import { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { AppContext } from '@/pages/app/detail/components/context';
import { workflowSystemVariables } from '@/web/core/app/utils';
import {
  formatEditorVariablePickerIcon,
  getAppChatConfig,
  getGuideModule
} from '@fastgpt/global/core/workflow/utils';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

const NodeStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, outputs } = data;
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const customGlobalVariables = useCreation(() => {
    const globalVariables = formatEditorVariablePickerIcon(
      getAppChatConfig({
        chatConfig: appDetail.chatConfig,
        systemConfigNode: getGuideModule(nodeList),
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
        valueDesc: item.valueDesc
      };
    });
  }, [nodeList, appDetail.chatConfig, t]);

  const systemVariables = useMemo(
    () =>
      workflowSystemVariables.map((item) => ({
        id: item.key,
        type: FlowNodeOutputTypeEnum.static,
        key: item.key,
        required: item.required,
        valueType: item.valueType || WorkflowIOValueTypeEnum.any,
        label: t(item.label as any),
        valueDesc: item.valueDesc
      })),
    [t]
  );
  const Render = useMemo(() => {
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
          <IOTitle text={t('common:common.Output')} />
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
  }, [customGlobalVariables, data, nodeId, outputs, selected, systemVariables, t]);

  return Render;
};

export default React.memo(NodeStart);
