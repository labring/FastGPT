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
import CatchError from './render/RenderOutput/CatchError';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import WorkflowSandboxConfig, {
  createSandboxEntrypointInput
} from './components/WorkflowSandboxConfig';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { splitNodeOutputs, splitToolInputsByMode } from '@/web/core/workflow/utils';
import { useIsToolNode } from './render/useWorkflowDocument';
import { useField } from '@/web/core/workflow/editor/react/useField';
import { useNode } from '@/web/core/workflow/editor/react/useNode';

const NodeToolCall = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs, catchError } = data;
  const { toast } = useToast();
  const node = useNode(nodeId);
  const sandboxField = useField(nodeId, NodeInputKeyEnum.useAgentSandbox, 'input');
  const entrypointField = useField(nodeId, NodeInputKeyEnum.sandboxEntrypoint, 'input');
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const showSandbox = feConfigs.show_agent_sandbox;
  const isTool = useIsToolNode(nodeId);
  const { commonInputs } = useMemoEnhance(
    () => splitToolInputsByMode(inputs, isTool),
    [inputs, isTool]
  );
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitNodeOutputs(outputs),
    [outputs]
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
    const visibleInputs = commonInputs.filter(
      (input) =>
        input.key !== NodeInputKeyEnum.useAgentSandbox &&
        input.key !== NodeInputKeyEnum.sandboxEntrypoint
    );
    const sandboxIndex = commonInputs.findIndex(
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
        (input) => commonInputs.findIndex((item) => item.key === input.key) < sandboxIndex
      ),
      afterSandboxInputs: visibleInputs.filter(
        (input) => commonInputs.findIndex((item) => item.key === input.key) > sandboxIndex
      )
    };
  }, [commonInputs]);
  const onChangeSandbox = React.useCallback(
    (checked: boolean) => {
      if (!sandboxField) return;
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

      sandboxField.setValue(checked);
    },
    [enableSandbox, sandboxField, showSandbox, t, toast]
  );

  return (
    <NodeCard minW={'480px'} selected={selected} {...data}>
      <Container>
        <IOTitle text={t('common:Input')} />
        <RenderInput nodeId={nodeId} flowInputList={beforeSandboxInputs} isTool={isTool} />
        <WorkflowSandboxConfig
          nodeId={nodeId}
          sandboxInput={sandboxInput}
          sandboxEntrypointInput={sandboxEntrypointInput}
          showSandbox={!!showSandbox}
          enableSandbox={enableSandbox}
          isPlus={feConfigs?.isPlus}
          onChangeSandbox={onChangeSandbox}
          onChangeEntrypoint={(value) => {
            // 已有入口字段只改值；字段缺失时按模板补一条记录（记录级变更走 updateNode）。
            if (entrypointField) {
              entrypointField.setValue(value);
              return;
            }
            node?.updateNode((current) => ({
              inputs: [...current.inputs, createSandboxEntrypointInput(value)]
            }));
          }}
        />
        <RenderInput nodeId={nodeId} flowInputList={afterSandboxInputs} isTool={isTool} />
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
