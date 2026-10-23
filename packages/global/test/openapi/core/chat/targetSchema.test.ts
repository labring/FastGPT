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
import {
  PresignChatFileGetUrlSchema,
  PresignChatFilePostUrlSchema,
  PresignDraftChatFilePostUrlSchema
} from '../../../../openapi/core/chat/file/api';
import { SandboxCheckExistBodySchema } from '../../../../openapi/core/ai/sandbox/api';
import { CreateQuestionGuideV2BodySchema } from '../../../../openapi/core/ai/agent/api';
import { ExportCollectionBodySchema } from '../../../../openapi/core/dataset/collection/api';
import {
  buildChatTargetResponse,
  createOutLinkChatTargetInputSchema,
  createOutLinkChatTargetQuerySchema,
  createOptionalOutLinkChatTargetInputSchema,
  createPaginatedChatTargetInputSchema
} from '../../../../openapi/core/chat/api';
import z from 'zod';

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

  it('transforms raw appId with chatAgentHelper sourceType to internal chatAgentHelper source', () => {
    const result = StopV2ChatSchema.parse({
      appId,
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      chatId: 'chat-1'
    });

    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: appId,
      chatId: 'chat-1'
    });
    expect('appId' in result).toBe(false);
  });

  it('transforms raw appId with workflowBuilder sourceType to internal builder source', () => {
    const result = SandboxCheckExistBodySchema.parse({
      appId,
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      chatId: 'chat-1'
    });

    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: appId,
      chatId: 'chat-1'
    });
    expect(buildChatTargetResponse(result)).toEqual({
      appId,
      sourceType: ChatSourceTypeEnum.workflowBuilder
    });
  });

  it('allows workflowBuilder source for audio transcription', () => {
    expect(
      AudioTranscriptionsDataSchema.parse({
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        sourceId: appId,
        chatId: 'chat-1'
      })
    ).toMatchObject({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: appId,
      chatId: 'chat-1'
    });
  });

  it('transforms question guide skillId to internal skillEdit source with debug model config', () => {
    const result = CreateQuestionGuideV2BodySchema.parse({
      skillId,
      chatId: 'chat-1',
      questionGuide: {
        open: true,
        modelId: appId
      }
    });

    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'chat-1',
      questionGuide: {
        open: true,
        modelId: appId
      }
    });
    expect('skillId' in result).toBe(false);
  });

  it('prefers skillId over appId and ignores the lower-priority sourceType', () => {
    const payload = {
      appId,
      skillId,
      chatId: 'chat-1'
    };

    expect(MarkChatReadBodySchema.parse(payload)).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId
    });
    expect(
      StopV2ChatSchema.parse({
        skillId,
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        chatId: 'chat-1'
      })
    ).toMatchObject({ sourceType: ChatSourceTypeEnum.skillEdit, sourceId: skillId });
    expect(
      StopV2ChatSchema.parse({
        skillId,
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        chatId: 'chat-1'
      })
    ).toMatchObject({ sourceType: ChatSourceTypeEnum.skillEdit, sourceId: skillId });
    expect(
      GetPaginationRecordsBodySchema.parse({
        ...payload,
        pageSize: 10,
        offset: 0
      })
    ).toMatchObject({ sourceType: ChatSourceTypeEnum.skillEdit, sourceId: skillId });
    expect(
      GetRecordsV2BodySchema.parse({
        ...payload,
        pageSize: 10
      })
    ).toMatchObject({ sourceType: ChatSourceTypeEnum.skillEdit, sourceId: skillId });
    expect(ResumeStreamParamsSchema.parse(payload)).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId
    });
  });

  it.each([
    { name: 'required', createSchema: createOutLinkChatTargetInputSchema },
    { name: 'optional', createSchema: createOptionalOutLinkChatTargetInputSchema },
    { name: 'paginated', createSchema: createPaginatedChatTargetInputSchema },
    { name: 'query', createSchema: createOutLinkChatTargetQuerySchema }
  ])(
    'keeps context priority without falling back on invalid $name input',
    ({ createSchema, name }) => {
      const schema = createSchema({ chatId: z.string() });
      const business = { chatId: 'chat-1' };
      const outLinkAuthData = { shareId, outLinkUid };
      const skill = schema.parse({
        ...business,
        appId: 'invalid-low-priority-app',
        skillId,
        sourceType: 'invalid-low-priority-source'
      });
      expect(skill).toMatchObject({ ...business, skillId });
      expect(skill.appId).toBeUndefined();
      expect(skill.sourceType).toBeUndefined();

      const external = name === 'query' ? JSON.stringify(outLinkAuthData) : outLinkAuthData;
      const share = schema.parse({
        ...business,
        appId: 'invalid-low-priority-app',
        skillId: 'invalid-low-priority-skill',
        sourceType: 'invalid-low-priority-source',
        outLinkAuthData: external
      });
      expect(share).toMatchObject({ ...business, outLinkAuthData });
      expect(share.appId).toBeUndefined();
      expect(share.skillId).toBeUndefined();
      expect(share.sourceType).toBeUndefined();
      expect(
        schema.safeParse({
          ...business,
          outLinkAuthData: name === 'query' ? outLinkAuthData : JSON.stringify(outLinkAuthData)
        }).success
      ).toBe(false);

      for (const invalid of [null, {}, { shareId }, 'invalid-json']) {
        expect(
          schema.safeParse({ ...business, appId, skillId, outLinkAuthData: invalid }).success
        ).toBe(false);
      }
      for (const invalid of [null, '', 'invalid-id']) {
        expect(schema.safeParse({ ...business, appId, skillId: invalid }).success).toBe(false);
      }
      expect(schema.safeParse({ ...business, appId, sourceType: 'invalid-source' }).success).toBe(
        false
      );
    }
  );

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

  it('strips client file policy from runtime uploads and keeps it for internal drafts', () => {
    const runtimeUpload = PresignChatFilePostUrlSchema.parse({
      appId,
      chatId: 'chat-1',
      filename: 'tool.exe',
      fileSelectConfig: {
        canSelectCustomFileExtension: true,
        customFileExtensionList: ['.exe']
      }
    });

    expect(runtimeUpload).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId: 'chat-1',
      filename: 'tool.exe'
    });
    expect('fileSelectConfig' in runtimeUpload).toBe(false);

    const draftUpload = PresignDraftChatFilePostUrlSchema.parse({
      appId,
      chatId: 'chat-1',
      filename: 'tool.exe',
      fileSelectConfig: {
        canSelectCustomFileExtension: true,
        customFileExtensionList: ['.exe']
      }
    });

    expect(draftUpload).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      fileSelectConfig: {
        canSelectCustomFileExtension: true,
        customFileExtensionList: ['.exe']
      }
    });
  });

  it('rejects external-link-only targets from draft uploads', () => {
    expect(() =>
      PresignDraftChatFilePostUrlSchema.parse({
        chatId: 'chat-1',
        filename: 'notes.txt',
        fileSelectConfig: {
          canSelectFile: true
        },
        outLinkAuthData: {
          shareId,
          outLinkUid
        }
      })
    ).toThrow();
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

  it('rejects string outLinkAuthData in chat Body requests', () => {
    expect(() =>
      MarkChatReadBodySchema.parse({
        chatId: 'chat-1',
        outLinkAuthData: JSON.stringify({ shareId, outLinkUid })
      })
    ).toThrow();
  });

  it('transforms outLink-only dataset collection export to unresolved app source', () => {
    const result = ExportCollectionBodySchema.parse({
      collectionId: appId,
      chatId: 'chat-1',
      chatItemDataId: 'chat-item-1',
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });

    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      collectionId: appId,
      chatId: 'chat-1',
      chatItemDataId: 'chat-item-1',
      outLinkAuthData: {
        shareId,
        outLinkUid
      }
    });

    expect(
      ExportCollectionBodySchema.parse({
        collectionId: appId,
        appId,
        chatId: 'chat-1',
        chatItemDataId: 'chat-item-1',
        outLinkAuthData: {
          shareId,
          outLinkUid
        }
      })
    ).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: { shareId, outLinkUid }
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

  it('prefers share auth when an app target is also provided', () => {
    expect(
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
    ).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: { shareId, outLinkUid }
    });
  });

  it('rejects incomplete share auth and prefers complete share auth over a skill', () => {
    expect(() =>
      GetHistoryStatusBodySchema.parse({
        outLinkAuthData: {
          shareId
        },
        chatIds: ['chat-1']
      })
    ).toThrow();

    expect(
      GetRecordsV2BodySchema.parse({
        skillId,
        outLinkAuthData: {
          shareId,
          outLinkUid
        },
        chatId: 'chat-1',
        pageSize: 10
      })
    ).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined,
      outLinkAuthData: { shareId, outLinkUid }
    });

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

  it('requires a target for session lists and preserves pagination priority in every auth mode', () => {
    expect(() => GetHistoriesBodySchema.parse({ pageSize: 10, offset: 0 })).toThrow();
    expect(GetHistoriesBodySchema.parse({ appId, skillId, offset: 0 })).toMatchObject({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      offset: 0
    });

    for (const target of [{ appId }, { skillId }, { outLinkAuthData: { shareId, outLinkUid } }]) {
      const offsetResult = GetHistoriesBodySchema.parse({ ...target, offset: 0, pageNum: -1 });
      expect(offsetResult).toMatchObject({ offset: 0, pageSize: 20 });
      expect(offsetResult).not.toHaveProperty('pageNum');
      const pageResult = GetHistoriesBodySchema.parse({ ...target, pageNum: 2 });
      expect(pageResult).toMatchObject({ pageNum: 2, pageSize: 20 });
      expect(pageResult).not.toHaveProperty('offset');
      expect(() => GetHistoriesBodySchema.parse({ ...target, offset: -1, pageNum: 2 })).toThrow();
    }
  });

  it('requires a target or share auth when clearing chat histories', () => {
    expect(() => ClearChatHistoriesSchema.parse({})).toThrow();

    expect(ClearChatHistoriesSchema.parse({ appId })).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId
    });

    expect(
      ClearChatHistoriesSchema.parse({
        outLinkAuthData: JSON.stringify({ shareId, outLinkUid })
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
