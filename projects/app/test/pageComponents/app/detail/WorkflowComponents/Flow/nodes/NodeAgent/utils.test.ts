import { describe, expect, it } from 'vitest';
import {
  buildAgentSkillInputUpdates,
  restoreDatasetParams
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeAgent/utils';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';

const getInput = (key: NodeInputKeyEnum) => {
  const input = AgentNode.inputs.find((item) => item.key === key);
  if (!input) throw new Error(`missing agent node input: ${key}`);
  return input;
};

describe('buildAgentSkillInputUpdates', () => {
  const oldSkill: SelectedAgentSkillItemType = {
    skillId: 'skill-1',
    name: 'Old skill',
    description: ''
  };
  const newSkill: SelectedAgentSkillItemType = {
    skillId: 'skill-2',
    name: 'New skill',
    description: ''
  };

  it('prepends the new skill and dedupes by skillId', () => {
    const { updates, sandboxAutoEnabled } = buildAgentSkillInputUpdates({
      nodeId: 'node-1',
      skillsInput: { ...getInput(NodeInputKeyEnum.skills), value: [oldSkill] },
      sandboxInput: { ...getInput(NodeInputKeyEnum.useAgentSandbox), value: true },
      selectedAgentSkills: [oldSkill, newSkill],
      skill: oldSkill
    });

    expect(updates).toHaveLength(1);
    expect(sandboxAutoEnabled).toBe(false);
    expect(updates[0]).toMatchObject({
      nodeId: 'node-1',
      key: NodeInputKeyEnum.skills,
      type: 'updateInput'
    });
    expect(updates[0].value.value).toEqual([oldSkill, newSkill]);
  });

  it('enables sandbox together with the skill when it was off', () => {
    const { updates, sandboxAutoEnabled } = buildAgentSkillInputUpdates({
      nodeId: 'node-1',
      skillsInput: { ...getInput(NodeInputKeyEnum.skills), value: [oldSkill] },
      sandboxInput: { ...getInput(NodeInputKeyEnum.useAgentSandbox), value: false },
      selectedAgentSkills: [oldSkill],
      skill: newSkill
    });

    expect(sandboxAutoEnabled).toBe(true);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({
      nodeId: 'node-1',
      key: NodeInputKeyEnum.useAgentSandbox,
      type: 'updateInput',
      value: { value: true }
    });
    expect(updates[0].value.value).toEqual([newSkill, oldSkill]);
  });

  it('only updates skills when sandbox is already on or missing', () => {
    const onResult = buildAgentSkillInputUpdates({
      nodeId: 'node-1',
      skillsInput: { ...getInput(NodeInputKeyEnum.skills), value: [] },
      sandboxInput: { ...getInput(NodeInputKeyEnum.useAgentSandbox), value: true },
      selectedAgentSkills: [],
      skill: newSkill
    });
    expect(onResult.updates).toHaveLength(1);
    expect(onResult.sandboxAutoEnabled).toBe(false);

    const missingResult = buildAgentSkillInputUpdates({
      nodeId: 'node-1',
      skillsInput: { ...getInput(NodeInputKeyEnum.skills), value: [] },
      selectedAgentSkills: [],
      skill: newSkill
    });
    expect(missingResult.updates).toHaveLength(1);
    expect(missingResult.sandboxAutoEnabled).toBe(false);
  });

  it('does not mutate the input skill list', () => {
    const selectedAgentSkills = [oldSkill];
    const skillsInput = { ...getInput(NodeInputKeyEnum.skills), value: [oldSkill] };

    buildAgentSkillInputUpdates({
      nodeId: 'node-1',
      skillsInput,
      sandboxInput: { ...getInput(NodeInputKeyEnum.useAgentSandbox), value: false },
      selectedAgentSkills,
      skill: newSkill
    });

    expect(selectedAgentSkills).toEqual([oldSkill]);
    expect(skillsInput.value).toEqual([oldSkill]);
  });
});

describe('restoreDatasetParams', () => {
  it('restores saved model IDs into empty fields and preserves them when editing similarity', () => {
    const inputs = AgentNode.inputs.map((input) => ({
      ...input,
      value:
        input.key === NodeInputKeyEnum.datasetSearchRerankModelId
          ? 'saved-rerank'
          : input.key === NodeInputKeyEnum.datasetSearchExtensionModelId
            ? 'saved-llm'
            : input.value
    }));
    const state = {
      rerankModelId: undefined,
      datasetSearchExtensionModelId: undefined,
      similarity: 0.5
    };
    const restored = restoreDatasetParams({ state, inputs });
    expect(restored).toMatchObject({
      rerankModelId: 'saved-rerank',
      datasetSearchExtensionModelId: 'saved-llm'
    });
    const edited = { ...restored, similarity: 0.8 };
    expect(
      restoreDatasetParams({
        state: edited,
        inputs: inputs.filter((input) => input.key !== NodeInputKeyEnum.datasetSimilarity)
      })
    ).toBe(edited);
    expect(state.rerankModelId).toBeUndefined();
  });

  it('ignores unrelated inputs, preserves defaults for missing values and avoids unnecessary updates', () => {
    const state = { rerankModelId: 'saved', similarity: 0 };
    expect(restoreDatasetParams({ state, inputs: [] })).toBe(state);
    const inputs = AgentNode.inputs.filter(
      (input) => input.key !== NodeInputKeyEnum.datasetSimilarity
    );
    expect(restoreDatasetParams({ state, inputs })).toBe(state);
  });
});
