import React from 'react';
import { type NodeProps } from 'reactflow';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { WorkflowUtilsContext } from '../../../context/workflowUtilsContext';
import Container from '../../components/Container';
import IOTitle from '../../components/IOTitle';
import NodeCard from '../render/NodeCard';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import CatchError from '../render/RenderOutput/CatchError';
import RenderToolInput, { hasDynamicToolInput } from '../render/RenderToolInput';
import { AgentNodeInputProvider, useAgentNodeInputContext } from './context';
import { AgentPromptInput, AgentPromptLabel } from './AgentInputs';

const promptRenderer = {
  [NodeInputKeyEnum.aiSystemPrompt]: (item: FlowNodeInputItemType) => (
    <AgentPromptInput item={item} />
  )
};

const agentModelSettingProps = {
  showTemperature: false,
  showTopP: false,
  showStopSign: false,
  showResponseFormat: false
};

/** 节点仅组织输入、输出与错误分支；Agent 表单能力由上下文和标准模板组合。 */
const AgentNodeContent = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, catchError, inputs, outputs } = data;
  const { t } = useTranslation();
  const { skillSelection } = useAgentNodeInputContext();
  const { splitToolInputs, splitOutput } = useContextSelector(WorkflowUtilsContext, (ctx) => ctx);
  const { isTool, commonInputs } = useMemoEnhance(
    () => splitToolInputs(inputs, nodeId),
    [inputs, nodeId, splitToolInputs]
  );
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitOutput(outputs),
    [splitOutput, outputs]
  );
  const promptInput = inputs.find((input) => input.key === NodeInputKeyEnum.aiSystemPrompt);
  return (
    <NodeCard minW={'524px'} selected={selected} {...data}>
      {isTool && hasDynamicToolInput(data) && (
        <Container>
          <RenderToolInput nodeId={nodeId} inputs={inputs} />
        </Container>
      )}

      <Container>
        <IOTitle text={t('common:Input')} nodeId={nodeId} inputs={inputs} />
        <RenderInput
          nodeId={nodeId}
          flowInputList={commonInputs}
          CustomComponent={promptRenderer}
          CustomLabelRightComponent={{
            [NodeInputKeyEnum.aiSystemPrompt]: promptInput ? (
              <AgentPromptLabel item={promptInput} nodeId={nodeId} />
            ) : undefined
          }}
          settingLLMModelProps={agentModelSettingProps}
          onChangeSandbox={skillSelection.onChangeAgentSandbox}
          isTool={isTool}
        />
      </Container>

      {successOutputs.length > 0 && (
        <Container>
          <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
          <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
        </Container>
      )}

      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}
    </NodeCard>
  );
};

const NodeAgent = (props: NodeProps<FlowNodeItemType>) => (
  <AgentNodeInputProvider data={props.data}>
    <AgentNodeContent {...props} />
  </AgentNodeInputProvider>
);

export default React.memo(NodeAgent);
