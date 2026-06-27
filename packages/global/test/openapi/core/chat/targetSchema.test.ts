import { describe, expect, it } from 'vitest';
import {
  AudioTranscriptionsDataSchema,
  AudioTranscriptionsFormRawSchema,
  GetPaginationRecordsBodySchema,
  GetRecordsV2BodySchema,
  GetResDataQuerySchema
} from '../../../../openapi/core/chat/record/api';
import {
  ClearChatHistoriesSchema,
  GetHistoriesBodySchema,
  GetHistoryStatusBodySchema,
  MarkChatReadBodySchema
} from '../../../../openapi/core/chat/history/api';
import { UpdateUserFeedbackBodySchema } from '../../../../openapi/core/chat/feedback/api';
import { ResumeStreamParamsSchema } from '../../../../openapi/core/ai/api';
import { ChatSourceTypeEnum } from '../../../../core/chat/constants';
import { StopV2ChatSchema } from '../../../../openapi/core/chat/controler/api';
import { PresignChatFileGetUrlSchema } from '../../../../openapi/core/chat/file/api';
import { SandboxCheckExistBodySchema } from '../../../../openapi/core/ai/sandbox/api';
import { CreateQuestionGuideV2BodySchema } from '../../../../openapi/core/ai/agent/api';

const appId = '68ad85a7463006c963799a05';
const skillId = '68ad85a7463006c963799a06';
const shareId = 'share-1';
const outLinkUid = 'outlink-user-1';
const teamId = '68ad85a7463006c963799a07';
const teamToken = 'team-token-1';

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

  it('transforms question guide skillId to internal skillEdit source with debug model config', () => {
    const result = CreateQuestionGuideV2BodySchema.parse({
      skillId,
      chatId: 'chat-1',
      questionGuide: {
        open: true,
        model: 'debug-model'
      }
    });

    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'chat-1',
      questionGuide: {
        open: true,
        model: 'debug-model'
      }
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

  it('transforms share auth without appId to unresolved app source', () => {
    const historyStatus = GetHistoryStatusBodySchema.parse({
      shareId,
      outLinkUid,
      chatIds: ['chat-1']
    });

    expect(historyStatus).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      chatIds: ['chat-1']
    });
    expect('appId' in historyStatus).toBe(false);
    expect('shareId' in historyStatus).toBe(false);
    expect('outLinkUid' in historyStatus).toBe(false);

    const records = GetRecordsV2BodySchema.parse({
      shareId,
      outLinkUid,
      chatId: 'chat-1',
      pageSize: 10
    });

    expect(records).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      chatId: 'chat-1',
      pageSize: 10
    });
  });

  it('transforms nested outLinkAuthData without appId to unresolved app source', () => {
    const stop = StopV2ChatSchema.parse({
      chatId: 'chat-1',
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });

    expect(stop).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      chatId: 'chat-1'
    });

    const file = PresignChatFileGetUrlSchema.parse({
      key: `chat/${appId}/${outLinkUid}/chat-1/demo.pdf`,
      chatId: 'chat-1',
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });

    expect(file).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      chatId: 'chat-1'
    });

    const sandbox = SandboxCheckExistBodySchema.parse({
      chatId: 'chat-1',
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });

    expect(sandbox).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      chatId: 'chat-1'
    });

    const questionGuide = CreateQuestionGuideV2BodySchema.parse({
      chatId: 'chat-1',
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });

    expect(questionGuide).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      chatId: 'chat-1'
    });
  });

  it('keeps outlink auth fields when app target is provided', () => {
    const result = UpdateUserFeedbackBodySchema.parse({
      appId,
      shareId,
      outLinkUid,
      chatId: 'chat-1',
      dataId: 'data-1',
      userGoodFeedback: 'good'
    });

    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      chatId: 'chat-1',
      dataId: 'data-1'
    });
  });

  it('rejects incomplete or ambiguous auth context', () => {
    expect(() =>
      GetHistoryStatusBodySchema.parse({
        shareId,
        chatIds: ['chat-1']
      })
    ).toThrow();

    expect(() =>
      GetRecordsV2BodySchema.parse({
        skillId,
        shareId,
        outLinkUid,
        chatId: 'chat-1',
        pageSize: 10
      })
    ).toThrow();

    expect(() =>
      GetRecordsV2BodySchema.parse({
        teamId,
        teamToken,
        chatId: 'chat-1',
        pageSize: 10
      })
    ).toThrow();
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

  it('requires a target or share auth when clearing chat histories', () => {
    expect(() => ClearChatHistoriesSchema.parse({})).toThrow();

    expect(ClearChatHistoriesSchema.parse({ appId })).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId
    });

    expect(ClearChatHistoriesSchema.parse({ shareId, outLinkUid })).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });
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
