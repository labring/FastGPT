import * as createapi from '@/pages/api/support/wallet/usage/createTrainingUsage';
import type { CreateTrainingUsageProps } from '@fastgpt/global/support/wallet/usage/api.d';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('createTrainingUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create training usage successfully with valid dataset', async () => {
    const users = await getFakeUsers(2);
    const user = users.members[0];

    // Create dataset permission
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: user.teamId,
      resourceId: null,
      tmbId: user.tmbId,
      permission: TeamDatasetCreatePermissionVal
    });

    // Create test dataset
    const dataset = await MongoDataset.create({
      name: 'Test Dataset',
      teamId: user.teamId,
      tmbId: user.tmbId,
      type: DatasetTypeEnum.dataset,
      vectorModel: 'text-embedding-ada-002',
      agentModel: 'gpt-3.5-turbo',
      vlmModel: 'gpt-4-vision-preview'
    });

    // Add dataset permission
    await MongoResourcePermission.create({
      resourceType: 'dataset',
      teamId: user.teamId,
      resourceId: dataset._id,
      tmbId: user.tmbId,
      permission: WritePermissionVal
    });

    const requestBody: CreateTrainingUsageProps = {
      name: 'Test Training',
      datasetId: String(dataset._id)
    };

    const res = await Call<CreateTrainingUsageProps>(createapi.default, {
      auth: user,
      body: requestBody
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    expect(res.data).toBeDefined();
    expect(typeof res.data).toBe('string'); // usageId should be a string
  });

  it('should fail when dataset does not exist', async () => {
    const users = await getFakeUsers(1);
    const user = users.members[0];

    const requestBody: CreateTrainingUsageProps = {
      name: 'Test Training',
      datasetId: '507f1f77bcf86cd799439011' // Non-existent dataset ID
    };

    const res = await Call<CreateTrainingUsageProps>(createapi.default, {
      auth: user,
      body: requestBody
    });

    expect(res.error).toBeDefined();
    expect(res.code).not.toBe(200);
  });

  it('should fail when user lacks write permission on dataset', async () => {
    const users = await getFakeUsers(2);
    const owner = users.members[0];
    const unauthorizedUser = users.members[1];

    // Create dataset with owner permissions
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: owner.teamId,
      resourceId: null,
      tmbId: owner.tmbId,
      permission: TeamDatasetCreatePermissionVal
    });

    const dataset = await MongoDataset.create({
      name: 'Test Dataset',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      type: DatasetTypeEnum.dataset,
      vectorModel: 'text-embedding-ada-002',
      agentModel: 'gpt-3.5-turbo'
    });

    // Only give owner permission, not the unauthorized user
    await MongoResourcePermission.create({
      resourceType: 'dataset',
      teamId: owner.teamId,
      resourceId: dataset._id,
      tmbId: owner.tmbId,
      permission: WritePermissionVal
    });

    const requestBody: CreateTrainingUsageProps = {
      name: 'Test Training',
      datasetId: String(dataset._id)
    };

    const res = await Call<CreateTrainingUsageProps>(createapi.default, {
      auth: unauthorizedUser,
      body: requestBody
    });

    expect(res.error).toBeDefined();
    expect(res.code).not.toBe(200);
  });

  it('should fail when required fields are missing', async () => {
    const users = await getFakeUsers(1);
    const user = users.members[0];

    // Test missing name
    const res1 = await Call<Partial<CreateTrainingUsageProps>>(createapi.default, {
      auth: user,
      body: {
        datasetId: '507f1f77bcf86cd799439011'
      }
    });

    expect(res1.error).toBeDefined();
    expect(res1.code).not.toBe(200);

    // Test missing datasetId
    const res2 = await Call<Partial<CreateTrainingUsageProps>>(createapi.default, {
      auth: user,
      body: {
        name: 'Test Training'
      }
    });

    expect(res2.error).toBeDefined();
    expect(res2.code).not.toBe(200);
  });

  it('should handle dataset with optional vlmModel', async () => {
    const users = await getFakeUsers(1);
    const user = users.members[0];

    // Create dataset permission
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: user.teamId,
      resourceId: null,
      tmbId: user.tmbId,
      permission: TeamDatasetCreatePermissionVal
    });

    // Create dataset without vlmModel
    const dataset = await MongoDataset.create({
      name: 'Test Dataset Without VLM',
      teamId: user.teamId,
      tmbId: user.tmbId,
      type: DatasetTypeEnum.dataset,
      vectorModel: 'text-embedding-ada-002',
      agentModel: 'gpt-3.5-turbo'
      // vlmModel is optional
    });

    // Add dataset permission
    await MongoResourcePermission.create({
      resourceType: 'dataset',
      teamId: user.teamId,
      resourceId: dataset._id,
      tmbId: user.tmbId,
      permission: WritePermissionVal
    });

    const requestBody: CreateTrainingUsageProps = {
      name: 'Test Training Without VLM',
      datasetId: String(dataset._id)
    };

    const res = await Call<CreateTrainingUsageProps>(createapi.default, {
      auth: user,
      body: requestBody
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    expect(res.data).toBeDefined();
    expect(typeof res.data).toBe('string');
  });
});
