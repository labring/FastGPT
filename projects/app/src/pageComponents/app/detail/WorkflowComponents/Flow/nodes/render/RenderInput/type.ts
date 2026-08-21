import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { AIChatSettingsModalProps } from '@/components/core/ai/AISettingModal';

export type RenderInputProps = {
  inputs?: FlowNodeInputItemType[];
  item: FlowNodeInputItemType;
  nodeId: string;
  settingLLMModelProps?: AIChatSettingsModalProps;
};
