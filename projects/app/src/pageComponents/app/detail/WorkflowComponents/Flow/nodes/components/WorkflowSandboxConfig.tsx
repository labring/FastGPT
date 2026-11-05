import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import SandboxConfigButton from '@/pageComponents/app/detail/components/SandboxConfigButton';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import type { RenderInputProps } from '../render/RenderInput/type';

/** 旧节点缺少启动脚本输入时补齐隐藏配置，不额外产生空表单行。 */
export const createSandboxEntrypointInput = (value: string): FlowNodeInputItemType => ({
  key: NodeInputKeyEnum.sandboxEntrypoint,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  label: '',
  valueType: WorkflowIOValueTypeEnum.string,
  value
});

/** 沙盒标准输入渲染器；Agent 可注入共享技能约束，其余节点使用相同系统/套餐守卫。 */
const WorkflowSandboxConfig = ({
  nodeId,
  item,
  inputs = [],
  onChangeSandbox
}: RenderInputProps & {
  onChangeSandbox?: (checked: boolean) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const showSandbox = Boolean(feConfigs.show_agent_sandbox);
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus.standard.enableSandbox;
  const entrypointInput = inputs.find((input) => input.key === NodeInputKeyEnum.sandboxEntrypoint);

  return (
    <SandboxConfigButton
      className={'nodrag'}
      showSandbox={showSandbox}
      enableSandbox={enableSandbox}
      isEnabled={Boolean(item.value)}
      entrypoint={entrypointInput?.value ?? ''}
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
          onChangeNode({
            nodeId,
            key: item.key,
            type: 'updateInput',
            value: { ...item, value: checked }
          });
        })
      }
      onChangeEntrypoint={(value) =>
        onChangeNode({
          nodeId,
          key: NodeInputKeyEnum.sandboxEntrypoint,
          type: 'replaceInput',
          value: entrypointInput
            ? { ...entrypointInput, value }
            : createSandboxEntrypointInput(value)
        })
      }
    />
  );
};

export default React.memo(WorkflowSandboxConfig);
