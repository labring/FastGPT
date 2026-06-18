import React from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import Divider from '../components/Divider';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import IOTitle from '../components/IOTitle';
import MyIcon from '@fastgpt/web/components/common/Icon';
import RenderOutput from './render/RenderOutput';
import { useContextSelector } from 'use-context-selector';
import CatchError from './render/RenderOutput/CatchError';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { WorkflowUtilsContext } from '../../context/workflowUtilsContext';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import WorkflowSandboxConfig, {
  createSandboxEntrypointInput
} from './components/WorkflowSandboxConfig';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';

const NodeToolCall = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs, catchError } = data;
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const splitOutput = useContextSelector(WorkflowUtilsContext, (ctx) => ctx.splitOutput);
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const showSandbox = feConfigs.show_agent_sandbox;
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitOutput(outputs),
    [outputs, splitOutput]
  );
  const sandboxInput = React.useMemo(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.useAgentSandbox),
    [inputs]
  );
  const sandboxEntrypointInput = React.useMemo(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.sandboxEntrypoint),
    [inputs]
  );
  const { beforeSandboxInputs, afterSandboxInputs } = React.useMemo(() => {
    const visibleInputs = inputs.filter(
      (input) =>
        input.key !== NodeInputKeyEnum.useAgentSandbox &&
        input.key !== NodeInputKeyEnum.sandboxEntrypoint
    );
    const sandboxIndex = inputs.findIndex(
      (input) => input.key === NodeInputKeyEnum.useAgentSandbox
    );
    if (sandboxIndex < 0) {
      return {
        beforeSandboxInputs: visibleInputs,
        afterSandboxInputs: []
      };
    }

    return {
      beforeSandboxInputs: visibleInputs.filter(
        (input) => inputs.findIndex((item) => item.key === input.key) < sandboxIndex
      ),
      afterSandboxInputs: visibleInputs.filter(
        (input) => inputs.findIndex((item) => item.key === input.key) > sandboxIndex
      )
    };
  }, [inputs]);
  const onChangeSandbox = React.useCallback(
    (checked: boolean) => {
      if (!sandboxInput) return;
      if (checked) {
        if (!showSandbox) {
          toast({
            status: 'warning',
            title: t('skill:sandbox_system_not_configured_toast')
          });
          return;
        }
        if (!enableSandbox) {
          toast({
            status: 'warning',
            title: t('app:sandbox_free_not_support')
          });
          return;
        }
      }

      onChangeNode({
        nodeId,
        key: NodeInputKeyEnum.useAgentSandbox,
        type: 'updateInput',
        value: {
          ...sandboxInput,
          value: checked
        }
      });
      if (!checked && sandboxEntrypointInput) {
        onChangeNode({
          nodeId,
          key: NodeInputKeyEnum.sandboxEntrypoint,
          type: 'updateInput',
          value: {
            ...sandboxEntrypointInput,
            value: undefined
          }
        });
      }
    },
    [
      enableSandbox,
      nodeId,
      onChangeNode,
      sandboxEntrypointInput,
      sandboxInput,
      showSandbox,
      t,
      toast
    ]
  );

  return (
    <NodeCard minW={'480px'} selected={selected} {...data}>
      <Container>
        <IOTitle text={t('common:Input')} />
        <RenderInput nodeId={nodeId} flowInputList={beforeSandboxInputs} />
        <WorkflowSandboxConfig
          nodeId={nodeId}
          sandboxInput={sandboxInput}
          sandboxEntrypointInput={sandboxEntrypointInput}
          showSandbox={!!showSandbox}
          enableSandbox={enableSandbox}
          isPlus={feConfigs?.isPlus}
          onChangeSandbox={onChangeSandbox}
          onChangeEntrypoint={(value) => {
            onChangeNode({
              nodeId,
              key: NodeInputKeyEnum.sandboxEntrypoint,
              type: 'replaceInput',
              value: sandboxEntrypointInput
                ? {
                    ...sandboxEntrypointInput,
                    value
                  }
                : createSandboxEntrypointInput(value)
            });
          }}
        />
        <RenderInput nodeId={nodeId} flowInputList={afterSandboxInputs} />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
        <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
      </Container>
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}

      <Box position={'relative'}>
        <Box mb={-3} borderBottomRadius={'lg'} overflow={'hidden'}>
          <Divider
            showBorderBottom={false}
            icon={<MyIcon name="phoneTabbar/tool" w={'16px'} h={'16px'} />}
            text={t('common:core.workflow.tool.Select Tool')}
          />
        </Box>
      </Box>
    </NodeCard>
  );
};
export default React.memo(NodeToolCall);
