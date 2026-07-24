import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import SandboxConfigButton from '@/pageComponents/app/detail/components/SandboxConfigButton';
import InputLabel from '../render/RenderInput/Label';
import { getSelectedInputRenderType } from '@fastgpt/global/core/workflow/utils';

const getRenderType = (input: FlowNodeInputItemType) =>
  getSelectedInputRenderType(input) || FlowNodeInputTypeEnum.custom;

export const createSandboxEntrypointInput = (value: string): FlowNodeInputItemType => ({
  key: NodeInputKeyEnum.sandboxEntrypoint,
  renderTypeList: [FlowNodeInputTypeEnum.custom],
  label: '',
  valueType: WorkflowIOValueTypeEnum.string,
  value
});

/**
 * 工作流节点里的 sandbox 开关与启动脚本编辑区。
 *
 * 启动脚本依赖 sandbox 开关，放在同一个组件里能避免 custom input
 * 被通用 RenderInput 空渲染后无法编辑。
 */
const WorkflowSandboxConfig = ({
  nodeId,
  sandboxInput,
  sandboxEntrypointInput,
  showSandbox,
  enableSandbox,
  isPlus,
  onChangeSandbox,
  onChangeEntrypoint
}: {
  nodeId: string;
  sandboxInput?: FlowNodeInputItemType;
  sandboxEntrypointInput?: FlowNodeInputItemType;
  showSandbox: boolean;
  enableSandbox: boolean;
  isPlus?: boolean;
  onChangeSandbox: (checked: boolean) => void;
  onChangeEntrypoint: (value: string) => void;
}) => {
  if (!sandboxInput) return null;

  const sandboxRenderType = getRenderType(sandboxInput);
  const showSandboxInput =
    !(sandboxInput.isPro && !isPlus) &&
    sandboxRenderType !== FlowNodeInputTypeEnum.hidden &&
    !sandboxInput.canEdit;
  if (!showSandboxInput) return null;

  return (
    <Box mb={5} position={'relative'}>
      <Flex alignItems={'center'} justifyContent={'space-between'}>
        <InputLabel nodeId={nodeId} input={sandboxInput} />
        <SandboxConfigButton
          className={'nodrag'}
          showSandbox={showSandbox}
          enableSandbox={enableSandbox}
          isEnabled={!!sandboxInput.value}
          entrypoint={(sandboxEntrypointInput?.value as string) || ''}
          onChangeSandbox={onChangeSandbox}
          onChangeEntrypoint={onChangeEntrypoint}
        />
      </Flex>
    </Box>
  );
};

export default React.memo(WorkflowSandboxConfig);
