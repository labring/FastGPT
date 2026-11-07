import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { TrackModel } from '@fastgpt/service/common/middle/tracks/schema';
import { countTrackTimer } from '@fastgpt/service/common/middle/tracks/processor';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';

vi.unmock('@fastgpt/service/common/middle/tracks/utils');

describe('Workflow Builder track persistence', () => {
  beforeAll(async () => {
    await TrackModel.createIndexes();
  });
  beforeEach(() => {
    global.feConfigs = { ...global.feConfigs, isPlus: true };
    global.countTrackQueue = new Map();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T10:59:59Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('groups by the click hour instead of the flush hour without recording identity', async () => {
    pushTrack.workflowBuilderClick();
    pushTrack.workflowBuilderClick();
    vi.setSystemTime(new Date('2026-10-27T11:00:00Z'));
    pushTrack.workflowBuilderClick();
    await countTrackTimer();

    const records = await TrackModel.find({ event: TrackEnum.workflowBuilderClick })
      .sort({ createTime: 1 })
      .lean();
    expect(records.map(({ _id, __v, ...record }) => record)).toEqual([
      {
        event: TrackEnum.workflowBuilderClick,
        createTime: new Date('2026-10-27T10:00:00Z'),
        data: { count: 2 }
      },
      {
        event: TrackEnum.workflowBuilderClick,
        createTime: new Date('2026-10-27T11:00:00Z'),
        data: { count: 1 }
      }
    ]);
  });

  it('merges concurrent flushes into one global hourly record', async () => {
    pushTrack.workflowBuilderClick();
    const first = countTrackTimer();
    pushTrack.workflowBuilderClick();
    const second = countTrackTimer();
    await Promise.all([first, second]);

    expect(await TrackModel.countDocuments()).toBe(1);
    expect(await TrackModel.findOne().lean()).toMatchObject({ data: { count: 2 } });
  });

  it('keeps chain events separate and only stores the five business fields', async () => {
    const input = {
      teamId: 'team-1',
      tmbId: 'member-1',
      appId: 'app-1',
      chatId: 'chat-1',
      event: TrackEnum.workflowBuilderApplyFailed,
      reason: 'private error'
    };
    await Promise.all([pushTrack.workflowBuilder(input), pushTrack.workflowBuilder(input)]);
    const records = await TrackModel.find().lean();

    expect(records).toHaveLength(2);
    for (const { _id, __v, createTime, ...record } of records) {
      expect(record).toEqual({
        teamId: input.teamId,
        tmbId: input.tmbId,
        event: input.event,
        data: { appId: input.appId, chatId: input.chatId }
      });
      expect(createTime).toBeInstanceOf(Date);
    }
  });

  it('preserves the existing dataset and QPM counters', async () => {
    for (let i = 0; i < 2; i++) {
      pushTrack.datasetSearch({ teamId: 'team-1', datasetIds: ['dataset-1'] });
      pushTrack.teamChatQPM({ teamId: 'team-1' });
    }
    await countTrackTimer();
    expect(await TrackModel.countDocuments()).toBe(2);
    expect(await TrackModel.findOne({ event: TrackEnum.datasetSearch }).lean()).toMatchObject({
      teamId: 'team-1',
      data: { datasetId: 'dataset-1', count: 2 }
    });
    expect(await TrackModel.findOne({ event: TrackEnum.teamChatQPM }).lean()).toMatchObject({
      teamId: 'team-1',
      data: { requestCount: 2 }
    });
  });
});
