import type {
  CanonicalAgentToolInputConfig,
  CanonicalFlowNodeInputItem,
  LegacyAgentToolInputConfig,
  LegacyFlowNodeInputItem
} from '../schema';
import { CanonicalAgentToolInputConfigSchema, LegacyAgentToolInputConfigSchema } from '../schema';
import {
  canInputBeAgentGenerated,
  canInputBeManuallyConfigured
} from '../../../app/formEdit/utils';
import { FlowNodeInputTypeEnum } from '../../node/constant';
import { NodeInputKeyEnum } from '../../constants';

/** 将单个历史输入收敛为当前 selectedType 协议，并移除旧索引。 */
export const migrateFlowNodeInputToCurrent = (
  input: LegacyFlowNodeInputItem
): CanonicalFlowNodeInputItem => {
  const { selectedTypeIndex: _selectedTypeIndex, ...canonicalInput } = input;
  const selectedType =
    input.selectedType ??
    (input.selectedTypeIndex === undefined
      ? undefined
      : input.renderTypeList?.[input.selectedTypeIndex]);

  return {
    ...canonicalInput,
    renderTypeList: input.renderTypeList ?? [],
    ...(selectedType === undefined ? {} : { selectedType })
  } as CanonicalFlowNodeInputItem;
};

/** 将 Agent 工具的完整历史 NodeIO 或当前配置统一为 `{ key, mode }`。 */
export const migrateAgentToolInputConfigToCurrent = (
  input: LegacyAgentToolInputConfig
): CanonicalAgentToolInputConfig =>
  CanonicalAgentToolInputConfigSchema.parse(LegacyAgentToolInputConfigSchema.parse(input));

type MigrateFlowNodeInputOptions = {
  isTool?: boolean;
  forceDefaultMode?: boolean;
  allowLegacyToolDescriptionFallback?: boolean;
  deferDefaultSelection?: boolean;
};

/** 在迁移边界恢复历史输入来源，并删除 selectedTypeIndex。 */
export const migrateLegacyFlowNodeInputToCurrent = (
  input: LegacyFlowNodeInputItem,
  {
    isTool = false,
    forceDefaultMode = false,
    allowLegacyToolDescriptionFallback = false,
    deferDefaultSelection = false
  }: MigrateFlowNodeInputOptions = {}
) => {
  const inputRenderTypeList = input.renderTypeList ?? [];
  const legacySelectedType =
    input.selectedTypeIndex === undefined
      ? undefined
      : inputRenderTypeList[input.selectedTypeIndex];
  const recommendsAgentGenerated =
    input.isToolParam === true ||
    (input.isToolParam !== false && isTool && input.key === NodeInputKeyEnum.userChatInput) ||
    (allowLegacyToolDescriptionFallback &&
      input.isToolParam === undefined &&
      !!input.toolDescription);
  const isLegacyDefaultSelection =
    input.selectedType === undefined &&
    input.selectedTypeIndex === 0 &&
    (isTool || deferDefaultSelection) &&
    recommendsAgentGenerated;
  const supportsAgentGenerated = canInputBeAgentGenerated({
    ...input,
    renderTypeList: inputRenderTypeList
  });
  const renderTypeList = Array.from(
    new Set([
      ...(supportsAgentGenerated ? [FlowNodeInputTypeEnum.agentGenerated] : []),
      ...inputRenderTypeList.filter(
        (type) => supportsAgentGenerated || type !== FlowNodeInputTypeEnum.agentGenerated
      )
    ])
  );
  const savedSelectedType = forceDefaultMode
    ? undefined
    : (input.selectedType ?? (isLegacyDefaultSelection ? undefined : legacySelectedType));
  const defaultManualType = renderTypeList.find(
    (type) => type !== FlowNodeInputTypeEnum.agentGenerated
  );
  const selectedType =
    deferDefaultSelection && recommendsAgentGenerated && !savedSelectedType
      ? undefined
      : savedSelectedType &&
          renderTypeList.includes(savedSelectedType) &&
          (isTool ||
            deferDefaultSelection ||
            savedSelectedType !== FlowNodeInputTypeEnum.agentGenerated)
        ? savedSelectedType
        : isTool && supportsAgentGenerated && recommendsAgentGenerated
          ? FlowNodeInputTypeEnum.agentGenerated
          : defaultManualType;

  const { selectedTypeIndex: _selectedTypeIndex, ...canonicalInput } = input;
  return migrateFlowNodeInputToCurrent({
    ...canonicalInput,
    renderTypeList,
    ...(selectedType === undefined ? {} : { selectedType })
  });
};

/** 恢复旧 HTTP 468 工具输入的默认 AI 来源。 */
export const migrateLegacyHttpToolInputDefaultMode = (input: LegacyFlowNodeInputItem) => {
  if (
    input.canEdit !== true ||
    !input.toolDescription ||
    input.isToolParam !== undefined ||
    input.selectedType !== undefined ||
    !canInputBeAgentGenerated({ ...input, renderTypeList: input.renderTypeList ?? [] })
  ) {
    return input;
  }

  return { ...input, isToolParam: true };
};

/** 批量恢复旧工作流 HTTP 工具输入的默认 AI 来源。 */
export const migrateLegacyWorkflowHttpToolInputsDefaultMode = <T extends LegacyFlowNodeInputItem>(
  inputs: T[]
) => inputs.map(migrateLegacyHttpToolInputDefaultMode);

const getLegacySelectedInputRenderType = (input: LegacyFlowNodeInputItem) =>
  input.selectedType ?? input.renderTypeList?.[input.selectedTypeIndex ?? 0];

/** 读取历史工具快照的最终输入来源，供迁移和 runtime 边界使用。 */
export const getLegacySavedToolInputSelectedType = ({
  savedInput,
  defaultInput,
  allowUserChatInputAgentGenerated = false,
  allowLegacyToolDescriptionFallback = false
}: {
  savedInput?: LegacyFlowNodeInputItem;
  defaultInput: CanonicalFlowNodeInputItem;
  allowUserChatInputAgentGenerated?: boolean;
  allowLegacyToolDescriptionFallback?: boolean;
}) => {
  if (!savedInput) {
    if (
      allowLegacyToolDescriptionFallback &&
      defaultInput.isToolParam === undefined &&
      defaultInput.toolDescription &&
      canInputBeAgentGenerated(defaultInput)
    ) {
      return FlowNodeInputTypeEnum.agentGenerated;
    }
    return;
  }
  const supportsOnlyAgentGenerated =
    defaultInput.renderTypeList.length > 0 &&
    canInputBeAgentGenerated(defaultInput) &&
    !canInputBeManuallyConfigured(defaultInput);
  if (
    (allowUserChatInputAgentGenerated || defaultInput.key !== NodeInputKeyEnum.userChatInput) &&
    supportsOnlyAgentGenerated
  ) {
    return FlowNodeInputTypeEnum.agentGenerated;
  }
  if (savedInput.selectedType) return savedInput.selectedType;

  const selectedType =
    savedInput.selectedTypeIndex === undefined
      ? undefined
      : getLegacySelectedInputRenderType(savedInput);
  const isLegacyToolDescriptionSelection =
    allowLegacyToolDescriptionFallback &&
    savedInput.isToolParam === undefined &&
    !savedInput.renderTypeList?.includes(FlowNodeInputTypeEnum.agentGenerated);
  if (isLegacyToolDescriptionSelection) {
    if (savedInput.toolDescription && canInputBeAgentGenerated(defaultInput)) {
      return FlowNodeInputTypeEnum.agentGenerated;
    }
    return getLegacySelectedInputRenderType(savedInput);
  }
  if (savedInput.selectedTypeIndex === undefined) return;

  const isLegacyDefaultManualType =
    defaultInput.isToolParam === true &&
    savedInput.selectedTypeIndex === 0 &&
    !savedInput.renderTypeList?.includes(FlowNodeInputTypeEnum.agentGenerated) &&
    selectedType !== FlowNodeInputTypeEnum.reference;
  return isLegacyDefaultManualType ? undefined : selectedType;
};

/** 恢复旧工作流工具由 toolDescription 表示的默认 AI 来源。 */
export const migrateLegacyWorkflowToolInputDefaultMode = (input: LegacyFlowNodeInputItem) => {
  if (
    input.isToolParam !== undefined ||
    !input.toolDescription ||
    !canInputBeAgentGenerated({ ...input, renderTypeList: input.renderTypeList ?? [] })
  ) {
    return input;
  }

  return { ...input, isToolParam: true };
};

/** 批量恢复旧工作流工具由 toolDescription 表示的默认 AI 来源。 */
export const migrateLegacyWorkflowToolInputsDefaultMode = <T extends LegacyFlowNodeInputItem>(
  inputs: T[]
) => inputs.map(migrateLegacyWorkflowToolInputDefaultMode);
