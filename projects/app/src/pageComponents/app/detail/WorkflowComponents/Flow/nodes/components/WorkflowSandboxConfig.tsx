import React from 'react';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import SandboxConfigButton from '@/pageComponents/app/detail/components/SandboxConfigButton';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import type { RenderInputProps } from '../render/RenderInput/type';

/** 旧节点缺少启动脚本输入时补齐隐藏配置，不额外产生空表单行。 */
export const createSandboxEntrypointInput = (value: string): FlowNodeInputItemType => ({
  key: NodeInputKeyEnum.sandboxEntrypoint,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  label: '',
  valueType: WorkflowIOValueTypeEnum.string,
  value
});

export type SandboxConfigProps = {
  showSandbox: boolean;
  enableSandbox: boolean;
  sandboxInput?: FlowNodeInputItemType;
  sandboxEntrypointInput?: FlowNodeInputItemType;
  onChangeSandbox: (checked: boolean) => void;
  onChangeEntrypoint?: (value: string) => void;
};

function SandboxConfig({
  showSandbox,
  enableSandbox,
  sandboxInput,
  sandboxEntrypointInput,
  onChangeSandbox,
  onChangeEntrypoint
}: SandboxConfigProps) {
  return (
    <SandboxConfigButton
      className={'nodrag'}
      showSandbox={showSandbox}
      enableSandbox={enableSandbox}
      isEnabled={Boolean(sandboxInput?.value)}
      entrypoint={sandboxEntrypointInput?.value ?? ''}
      onChangeSandbox={onChangeSandbox}
      onChangeEntrypoint={onChangeEntrypoint}
    />
  );
}

/** 通用 RenderInput 入口读取系统状态，并通过 Runtime node action 写回沙盒字段。 */
export const SandboxInputConfig = ({
  nodeId,
  item,
  inputs = [],
  onChangeSandbox
}: RenderInputProps & { onChangeSandbox?: (checked: boolean) => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const nodeActions = useNodeActions(nodeId);
  const showSandbox = Boolean(feConfigs.show_agent_sandbox);
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus.standard.enableSandbox;

  return (
    <SandboxConfig
      showSandbox={showSandbox}
      enableSandbox={enableSandbox}
      sandboxInput={item}
      sandboxEntrypointInput={inputs.find(
        (input) => input.key === NodeInputKeyEnum.sandboxEntrypoint
      )}
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
          nodeActions?.updateNode((current) => ({
            inputs: current.inputs.map((input) =>
              input.key === item.key ? { ...input, value: checked } : input
            )
          }));
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

export default React.memo(SandboxConfig);
