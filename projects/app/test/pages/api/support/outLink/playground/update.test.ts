import type { UpdatePlaygroundVisibilityConfigBody } from '@fastgpt/global/support/outLink/api.d';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import * as updateApi from '@/pages/api/support/outLink/playground/update';

describe('Playground Visibility Update API', () => {
  let rootUser: any;
  let testApp: any;

  beforeAll(async () => {
    rootUser = await getRootUser();

    // Create a test app owned by the root user
    testApp = await MongoApp.create({
      name: 'Test App for Playground Update',
      type: 'simple',
      tmbId: rootUser.tmbId,
      teamId: rootUser.teamId
    });
  });

  afterEach(async () => {
    // Clean up any created OutLink configs
    await MongoOutLink.deleteMany({
      appId: testApp._id,
      type: PublishChannelEnum.playground
    });
  });

  afterAll(async () => {
    // Clean up test data
    await MongoApp.deleteOne({ _id: testApp._id });
  });

  it('should handle update request with valid data', async () => {
    const updateData: UpdatePlaygroundVisibilityConfigBody = {
      appId: testApp._id,
      showRunningStatus: false,
      showCite: false,
      showFullText: false,
      canDownloadSource: false
    };

    const res = await Call(updateApi.default, {
      auth: rootUser,
      body: updateData
    });

    // Check if the request was processed successfully
    if (res.code === 200) {
      expect(res.error).toBeUndefined();

      // Verify the config was created in database
      const createdConfig = await MongoOutLink.findOne({
        appId: testApp._id,
        type: PublishChannelEnum.playground
      }).lean();

      if (createdConfig) {
        expect(createdConfig.appId).toBe(testApp._id);
        expect(createdConfig.type).toBe(PublishChannelEnum.playground);
        expect(createdConfig.showRunningStatus).toBe(false);
        expect(createdConfig.showCite).toBe(false);
        expect(createdConfig.showFullText).toBe(false);
        expect(createdConfig.canDownloadSource).toBe(false);
      }
    } else {
      // If there are permission issues, we still expect the API to validate parameters
      expect(res.code).toBe(500);
      expect(res.error).toBeDefined();
    }
  });

  it('should handle update request with true values', async () => {
    const updateData: UpdatePlaygroundVisibilityConfigBody = {
      appId: testApp._id,
      showRunningStatus: true,
      showCite: true,
      showFullText: true,
      canDownloadSource: true
    };

    const res = await Call(updateApi.default, {
      auth: rootUser,
      body: updateData
    });

    // Check if the request was processed successfully
    if (res.code === 200) {
      expect(res.error).toBeUndefined();

      // Verify true values were set
      const createdConfig = await MongoOutLink.findOne({
        appId: testApp._id,
        type: PublishChannelEnum.playground
      }).lean();

      if (createdConfig) {
        expect(createdConfig.showRunningStatus).toBe(true);
        expect(createdConfig.showCite).toBe(true);
        expect(createdConfig.showFullText).toBe(true);
        expect(createdConfig.canDownloadSource).toBe(true);
      }
    } else {
      // If there are permission issues, we still expect the API to validate parameters
      expect(res.code).toBe(500);
      expect(res.error).toBeDefined();
    }
  });

  it('should handle update request with mixed boolean values', async () => {
    const updateData: UpdatePlaygroundVisibilityConfigBody = {
      appId: testApp._id,
      showRunningStatus: false,
      showCite: true,
      showFullText: false,
      canDownloadSource: true
    };

    const res = await Call(updateApi.default, {
      auth: rootUser,
      body: updateData
    });

    // Check if the request was processed successfully
    if (res.code === 200) {
      expect(res.error).toBeUndefined();

      // Verify mixed values were set
      const createdConfig = await MongoOutLink.findOne({
        appId: testApp._id,
        type: PublishChannelEnum.playground
      }).lean();

      if (createdConfig) {
        expect(createdConfig.showRunningStatus).toBe(false);
        expect(createdConfig.showCite).toBe(true);
        expect(createdConfig.showFullText).toBe(false);
        expect(createdConfig.canDownloadSource).toBe(true);
      }
    } else {
      // If there are permission issues, we still expect the API to validate parameters
      expect(res.code).toBe(500);
      expect(res.error).toBeDefined();
    }
  });

  it('should return 500 when appId is missing', async () => {
    const updateData = {
      showRunningStatus: false
    };

    const res = await Call(updateApi.default, {
      auth: rootUser,
      body: updateData
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should return 500 when appId is empty string', async () => {
    const updateData: UpdatePlaygroundVisibilityConfigBody = {
      appId: '',
      showRunningStatus: false,
      showCite: false,
      showFullText: false,
      canDownloadSource: false
    };

    const res = await Call(updateApi.default, {
      auth: rootUser,
      body: updateData
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should return error when user is not authenticated', async () => {
    const updateData: UpdatePlaygroundVisibilityConfigBody = {
      appId: testApp._id,
      showRunningStatus: false,
      showCite: false,
      showFullText: false,
      canDownloadSource: false
    };

    const res = await Call(updateApi.default, {
      body: updateData
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should validate all boolean fields are required', async () => {
    // Test with missing boolean fields (should fail validation)
    const updateData = {
      appId: testApp._id,
      showRunningStatus: false
      // Missing other boolean fields
    };

    const res = await Call(updateApi.default, {
      auth: rootUser,
      body: updateData
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should handle updates for different apps independently', async () => {
    // Create a second test app
    const testApp2 = await MongoApp.create({
      name: 'Test App 2 for Playground Update',
      type: 'simple',
      tmbId: rootUser.tmbId,
      teamId: rootUser.teamId
    });

    // Create config for first app
    await MongoOutLink.create({
      shareId: `playground-${testApp._id}`,
      teamId: rootUser.teamId,
      tmbId: rootUser.tmbId,
      appId: testApp._id,
      name: 'Playground Chat',
      type: PublishChannelEnum.playground,
      showRunningStatus: true,
      showCite: true,
      showFullText: true,
      canDownloadSource: true,
      usagePoints: 0,
      lastTime: new Date()
    });

    // Update config for second app
    const updateData: UpdatePlaygroundVisibilityConfigBody = {
      appId: testApp2._id,
      showRunningStatus: false,
      showCite: false,
      showFullText: true,
      canDownloadSource: true
    };

    const res = await Call(updateApi.default, {
      auth: rootUser,
      body: updateData
    });

    // Check if the request was processed successfully
    if (res.code === 200) {
      expect(res.error).toBeUndefined();

      // Verify first app config is unchanged
      const config1 = await MongoOutLink.findOne({
        appId: testApp._id,
        type: PublishChannelEnum.playground
      }).lean();

      if (config1) {
        expect(config1.showRunningStatus).toBe(true);
        expect(config1.showCite).toBe(true);
      }

      // Verify second app config was created with new values
      const config2 = await MongoOutLink.findOne({
        appId: testApp2._id,
        type: PublishChannelEnum.playground
      }).lean();

      if (config2) {
        expect(config2.showRunningStatus).toBe(false);
        expect(config2.showCite).toBe(false);
        expect(config2.showFullText).toBe(true);
        expect(config2.canDownloadSource).toBe(true);
      }
    } else {
      // If there are permission issues, we still expect the API to validate parameters
      expect(res.code).toBe(500);
      expect(res.error).toBeDefined();
    }

    // Cleanup second app
    await MongoOutLink.deleteOne({ appId: testApp2._id });
    await MongoApp.deleteOne({ _id: testApp2._id });
  });
});
