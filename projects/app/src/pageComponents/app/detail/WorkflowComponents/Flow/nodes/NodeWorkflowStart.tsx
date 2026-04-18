import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import Container from '../components/Container';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useTranslation } from 'next-i18next';
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
import { ENTRY_POINT_VARIABLE_KEY } from '@fastgpt/global/core/app/constants';

const NodeStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, outputs } = data;
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const systemConfigNode = useContextSelector(WorkflowBufferDataContext, (v) => v.systemConfigNode);

  // 系统配置区块：由全局变量和功能入口变量组成
  const { globalVariables, entryPointVariables } = useMemoEnhance(() => {
    const appChatConfig = getAppChatConfig({
      chatConfig: appDetail.chatConfig,
      systemConfigNode,
      isPublicFetch: true
    });
    const rawGlobalVariables = formatEditorVariablePickerIcon(appChatConfig?.variables || []);

    // 全局变量列表
    const globalVarOutputs = rawGlobalVariables.map<FlowNodeOutputItemType>((item) => ({
      id: item.key,
      type: FlowNodeOutputTypeEnum.static,
      key: item.key,
      required: item.required,
      valueType: item.valueType || WorkflowIOValueTypeEnum.any,
      label: t(item.label as any),
      valueDesc: item.valueDesc
    }));

    // 若配置了功能入口，将其作为单独的变量输出
    const entryPointOutputs: FlowNodeOutputItemType[] =
      (appChatConfig?.entryPoints?.length ?? 0) > 0
        ? [
            {
              id: ENTRY_POINT_VARIABLE_KEY,
              type: FlowNodeOutputTypeEnum.static,
              key: ENTRY_POINT_VARIABLE_KEY,
              required: false,
              valueType: WorkflowIOValueTypeEnum.string,
              label: t('workflow:entry_point')
            }
          ]
        : [];

    return {
      globalVariables: globalVarOutputs,
      entryPointVariables: entryPointOutputs
    };
  }, [appDetail.chatConfig, systemConfigNode, t]);

  const systemVariables = useMemoEnhance(
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
        <IOTitle text={t('workflow:template.system_config')} />
        {/* 系统配置区块：显示全局变量和功能入口变量 */}
        {/* 全局变量列表 */}
        {globalVariables.length > 0 && (
          <RenderOutput nodeId={nodeId} flowOutputList={globalVariables} />
        )}

        {/* 分隔线：若同时存在全局变量和功能入口，需加分隔线 */}
        {globalVariables.length > 0 && entryPointVariables.length > 0 && <MyDivider />}

        {/* 功能入口变量 */}
        {entryPointVariables.length > 0 && (
          <RenderOutput nodeId={nodeId} flowOutputList={entryPointVariables} />
        )}

        {/* 分隔线：若存在功能入口，将其与系统变量隔开 */}
        {entryPointVariables.length > 0 && <MyDivider />}

        <RenderOutput nodeId={nodeId} flowOutputList={systemVariables} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeStart);
