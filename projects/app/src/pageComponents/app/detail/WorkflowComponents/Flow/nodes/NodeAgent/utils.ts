import type { AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import type {
  SelectedAgentSkillItemType,
  SelectedToolItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

/**
 * 工具配置弹窗使用的 id。
 * useSkillManager 对带 source 的工具使用 `source:id` 复合键，系统工具则保持裸 id，
 * 这里必须沿用同一口径，避免给 system 工具错误补 `system:` 前缀。
 */
export const getAgentToolConfigId = (
  tool: Pick<SelectedToolItemType, 'id' | 'pluginId' | 'source'>
) => {
  const toolId = tool.pluginId ?? tool.id;
  return tool.source ? getToolIdentityKey(toolId, tool.source) : toolId;
};

export type AgentSkillInputUpdate = {
  nodeId: string;
  key: string;
  type: 'updateInput';
  value: FlowNodeInputItemType;
};

/** 从节点恢复知识库参数，包括当前为空的模型 ID；忽略非参数输入，未改变时保留引用。 */
export const restoreDatasetParams = ({
  state,
  inputs
}: {
  state: AppDatasetSearchParamsType;
  inputs: FlowNodeInputItemType[];
}): AppDatasetSearchParamsType => {
  const next = { ...state };
  let changed = false;
  for (const input of inputs) {
    if (!Object.hasOwn(state, input.key)) continue;
    const key = input.key as keyof AppDatasetSearchParamsType;
    const value = input.value ?? state[key];
    if (value === state[key]) continue;
    Object.assign(next, { [key]: value });
    changed = true;
  }
  return changed ? next : state;
};

/**
 * 生成“新增关联技能”需要写回节点的批量更新。
 * 新技能按 skillId 去重并置顶；虚拟机开关原本关闭时追加开启更新，
 * 同时返回 sandboxAutoEnabled 供调用方决定是否提示用户。
 */
export const buildAgentSkillInputUpdates = ({
  nodeId,
  skillsInput,
  sandboxInput,
  selectedAgentSkills,
  skill
}: {
  nodeId: string;
  skillsInput: FlowNodeInputItemType;
  sandboxInput?: FlowNodeInputItemType;
  selectedAgentSkills: SelectedAgentSkillItemType[];
  skill: SelectedAgentSkillItemType;
}): {
  updates: AgentSkillInputUpdate[];
  sandboxAutoEnabled: boolean;
} => {
  const nextSkills = [
    skill,
    ...selectedAgentSkills.filter((item) => item.skillId !== skill.skillId)
  ];
  const sandboxAutoEnabled = !!sandboxInput && !sandboxInput.value;
  const updates: AgentSkillInputUpdate[] = [
    {
      nodeId,
      key: NodeInputKeyEnum.skills,
      type: 'updateInput',
      value: {
        ...skillsInput,
        value: nextSkills
      }
    }
  ];

  if (sandboxAutoEnabled) {
    updates.push({
      nodeId,
      key: NodeInputKeyEnum.useAgentSandbox,
      type: 'updateInput',
      value: {
        ...sandboxInput,
        value: true
      }
    });
  }

  return { updates, sandboxAutoEnabled };
};
