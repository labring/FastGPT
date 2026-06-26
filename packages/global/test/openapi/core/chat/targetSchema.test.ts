import { describe, expect, it } from 'vitest';
import {
  AudioTranscriptionsDataSchema,
  AudioTranscriptionsFormRawSchema,
  GetPaginationRecordsBodySchema,
  GetRecordsV2BodySchema,
  GetResDataQuerySchema
} from '../../../../openapi/core/chat/record/api';
import {
  GetHistoriesBodySchema,
  MarkChatReadBodySchema
} from '../../../../openapi/core/chat/history/api';
import { ResumeStreamParamsSchema } from '../../../../openapi/core/ai/api';
import { ChatSourceTypeEnum } from '../../../../core/chat/constants';

const appId = '68ad85a7463006c963799a05';
const skillId = '68ad85a7463006c963799a06';

describe('openapi/core/chat target schema', () => {
  it('transforms raw appId to internal app source', () => {
    const result = MarkChatReadBodySchema.parse({
      appId,
      chatId: 'chat-1'
    });

    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId: 'chat-1'
    });
    expect('appId' in result).toBe(false);
  });

  it('transforms raw skillId to internal skillEdit source', () => {
    const result = GetResDataQuerySchema.parse({
      skillId,
      chatId: 'chat-1',
      dataId: 'data-1'
    });

    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'chat-1',
      dataId: 'data-1'
    });
    expect('skillId' in result).toBe(false);
  });

  it('rejects required target when appId and skillId are both provided', () => {
    const payload = {
      appId,
      skillId,
      chatId: 'chat-1'
    };

    expect(() => MarkChatReadBodySchema.parse(payload)).toThrow();
    expect(() =>
      GetPaginationRecordsBodySchema.parse({
        ...payload,
        pageSize: 10,
        offset: 0
      })
    ).toThrow();
    expect(() =>
      GetRecordsV2BodySchema.parse({
        ...payload,
        pageSize: 10
      })
    ).toThrow();
    expect(() => ResumeStreamParamsSchema.parse(payload)).toThrow();
  });

  it('rejects required target when appId and skillId are both missing', () => {
    expect(() => MarkChatReadBodySchema.parse({ chatId: 'chat-1' })).toThrow();
  });

  it('allows optional target to be omitted but rejects ambiguous optional target', () => {
    expect(
      GetHistoriesBodySchema.parse({
        pageSize: 10,
        offset: 0
      })
    ).toMatchObject({
      pageSize: 10,
      offset: 0
    });

    expect(() =>
      GetHistoriesBodySchema.parse({
        appId,
        skillId,
        pageSize: 10,
        offset: 0
      })
    ).toThrow();
  });

  it('keeps audio transcription OpenAPI form raw while runtime data transforms to source', () => {
    const form = AudioTranscriptionsFormRawSchema.parse({
      file: 'binary-file-placeholder',
      data: {
        skillId,
        chatId: 'chat-1',
        duration: 3
      }
    });

    expect(form.data).toMatchObject({
      skillId,
      chatId: 'chat-1',
      duration: 3
    });
    expect('sourceType' in form.data).toBe(false);
    expect('sourceId' in form.data).toBe(false);

    const runtimeData = AudioTranscriptionsDataSchema.parse(form.data);
    expect(runtimeData).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'chat-1',
      duration: 3
    });
    expect('skillId' in runtimeData).toBe(false);
  });
});
