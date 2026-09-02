import handler, { getAppCreateTimeFromObjectId } from '@/pages/api/admin/4163/initAppCreateTime';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('getAppCreateTimeFromObjectId', () => {
  it('skips invalid ids instead of guessing', () => {
    expect(getAppCreateTimeFromObjectId('invalid-app-id')).toBeUndefined();
    expect(getAppCreateTimeFromObjectId(undefined)).toBeUndefined();
  });
});

describe('admin/4163/initAppCreateTime', () => {
  it('dry-run scans missing createTime but does not write', async () => {
    const user = await getRootUser();
    const app = await MongoApp.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      name: '待回填',
      type: AppTypeEnum.simple
    });
    await MongoApp.updateOne({ _id: app._id }, { $unset: { createTime: 1 } });

    const result = await Call(handler, {
      auth: user,
      body: {}
    });

    expect(result.code).toBe(200);
    expect(result.data.dryRun).toBe(true);
    expect(result.data.scannedRecords).toBeGreaterThanOrEqual(1);
    expect(result.data.updatedRecords).toBe(0);

    const after = await MongoApp.findById(app._id).lean();
    expect(after?.createTime).toBeUndefined();
  });

  it('回填缺失 createTime，且不覆盖已有值', async () => {
    const user = await getRootUser();
    const existingTime = new Date('2024-01-01T00:00:00.000Z');
    const [missing, kept] = await MongoApp.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        name: '缺失 createTime',
        type: AppTypeEnum.simple
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        name: '已有 createTime',
        type: AppTypeEnum.simple,
        createTime: existingTime
      }
    ]);
    await MongoApp.updateOne({ _id: missing._id }, { $unset: { createTime: 1 } });

    const result = await Call(handler, {
      auth: user,
      body: { dryRun: false }
    });

    expect(result.code).toBe(200);
    expect(result.data.dryRun).toBe(false);
    expect(result.data.updatedRecords).toBeGreaterThanOrEqual(1);

    const migrated = await MongoApp.findById(missing._id).lean();
    const untouched = await MongoApp.findById(kept._id).lean();

    expect(migrated?.createTime).toEqual(missing._id.getTimestamp());
    expect(untouched?.createTime).toEqual(existingTime);
  });
});
