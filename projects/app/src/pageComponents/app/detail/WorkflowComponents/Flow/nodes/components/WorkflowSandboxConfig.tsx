import React from 'react';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import SandboxConfigButton from '@/pageComponents/app/detail/components/SandboxConfigButton';
import { useAgentSandboxCapability } from '@/pageComponents/app/detail/hooks/useAgentSandboxCapability';
import { useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useFieldActions } from '@/web/core/workflow/editor/react/useField';
import type { RenderInputProps } from '../render/RenderInput/type';

/** 旧节点缺少启动脚本输入时补齐隐藏配置，不额外产生空表单行。 */
const createSandboxEntrypointInput = (value: string): FlowNodeInputItemType => ({
  key: NodeInputKeyEnum.sandboxEntrypoint,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  label: '',
  valueType: WorkflowIOValueTypeEnum.string,
  value
});

/** 通用 RenderInput 入口读取系统状态，并通过 Runtime node action 写回沙盒字段。 */
export const SandboxInputConfig = ({
  nodeId,
  item,
  inputs = [],
  onChangeSandbox
}: RenderInputProps & { onChangeSandbox?: (checked: boolean) => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { showSandbox, enableSandbox } = useAgentSandboxCapability();
  const nodeActions = useNodeActions(nodeId);
  const sandboxActions = useFieldActions({ nodeId, fieldKey: item.key, kind: 'input' });

  return (
    <SandboxConfigButton
      className={'nodrag'}
      showSandbox={showSandbox}
      enableSandbox={enableSandbox}
      isEnabled={Boolean(item.value)}
      entrypoint={inputs.find((input) => input.key === NodeInputKeyEnum.sandboxEntrypoint)?.value}
      onChangeSandbox={
        onChangeSandbox ??
        ((checked) => {
          if (checked && (!showSandbox || !enableSandbox)) {
            toast({
              status: 'warning',
              title: showSandbox
                ? t('app:sandbox_free_not_support')
                : t('skill:sandbox_system_not_configured_toast')
            });
            return;
          }
          sandboxActions.setValue(checked);
        })
      }
      onChangeEntrypoint={(value) => {
        nodeActions?.updateNode((current) => {
          const index = current.inputs.findIndex(
            (input) => input.key === NodeInputKeyEnum.sandboxEntrypoint
          );
          if (index === -1) {
            return { inputs: [...current.inputs, createSandboxEntrypointInput(value)] };
          }
          return {
            inputs: current.inputs.map((input, inputIndex) =>
              inputIndex === index ? { ...input, value } : input
            )
          };
        });
      }}
    />
  );
};
