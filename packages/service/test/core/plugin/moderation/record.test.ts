import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ModerationActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import {
  collectionName,
  MongoSystemModerationRecord
} from '../../../../core/plugin/moderation/record/schema';
import {
  createModerationRecord,
  findModerationRecords,
  recordModerationEvent
} from '../../../../core/plugin/moderation/record/entity';

describe('moderation record schema & entity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('schema & index declarations', () => {
    it('declares the correct collection name', () => {
      expect(collectionName).toBe('system_moderation_records');
      expect(MongoSystemModerationRecord.collection.collectionName).toBe(
        'system_moderation_records'
      );
    });

    it('declares the required audit indexes via defineIndex', () => {
      const indexes = MongoSystemModerationRecord.schema.indexes();
      const indexKeys = indexes.map(([key]) => key);

      expect(indexKeys).toContainEqual({ createTime: -1 });
      expect(indexKeys).toContainEqual({ teamId: 1, createTime: -1 });
      expect(indexKeys).toContainEqual({ verdict: 1, createTime: -1 });
      expect(indexKeys).toContainEqual({ stage: 1, createTime: -1 });
      expect(indexKeys).toContainEqual({ appId: 1, createTime: -1 });
    });
  });

  describe('createModerationRecord', () => {
    it('creates a moderation record successfully', async () => {
      const mockCreated = {
        _id: 'rec_1',
        teamId: 'team_1',
        appId: 'app_1',
        stage: ModerationStageEnum.entry,
        targetField: 'query',
        content: 'test text',
        verdict: 'pass',
        keywords: [],
        hits: [],
        actionTaken: ModerationActionEnum.pass,
        duration: 120,
        createTime: new Date(),
        toObject: () => ({
          _id: 'rec_1',
          teamId: 'team_1',
          appId: 'app_1',
          stage: ModerationStageEnum.entry,
          targetField: 'query',
          content: 'test text',
          verdict: 'pass',
          keywords: [],
          hits: [],
          actionTaken: ModerationActionEnum.pass,
          duration: 120,
          createTime: new Date()
        })
      };

      const createSpy = vi
        .spyOn(MongoSystemModerationRecord, 'create')
        .mockResolvedValue([mockCreated] as any);

      const record = await createModerationRecord({
        teamId: 'team_1',
        appId: 'app_1',
        stage: ModerationStageEnum.entry,
        targetField: 'query',
        content: 'test text',
        verdict: 'pass',
        keywords: [],
        hits: [],
        actionTaken: ModerationActionEnum.pass,
        duration: 120
      });

      expect(createSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            teamId: 'team_1',
            appId: 'app_1',
            stage: ModerationStageEnum.entry,
            content: 'test text',
            verdict: 'pass',
            actionTaken: ModerationActionEnum.pass
          })
        ],
        { session: undefined }
      );
      expect(record._id).toBe('rec_1');
    });
  });

  describe('recordModerationEvent (silent async persistence)', () => {
    it('persists record without throwing when successful', async () => {
      const createSpy = vi
        .spyOn(MongoSystemModerationRecord, 'create')
        .mockResolvedValue([{ toObject: () => ({ _id: 'ok' }) }] as any);

      await expect(
        recordModerationEvent({
          stage: ModerationStageEnum.entry,
          content: 'text',
          verdict: 'pass',
          keywords: [],
          hits: [],
          actionTaken: ModerationActionEnum.pass
        })
      ).resolves.toBeUndefined();

      expect(createSpy).toHaveBeenCalled();
    });

    it('swallows database error silently without throwing', async () => {
      vi.spyOn(MongoSystemModerationRecord, 'create').mockRejectedValue(
        new Error('MongoDB network connection lost')
      );

      // Must not throw error to the caller
      await expect(
        recordModerationEvent({
          stage: ModerationStageEnum.output,
          content: 'sensitive text',
          verdict: 'block',
          keywords: ['bad'],
          hits: [],
          actionTaken: ModerationActionEnum.block
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('findModerationRecords', () => {
    it('queries and paginates records with filters', async () => {
      const mockRecords = [
        {
          _id: 'rec_1',
          teamId: 'team_1',
          stage: ModerationStageEnum.entry,
          verdict: 'block',
          actionTaken: ModerationActionEnum.block,
          content: 'bad content',
          keywords: ['bad'],
          hits: [],
          createTime: new Date()
        }
      ];

      vi.spyOn(MongoSystemModerationRecord, 'countDocuments').mockResolvedValue(1 as any);
      vi.spyOn(MongoSystemModerationRecord, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue(mockRecords)
            })
          })
        })
      } as any);

      const result = await findModerationRecords({
        teamId: 'team_1',
        stage: ModerationStageEnum.entry,
        verdict: 'block',
        offset: 0,
        limit: 10
      });

      expect(result.total).toBe(1);
      expect(result.list).toHaveLength(1);
      expect(result.list[0].verdict).toBe('block');
    });
  });
});
