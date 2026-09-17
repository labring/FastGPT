import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import deleteHandler from '@/pages/api/core/app/batch/delete';
import moveHandler from '@/pages/api/core/app/batch/move';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import mongoose from 'mongoose';

vi.mock('@fastgpt/dal/redis/bullmq', () => {
  const bullMQ = {
    getQueue: vi.fn(),
    getWorker: vi.fn()
  };

  return {
    bullMQ,
    appDeleteMQService: {
      addJob: vi.fn().mockResolvedValue({ id: 'mock-job' })
    },
    QueueNames: {
      appDelete: 'appDelete'
    }
  };
});

describe('App Batch API Integration', () => {
  let rootUser: any;

  beforeEach(async () => {
    rootUser = await getRootUser();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Batch Delete', () => {
    it('should successfully delete multiple apps and handle partial failure', async () => {
      const app1 = await MongoApp.create({
        name: 'Batch Test App 1',
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        type: AppTypeEnum.simple,
        modules: []
      });
      const app2 = await MongoApp.create({
        name: 'Batch Test App 2',
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        type: AppTypeEnum.simple,
        modules: []
      });
      const fakeId = new mongoose.Types.ObjectId().toString();

      const response = await Call(deleteHandler, {
        auth: rootUser,
        body: {
          ids: [String(app1._id), String(app2._id), fakeId]
        }
      });

      expect(response.code).toBe(200);
      expect(response.data.successIds).toContain(String(app1._id));
      expect(response.data.successIds).toContain(String(app2._id));
      expect(response.data.failedIds).toContain(fakeId);
      expect(response.data.affectedIds).toContain(String(app1._id));
      expect(response.data.affectedIds).toContain(String(app2._id));

      const checkApp1 = await MongoApp.findById(app1._id);
      const checkApp2 = await MongoApp.findById(app2._id);
      expect(checkApp1?.deleteTime).not.toBeNull();
      expect(checkApp2?.deleteTime).not.toBeNull();

      await MongoApp.deleteMany({ _id: { $in: [app1._id, app2._id] } });
    });
  });

  describe('Batch Move', () => {
    it('should successfully move apps to a target folder and root', async () => {
      const targetFolder = await MongoApp.create({
        name: 'Batch Move Target Folder',
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        type: AppTypeEnum.folder
      });
      const app1 = await MongoApp.create({
        name: 'Move Test App 1',
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        type: AppTypeEnum.simple,
        modules: []
      });
      const app2 = await MongoApp.create({
        name: 'Move Test App 2',
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        type: AppTypeEnum.simple,
        modules: []
      });

      // Move to folder
      const moveResponse = await Call(moveHandler, {
        auth: rootUser,
        body: {
          ids: [String(app1._id), String(app2._id)],
          parentId: String(targetFolder._id)
        }
      });

      expect(moveResponse.code).toBe(200);
      expect(moveResponse.data.successIds).toEqual(
        expect.arrayContaining([String(app1._id), String(app2._id)])
      );
      expect(moveResponse.data.failedIds).toEqual([]);

      const updatedApp1 = await MongoApp.findById(app1._id);
      expect(String(updatedApp1?.parentId)).toBe(String(targetFolder._id));

      // Move back to root
      const rootMoveResponse = await Call(moveHandler, {
        auth: rootUser,
        body: {
          ids: [String(app1._id)],
          parentId: null
        }
      });

      expect(rootMoveResponse.code).toBe(200);
      expect(rootMoveResponse.data.successIds).toContain(String(app1._id));
      const rootApp1 = await MongoApp.findById(app1._id);
      expect(rootApp1?.parentId).toBeNull();

      await MongoApp.deleteMany({ _id: { $in: [app1._id, app2._id, targetFolder._id] } });
    });
  });
});
