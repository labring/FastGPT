import { describe, expect, it } from 'vitest';
import { getFakeUsers } from '@test/datas/users';
import {
  PerResourceTypeEnum,
  ReadPermissionVal,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
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

  it('returns empty array when app references model but has no collaborators', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    const modelId = 'model-ref-no-collab';

    // Create an app that references the model via workflow modules
    await MongoApp.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'Test App No Collab',
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

    const result = await findReferencingResources(modelId, String(member.teamId));
    expect(result).toEqual([]);
  });

  it('finds app with collaborators that references the model', async () => {
    const users = await getFakeUsers(2);
    const [member1, member2] = users.members;
    const modelId = 'model-ref-with-collab';

    // Owner (member1) creates an app that references the model
    const app = await MongoApp.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'Shared App With Model',
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

    // Add collaborator (member2) to the app
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: member1.teamId,
      resourceId: String(app._id),
      tmbId: member2.tmbId,
      permission: ReadRoleVal
    });

    // Get creator name
    const creator = await MongoTeamMember.findById(member1.tmbId, 'name').lean();

    const result = await findReferencingResources(modelId, String(member1.teamId));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      resourceType: 'app',
      resourceId: String(app._id),
      resourceName: 'Shared App With Model',
      creatorTmbId: String(member1.tmbId),
      creatorName: creator?.name || ''
    });
  });

  it('finds dataset with collaborators that references the model', async () => {
    const users = await getFakeUsers(2);
    const [member1, member2] = users.members;
    const modelId = 'model-ref-dataset-collab';

    // Owner (member1) creates a dataset with the model as agentModel
    const dataset = await MongoDataset.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'Shared Dataset With Model',
      type: DatasetTypeEnum.dataset,
      agentModelId: modelId,
      vectorModelId: 'another-model-id',
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    // Add collaborator (member2) to the dataset
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: member1.teamId,
      resourceId: String(dataset._id),
      tmbId: member2.tmbId,
      permission: ReadRoleVal
    });

    const creator = await MongoTeamMember.findById(member1.tmbId, 'name').lean();

    const result = await findReferencingResources(modelId, String(member1.teamId));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      resourceType: 'dataset',
      resourceId: String(dataset._id),
      resourceName: 'Shared Dataset With Model',
      creatorTmbId: String(member1.tmbId),
      creatorName: creator?.name || ''
    });
  });

  it('finds dataset referencing model via vectorModelId', async () => {
    const users = await getFakeUsers(2);
    const [member1, member2] = users.members;
    const modelId = 'model-ref-vector-collab';

    const dataset = await MongoDataset.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'Vector Model Dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: 'other-model',
      vectorModelId: modelId,
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    // Add collaborator
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: member1.teamId,
      resourceId: String(dataset._id),
      tmbId: member2.tmbId,
      permission: ReadRoleVal
    });

    const result = await findReferencingResources(modelId, String(member1.teamId));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      resourceType: 'dataset',
      resourceName: 'Vector Model Dataset'
    });
  });

  it('finds dataset referencing model via vlmModelId', async () => {
    const users = await getFakeUsers(2);
    const [member1, member2] = users.members;
    const modelId = 'model-ref-vlm-collab';

    const dataset = await MongoDataset.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'VLM Model Dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: 'other-model',
      vectorModelId: 'another-vector-model',
      vlmModelId: modelId,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: member1.teamId,
      resourceId: String(dataset._id),
      tmbId: member2.tmbId,
      permission: ReadRoleVal
    });

    const result = await findReferencingResources(modelId, String(member1.teamId));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ resourceType: 'dataset', resourceName: 'VLM Model Dataset' });
  });

  it('returns empty array when dataset references model but has no collaborators', async () => {
    const users = await getFakeUsers(1);
    const [member] = users.members;
    const modelId = 'model-ref-dataset-no-collab';

    await MongoDataset.create({
      teamId: member.teamId,
      tmbId: member.tmbId,
      name: 'Private Dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: modelId,
      vectorModelId: 'other-vector-model',
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    const result = await findReferencingResources(modelId, String(member.teamId));
    expect(result).toEqual([]);
  });

  it('filters out apps whose modules contain modelId only as substring in other values', async () => {
    const users = await getFakeUsers(2);
    const [member1, member2] = users.members;
    const modelId = 'model-123';

    // Create an app where the only matching value contains modelId as part of a longer string
    const app = await MongoApp.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
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

    // Even with collaborators, the model is not actually referenced
    // because extractWorkflowModelIds only extracts real model references
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: member1.teamId,
      resourceId: String(app._id),
      tmbId: member2.tmbId,
      permission: ReadRoleVal
    });

    const result = await findReferencingResources(modelId, String(member1.teamId));
    // extractWorkflowModelIds should not pick up modelId from URL input values
    expect(result).toEqual([]);
  });

  it('finds multiple apps and datasets with collaborators in a single batch query', async () => {
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
      tmbId: member1.tmbId,
      name: 'App Gamma No Collab',
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

    // Add collaborators to app1, app2 and ds1, ds2 (not app3)
    const collaboratorTmbId = member2.tmbId;
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: member1.teamId,
      resourceId: String(app1._id),
      tmbId: collaboratorTmbId,
      permission: ReadRoleVal
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: member1.teamId,
      resourceId: String(app2._id),
      tmbId: collaboratorTmbId,
      permission: ReadRoleVal
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: member1.teamId,
      resourceId: String(ds1._id),
      tmbId: collaboratorTmbId,
      permission: ReadRoleVal
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: member1.teamId,
      resourceId: String(ds2._id),
      tmbId: collaboratorTmbId,
      permission: ReadRoleVal
    });

    const result = await findReferencingResources(modelId, String(member1.teamId));

    // Should have 4 results: app1, app2, ds1, ds2 (app3 has no collaborators)
    expect(result).toHaveLength(4);

    const appResults = result.filter((r) => r.resourceType === 'app');
    const datasetResults = result.filter((r) => r.resourceType === 'dataset');

    expect(appResults).toHaveLength(2);
    expect(datasetResults).toHaveLength(2);

    const appNames = appResults.map((r) => r.resourceName).sort();
    expect(appNames).toEqual(['App Alpha', 'App Beta']);

    const dsNames = datasetResults.map((r) => r.resourceName).sort();
    expect(dsNames).toEqual(['Dataset One', 'Dataset Two']);

    // All results should have the same creatorTmbId
    for (const item of result) {
      expect(item.creatorTmbId).toBe(String(member1.tmbId));
    }

    // Verify creator names are populated via batch query
    const creator = await MongoTeamMember.findById(member1.tmbId, 'name').lean();
    for (const item of result) {
      expect(item.creatorName).toBe(creator?.name || '');
    }
  });

  it('handles permission with lower access level than ReadPermissionVal correctly', async () => {
    const users = await getFakeUsers(2);
    const [member1, member2] = users.members;
    const modelId = 'model-ref-low-permission';

    const app = await MongoApp.create({
      teamId: member1.teamId,
      tmbId: member1.tmbId,
      name: 'App With Low Permission',
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

    // Grant permission below ReadPermissionVal (e.g., 0 = no access in practical terms)
    // The query uses $gte: ReadPermissionVal, so lower values should be excluded
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: member1.teamId,
      resourceId: String(app._id),
      tmbId: member2.tmbId,
      permission: ReadPermissionVal - 1 // below read threshold
    });

    const result = await findReferencingResources(modelId, String(member1.teamId));
    // Permission below ReadPermissionVal should not count as collaborator
    expect(result).toEqual([]);
  });

  it('respects teamId boundary — ignores resources from other teams', async () => {
    const users1 = await getFakeUsers(2);
    const [team1Member1, team1Member2] = users1.members;
    const modelId = 'model-ref-cross-team';

    // Create datasets with members from getFakeUsers (same team)
    await MongoDataset.create({
      teamId: team1Member1.teamId,
      tmbId: team1Member1.tmbId,
      name: 'Team1 Dataset',
      type: DatasetTypeEnum.dataset,
      agentModelId: modelId,
      vectorModelId: 'other-model',
      vlmModelId: undefined,
      trainingType: DatasetCollectionDataProcessModeEnum.chunk
    });

    // Only team1's resources should appear
    const result = await findReferencingResources(modelId, String(team1Member1.teamId));
    // Dataset exists but has no collaborators yet
    expect(result).toHaveLength(0);

    // Now query with a different teamId — should find nothing
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

    // member3 is collaborator on both
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: member1.teamId,
      resourceId: String(app._id),
      tmbId: member3.tmbId,
      permission: ReadRoleVal
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId: member1.teamId,
      resourceId: String(dataset._id),
      tmbId: member3.tmbId,
      permission: ReadRoleVal
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
