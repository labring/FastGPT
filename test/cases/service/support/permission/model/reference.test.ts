import { describe, expect, it } from 'vitest';
import { getFakeUsers } from '@test/datas/users';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { findReferencingResources } from '@fastgpt/service/support/permission/model/reference';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  DatasetTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

describe('service/support/permission/model/reference', () => {
  it('returns empty array when no apps or datasets reference the model', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;

    const result = await findReferencingResources('nonexistent-model-id', String(member.teamId));
    expect(result).toEqual([]);
  });

  it('finds app that references the model even without collaborators', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    const modelId = 'model-ref-no-collab';

    const app = await MongoApp.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'Unshared App',
      type: AppTypeEnum.workflow,
      modules: [
        {
          name: 'AI Chat',
          flowNodeType: 'chatNode',
          inputs: [
            { key: NodeInputKeyEnum.aiModelId, value: modelId },
            { key: 'temperature', value: 0.7 }
          ]
        }
      ],
      chatConfig: {},
      edges: []
    });

    const creator = await MongoTeamMember.findById(member.tmbId, 'name').lean();

    const result = await findReferencingResources(modelId, String(member.teamId));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      resourceType: 'app',
      resourceId: String(app._id),
      resourceName: 'Unshared App',
      creatorTmbId: String(member.tmbId),
      creatorName: creator?.name || ''
    });
  });

  it('finds dataset that references the model even without collaborators', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    const modelId = 'model-ref-dataset-no-collab';

    const dataset = await MongoDataset.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'Private Dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: modelId,
      vectorModelId: 'other-vector-model',
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    const creator = await MongoTeamMember.findById(member.tmbId, 'name').lean();

    const result = await findReferencingResources(modelId, String(member.teamId));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      resourceType: 'dataset',
      resourceId: String(dataset._id),
      resourceName: 'Private Dataset',
      creatorTmbId: String(member.tmbId),
      creatorName: creator?.name || ''
    });
  });

  it('finds dataset referencing model via vectorModelId', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    const modelId = 'model-ref-vector';

    const dataset = await MongoDataset.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'Vector Model Dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: 'other-model',
      vectorModelId: modelId,
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    const result = await findReferencingResources(modelId, String(member.teamId));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      resourceType: 'dataset',
      resourceName: 'Vector Model Dataset'
    });
  });

  it('finds dataset referencing model via vlmModelId', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    const modelId = 'model-ref-vlm';

    const dataset = await MongoDataset.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'VLM Model Dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: 'other-model',
      vectorModelId: 'another-vector-model',
      vlmModelId: modelId,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    const result = await findReferencingResources(modelId, String(member.teamId));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ resourceType: 'dataset', resourceName: 'VLM Model Dataset' });
  });

  it('filters out apps whose modules contain modelId only as substring in other values', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    const modelId = 'model-123';

    await MongoApp.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'Substring App',
      type: AppTypeEnum.workflow,
      modules: [
        {
          name: 'HTTP Request',
          flowNodeType: 'httpRequest',
          inputs: [{ key: 'url', value: `https://api.example.com/${modelId}/details` }]
        }
      ],
      chatConfig: {},
      edges: []
    });

    const result = await findReferencingResources(modelId, String(member.teamId));
    // extractWorkflowModelIds should not pick up modelId from URL input values
    expect(result).toEqual([]);
  });

  it('finds all apps and datasets regardless of collaborator status in a single batch query', async () => {
    const users = await getFakeUsers(2);
    const [member1, member2] = users.members;
    const modelId = 'model-ref-multi-resource';

    // Create 3 apps that reference the model
    const app1 = await MongoApp.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'App Alpha',
      type: AppTypeEnum.workflow,
      modules: [
        {
          name: 'AI Chat',
          flowNodeType: 'chatNode',
          inputs: [{ key: NodeInputKeyEnum.aiModelId, value: modelId }]
        }
      ],
      chatConfig: {},
      edges: []
    });
    const app2 = await MongoApp.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'App Beta',
      type: AppTypeEnum.workflow,
      modules: [
        {
          name: 'AI Chat',
          flowNodeType: 'chatNode',
          inputs: [{ key: NodeInputKeyEnum.aiModelId, value: modelId }]
        }
      ],
      chatConfig: {},
      edges: []
    });
    const app3 = await MongoApp.create({
      teamId: member1.teamId,
      tmbId: member2.tmbId,
      name: 'App Gamma',
      type: AppTypeEnum.workflow,
      modules: [
        {
          name: 'AI Chat',
          flowNodeType: 'chatNode',
          inputs: [{ key: NodeInputKeyEnum.aiModelId, value: modelId }]
        }
      ],
      chatConfig: {},
      edges: []
    });

    // Create 2 datasets that reference the model
    const ds1 = await MongoDataset.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'Dataset One',
      type: DatasetTypeEnum.dataset,
      agentModelId: modelId,
      vectorModelId: 'other-vector-model',
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });
    const ds2 = await MongoDataset.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'Dataset Two',
      type: DatasetTypeEnum.dataset,
      agentModelId: 'other-agent',
      vectorModelId: modelId,
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    const result = await findReferencingResources(modelId, String(member1.teamId));

    // All 5 resources reference the model (collaborator status no longer matters)
    expect(result).toHaveLength(5);

    const appResults = result.filter((r) => r.resourceType === 'app');
    const datasetResults = result.filter((r) => r.resourceType === 'dataset');

    expect(appResults).toHaveLength(3);
    expect(datasetResults).toHaveLength(2);

    const appNames = appResults.map((r) => r.resourceName).sort();
    expect(appNames).toEqual(['App Alpha', 'App Beta', 'App Gamma']);

    const dsNames = datasetResults.map((r) => r.resourceName).sort();
    expect(dsNames).toEqual(['Dataset One', 'Dataset Two']);

    // Verify creator names are populated via batch query
    const creator1 = await MongoTeamMember.findById(member1.tmbId, 'name').lean();
    const creator2 = await MongoTeamMember.findById(member2.tmbId, 'name').lean();
    const appGamma = appResults.find((r) => r.resourceName === 'App Gamma')!;
    expect(appGamma.creatorName).toBe(creator2?.name || '');
    const appAlpha = appResults.find((r) => r.resourceName === 'App Alpha')!;
    expect(appAlpha.creatorName).toBe(creator1?.name || '');
  });

  it('respects teamId boundary — ignores resources from other teams', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    const modelId = 'model-ref-cross-team';

    await MongoDataset.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'Team1 Dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: modelId,
      vectorModelId: 'other-model',
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    // Correct teamId finds the dataset
    const result = await findReferencingResources(modelId, String(member.teamId));
    expect(result).toHaveLength(1);

    // Different teamId finds nothing
    const result2 = await findReferencingResources(modelId, '000000000000000000000099');
    expect(result2).toEqual([]);
  });

  it('returns correct creatorName for resources owned by different creators', async () => {
    const users = await getFakeUsers(3);
    const [member1, member2, member3] = users.members;
    const modelId = 'model-ref-multi-creator';

    // member1 creates app
    const app = await MongoApp.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'Creator1 App',
      type: AppTypeEnum.workflow,
      modules: [
        {
          name: 'AI Chat',
          flowNodeType: 'chatNode',
          inputs: [{ key: NodeInputKeyEnum.aiModelId, value: modelId }]
        }
      ],
      chatConfig: {},
      edges: []
    });

    // member2 creates dataset
    const dataset = await MongoDataset.create({
      teamId: member1.teamId,
      tmbId: member2.tmbId,
      name: 'Creator2 Dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: modelId,
      vectorModelId: 'other-vector-model',
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    const result = await findReferencingResources(modelId, String(member1.teamId));
    expect(result).toHaveLength(2);

    const appResult = result.find((r) => r.resourceType === 'app')!;
    const dsResult = result.find((r) => r.resourceType === 'dataset')!;

    expect(appResult.creatorTmbId).toBe(String(member1.tmbId));
    expect(dsResult.creatorTmbId).toBe(String(member2.tmbId));

    // Verify each creator has their own name
    const creator1 = await MongoTeamMember.findById(member1.tmbId, 'name').lean();
    const creator2 = await MongoTeamMember.findById(member2.tmbId, 'name').lean();
    expect(appResult.creatorName).toBe(creator1?.name || '');
    expect(dsResult.creatorName).toBe(creator2?.name || '');
  });
});
