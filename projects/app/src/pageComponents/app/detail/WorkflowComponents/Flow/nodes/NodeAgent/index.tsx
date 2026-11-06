import React from 'react';
import { useTranslation } from 'next-i18next';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import { splitNodeOutputs, splitToolInputsByMode } from '@/web/core/workflow/utils';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import Container from '../../components/Container';
import IOTitle from '../../components/IOTitle';
import NodeCard from '../render/NodeCard';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import CatchError from '../render/RenderOutput/CatchError';
import RenderToolInput, { useHasDynamicToolInput } from '../render/RenderToolInput';
import { useIsToolNode } from '../render/useWorkflowDocument';
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

/** 节点只组织 Agent 的标准输入、输出与错误分支；具体资源编辑由 Provider 适配 Runtime。 */
const AgentNodeContent = ({ data, selected }: CanvasNodeProps) => {
  const { nodeId } = data;
  const { t } = useTranslation();
  const { skillSelection } = useAgentNodeInputContext();
  const {
    inputs = [],
    outputs = [],
    catchError = false
  } = useNode<WorkflowNodeData>(nodeId, (node) => node?.data) ?? {};
  const isTool = useIsToolNode(nodeId);
  const hasDynamicInput = useHasDynamicToolInput(nodeId);
  const { commonInputs } = useMemoEnhance(
    () => splitToolInputsByMode(inputs, isTool),
    [inputs, isTool]
  );
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitNodeOutputs(outputs),
    [outputs]
  );
  const promptInput = inputs.find((input) => input.key === NodeInputKeyEnum.aiSystemPrompt);

  return (
    <NodeCard minW={'524px'} selected={selected} {...data}>
      {isTool && hasDynamicInput && (
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

const NodeAgent = (props: CanvasNodeProps) => (
  <AgentNodeInputProvider nodeId={props.data.nodeId}>
    <AgentNodeContent {...props} />
  </AgentNodeInputProvider>
);

export default React.memo(NodeAgent);
