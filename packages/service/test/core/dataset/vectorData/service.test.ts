import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetVectorDataSchema } from '@fastgpt/global/core/dataset/vectorData/type';
import { mockGetVectorCount } from '@test/mocks/common/vector';
import { updateVectorRows } from '@fastgpt/service/core/dataset/vectorData/service';
import { updateDatasetVectorRows } from '@fastgpt/service/core/dataset/vectorData/entity';
import * as vectorController from '@fastgpt/service/common/vectorDB/controller';

describe('dataset vector statistics', () => {
  const teamId = String(new Types.ObjectId());
  const seed = () => MongoDataset.create({ teamId, tmbId: new Types.ObjectId(), name: 'vectors' });
  const read = (id: string) => MongoDataset.findById(id).lean();

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockGetVectorCount.mockReset().mockResolvedValue(50);
    await MongoDataset.deleteMany({});
  });

  describe('updateVectorRows', () => {
    it('keeps old records absent until counting succeeds, then writes all four required fields', async () => {
      const dataset = await seed();
      expect((await read(String(dataset._id)))?.vectorData).toBeUndefined();
      mockGetVectorCount.mockRejectedValueOnce(new Error('database offline'));
      await expect(updateVectorRows({ teamId, datasetId: String(dataset._id) })).rejects.toThrow(
        'database offline'
      );
      expect((await read(String(dataset._id)))?.vectorData).toBeUndefined();

      mockGetVectorCount.mockResolvedValueOnce(0);
      await updateVectorRows({ teamId, datasetId: String(dataset._id) });
      const saved = await read(String(dataset._id));
      expect(saved?.vectorData).toEqual({
        rows: 0,
        rowsUpdatedAt: expect.any(Date),
        pgIndex: 'none',
        pgIndexCheckedAt: expect.any(Date)
      });
      expect(saved?.updateTime).toEqual(dataset.updateTime);
      expect(mockGetVectorCount).toHaveBeenLastCalledWith({
        teamId,
        datasetId: String(dataset._id)
      });
    });

    it('skips wrong teams, folders and deleted datasets without scanning their vectors', async () => {
      const dataset = await seed();
      await updateVectorRows({
        teamId: String(new Types.ObjectId()),
        datasetId: String(dataset._id)
      });
      await MongoDataset.updateOne(
        { _id: dataset._id },
        { $set: { type: DatasetTypeEnum.folder } }
      );
      await updateVectorRows({ teamId, datasetId: String(dataset._id) });
      await MongoDataset.updateOne(
        { _id: dataset._id },
        { $set: { type: DatasetTypeEnum.dataset, deleteTime: new Date() } }
      );
      await updateVectorRows({ teamId, datasetId: String(dataset._id) });
      expect(mockGetVectorCount).not.toHaveBeenCalled();
    });

    it('does not publish invalid counts or resurrect a dataset deleted during counting', async () => {
      const dataset = await seed();
      mockGetVectorCount.mockResolvedValueOnce(-1);
      await expect(updateVectorRows({ teamId, datasetId: String(dataset._id) })).rejects.toThrow();
      expect((await read(String(dataset._id)))?.vectorData).toBeUndefined();
      mockGetVectorCount.mockImplementationOnce(async () => {
        await MongoDataset.updateOne({ _id: dataset._id }, { $set: { deleteTime: new Date() } });
        return 5;
      });
      await updateVectorRows({ teamId, datasetId: String(dataset._id) });
      expect((await read(String(dataset._id)))?.vectorData).toBeUndefined();
    });

    it('uses the explicit team refresh path for a team-only job', async () => {
      const refresh = vi.spyOn(vectorController, 'refreshTeamVectorCount').mockResolvedValue(123);
      await updateVectorRows({ teamId });
      expect(refresh).toHaveBeenCalledWith(teamId);
      expect(mockGetVectorCount).not.toHaveBeenCalled();
    });
  });

  describe('updateDatasetVectorRows', () => {
    it('keeps newer counts and independently managed PG status during later writes', async () => {
      const dataset = await seed();
      const snapshot = DatasetVectorDataSchema.parse({
        rows: 20,
        rowsUpdatedAt: new Date('2026-10-22T00:00:00Z'),
        pgIndex: 'none',
        pgIndexCheckedAt: new Date('2026-10-22T00:00:01Z')
      });
      const scope = { teamId, datasetId: String(dataset._id) };
      await updateDatasetVectorRows({ ...scope, snapshot });
      await MongoDataset.updateOne(
        { _id: dataset._id },
        { $set: { 'vectorData.pgIndex': 'ready' } }
      );
      await updateDatasetVectorRows({
        ...scope,
        snapshot: { ...snapshot, rows: 30, rowsUpdatedAt: new Date('2026-10-22T00:01:00Z') }
      });
      await updateDatasetVectorRows({ ...scope, snapshot: { ...snapshot, rows: 1 } });
      expect((await read(scope.datasetId))?.vectorData).toEqual({
        ...snapshot,
        rows: 30,
        rowsUpdatedAt: new Date('2026-10-22T00:01:00Z'),
        pgIndex: 'ready'
      });
    });

    it('requires every field whenever the optional subdocument is present', async () => {
      const dataset = await seed();
      const snapshot = {
        rows: 0,
        rowsUpdatedAt: new Date(),
        pgIndex: 'none',
        pgIndexCheckedAt: new Date()
      };
      for (const key of Object.keys(snapshot)) {
        const incomplete: Partial<typeof snapshot> = { ...snapshot };
        delete incomplete[key as keyof typeof incomplete];
        dataset.set('vectorData', incomplete);
        await expect(dataset.validate()).rejects.toThrow();
      }
      dataset.set('vectorData', snapshot);
      await expect(dataset.validate()).resolves.toBeUndefined();
    });
  });
});
