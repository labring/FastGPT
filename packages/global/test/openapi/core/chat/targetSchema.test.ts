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
  DelChatHistorySchema,
  GetHistoriesBodySchema,
  GetHistoryStatusBodySchema,
  MarkChatReadBodySchema
} from '../../../../openapi/core/chat/history/api';
import { UpdateUserFeedbackBodySchema } from '../../../../openapi/core/chat/feedback/api';
import { ResumeStreamParamsSchema } from '../../../../openapi/core/ai/api';
import { ChatSourceTypeEnum } from '../../../../core/chat/constants';
import { StopV2ChatSchema } from '../../../../openapi/core/chat/controler/api';
import { InitOutLinkChatQuerySchema } from '../../../../openapi/core/chat/outLink/api';
import { PresignChatFileGetUrlSchema } from '../../../../openapi/core/chat/file/api';
import { SandboxCheckExistBodySchema } from '../../../../openapi/core/ai/sandbox/api';
import { CreateQuestionGuideV2BodySchema } from '../../../../openapi/core/ai/agent/api';

const appId = '68ad85a7463006c963799a05';
const skillId = '68ad85a7463006c963799a06';
const shareId = 'share-1';
const outLinkUid = 'outlink-user-1';

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

  it('rejects top-level share auth without outLinkAuthData', () => {
    expect(() =>
      GetHistoryStatusBodySchema.parse({
        shareId,
        outLinkUid,
        chatIds: ['chat-1']
      })
    ).toThrow();
  });

  it('transforms outLinkAuthData without appId to unresolved app source', () => {
    const historyStatus = GetHistoryStatusBodySchema.parse({
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
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
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
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

  it('parses outLink init query string auth data for GET requests', () => {
    const result = InitOutLinkChatQuerySchema.parse({
      chatId: 'chat-1',
      outLinkAuthData: JSON.stringify({
        shareId,
        outLinkUid
      })
    });

    expect(result).toEqual({
      chatId: 'chat-1',
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });
  });

  it('parses string outLinkAuthData before business transforms for chat APIs', () => {
    const result = MarkChatReadBodySchema.parse({
      chatId: 'chat-1',
      outLinkAuthData: JSON.stringify({
        shareId,
        outLinkUid
      })
    });

    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      chatId: 'chat-1'
    });
  });

  it('parses string outLinkAuthData for DELETE chat query schemas', () => {
    const history = DelChatHistorySchema.parse({
      chatId: 'chat-1',
      outLinkAuthData: JSON.stringify({
        shareId,
        outLinkUid
      })
    });

    expect(history).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      chatId: 'chat-1'
    });

    const clear = ClearChatHistoriesSchema.parse({
      outLinkAuthData: JSON.stringify({
        shareId,
        outLinkUid
      })
    });

    expect(clear).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });
  });

  it('rejects app target when share auth is also provided', () => {
    expect(() =>
      UpdateUserFeedbackBodySchema.parse({
        appId,
        outLinkAuthData: {
          shareId,
          outLinkUid
        },
        chatId: 'chat-1',
        dataId: 'data-1',
        userGoodFeedback: 'good'
      })
    ).toThrow();
  });

  it('rejects incomplete or ambiguous auth context', () => {
    expect(() =>
      GetHistoryStatusBodySchema.parse({
        outLinkAuthData: {
          shareId
        },
        chatIds: ['chat-1']
      })
    ).toThrow();

    expect(() =>
      GetRecordsV2BodySchema.parse({
        skillId,
        outLinkAuthData: {
          shareId,
          outLinkUid
        },
        chatId: 'chat-1',
        pageSize: 10
      })
    ).toThrow();

    expect(() =>
      GetRecordsV2BodySchema.parse({
        outLinkAuthData: {
          shareId
        },
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

    expect(
      ClearChatHistoriesSchema.parse({
        outLinkAuthData: {
          shareId,
          outLinkUid
        }
      })
    ).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });
  });

  it('keeps audio transcription form and runtime data on source target contract', () => {
    const form = AudioTranscriptionsFormRawSchema.parse({
      file: 'binary-file-placeholder',
      data: {
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'chat-1',
        outLinkAuthData: {
          shareId,
          outLinkUid
        },
        duration: 3
      }
    });

    expect(form.data).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'chat-1',
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      duration: 3
    });
    expect('skillId' in form.data).toBe(false);

    const runtimeData = AudioTranscriptionsDataSchema.parse(form.data);
    expect(runtimeData).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'chat-1',
      outLinkAuthData: {
        shareId,
        outLinkUid
      },
      duration: 3
    });
    expect('skillId' in runtimeData).toBe(false);
  });
});
