import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { axios } from '@fastgpt/service/common/api/axios';
import { serviceEnv } from '@fastgpt/service/env';
import { loadRequestMessages } from '@fastgpt/service/core/ai/llm/utils';
import { getChatMessages } from '@fastgpt/service/core/workflow/dispatch/ai/chat/chatMessages';
import { getInputFiles } from '@fastgpt/service/core/workflow/dispatch/ai/chat/fileContext';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn(async () => 1),
  countGptMessagesTokensBatch: vi.fn(async (groups: unknown[]) => groups.map(() => 1))
}));
vi.mock('@fastgpt/service/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/utils')>()),
  isInternalAddress: async () => false
}));
vi.mock('@fastgpt/service/common/s3/sources/rawText', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: async () => ({ filename: 'report.pdf', text: '文档正文' })
  })
}));

describe('getChatMessages', () => {
  let originalSystemEnv: typeof global.systemEnv;
  const multimediaEnv: { MULTIPLE_DATA_TO_BASE64: boolean } = serviceEnv;
  const originalMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;

  beforeEach(() => {
    originalSystemEnv = global.systemEnv;
    global.systemEnv = { ...originalSystemEnv, fileUrlWhitelist: [] };
    multimediaEnv.MULTIPLE_DATA_TO_BASE64 = false;
    vi.spyOn(axios, 'head').mockResolvedValue({ headers: { 'content-type': 'audio/wav' } });
    vi.spyOn(axios, 'get');
  });

  afterEach(() => {
    global.systemEnv = originalSystemEnv;
    multimediaEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
    vi.restoreAllMocks();
  });

  it.each(
    (
      [
        ['root', 'external', true],
        ['child', 'external', true],
        ['root', 'private', true],
        ['child', 'private', true],
        ['root', 'external', false],
        ['child', 'external', false],
        ['root', 'private', false],
        ['child', 'private', false]
      ] as const
    ).flatMap(([kind, source, useMedia]) =>
      (['audio', 'video'] as const).map((media) => [kind, source, media, useMedia] as const)
    )
  )('%s Context 的 %s %s 完整进入模型消息，输入开关=%s', async (kind, source, media, useMedia) => {
    const url = 'https://files.example.com/download?token=original';
    const extension = media === 'audio' ? 'wav' : 'mp4';
    vi.mocked(axios.head).mockResolvedValue({
      headers: { 'content-type': `${media}/${extension}` }
    });
    const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      scope: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        uid: 'user-1',
        chatId: 'chat-1'
      },
      maxFileAmount: 5,
      getPreviewUrl: async () => url
    });
    await fileRegistrar.registerInputFile({
      file: {
        url,
        name: '会议录音',
        type: ChatFileTypeEnum.file,
        ...(source === 'private' ? { key: `chat/app/app-1/user-1/chat-1/record.${extension}` } : {})
      },
      source: 'variable'
    });
    const context = kind === 'child' ? await fileContext.derive([url]) : fileContext;
    const requestMessages = await runWithContext(
      { mcpClientMemory: {}, fileContext: context },
      async () => {
        const userFiles = await getInputFiles({ fileLinks: [url] });
        expect(userFiles[0].type).toBe(media);
        const messages = await getChatMessages({
          model: { config: { maxContext: 8192 } } as LLMModelDataType,
          histories: [],
          systemPrompt: '',
          userChatInput: '识别一下文件内容',
          userFiles,
          parseHistoryFiles: true,
          maxFileAmount: 5,
          runningUserInfo: {
            teamId: 'team-1',
            tmbId: 'member-1',
            username: '',
            teamName: '',
            memberName: '',
            contact: ''
          }
        });
        return loadRequestMessages({
          messages,
          useAudio: media === 'audio' && useMedia,
          useVideo: media === 'video' && useMedia
        });
      }
    );

    expect(requestMessages[0].content).toEqual(
      useMedia
        ? [
            media === 'audio'
              ? { type: 'input_audio', input_audio: { data: url } }
              : { type: 'video_url', video_url: { url } },
            { type: 'text', text: '识别一下文件内容' }
          ]
        : '识别一下文件内容'
    );
    expect(context.resolve(url)?.name).toBe('会议录音');
    if (source === 'external') expect(context.resolve(url)?.filename).toBe(`download.${extension}`);
    expect(axios.head).toHaveBeenCalledTimes(source === 'external' ? 1 : 0);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('没有 Workflow Context 时，音频可从 URL 恢复格式，图片附件保持原协议', async () => {
    const messages = await getChatMessages({
      model: { config: { maxContext: 8192 } } as LLMModelDataType,
      histories: [],
      systemPrompt: '',
      userChatInput: '分析附件',
      userFiles: [
        { type: ChatFileTypeEnum.audio, name: '录音', url: 'https://files.example.com/audio.wav' },
        { type: ChatFileTypeEnum.image, name: '图片', url: 'https://files.example.com/photo.png' }
      ],
      parseHistoryFiles: false,
      maxFileAmount: 5,
      runningUserInfo: {
        teamId: 'team-1',
        tmbId: 'member-1',
        username: '',
        teamName: '',
        memberName: '',
        contact: ''
      }
    });
    const requestMessages = await loadRequestMessages({
      messages,
      useAudio: true,
      useVision: true
    });
    expect(requestMessages[0].content).toEqual([
      {
        type: 'input_audio',
        input_audio: { data: 'https://files.example.com/audio.wav', format: 'wav' }
      },
      { type: 'image_url', image_url: { url: 'https://files.example.com/photo.png' } },
      { type: 'text', text: '分析附件' }
    ]);
  });

  it('保留系统提示和非 Human 历史，普通文档仍读取为文本', async () => {
    const messages = await getChatMessages({
      model: {
        config: { maxContext: 8192, defaultSystemChatPrompt: '默认提示' }
      } as LLMModelDataType,
      maxTokens: 100,
      histories: [
        { obj: ChatRoleEnum.Human, value: [{ text: { content: '历史问题' } }] },
        { obj: ChatRoleEnum.AI, value: [{ text: { content: '历史回答' } }] }
      ],
      systemPrompt: '节点提示',
      datasetCiteSystemPrompt: '引用提示',
      userChatInput: '解释文档',
      userFiles: [{ type: ChatFileTypeEnum.file, url: 'https://files.example.com/report.pdf' }],
      parseHistoryFiles: false,
      maxFileAmount: 5,
      customPdfParse: false,
      runningUserInfo: {
        teamId: 'team-1',
        tmbId: 'member-1',
        username: '',
        teamName: '',
        memberName: '',
        contact: ''
      }
    });
    expect(messages[0]).toMatchObject({ role: 'system' });
    expect(messages[0].content).toContain('默认提示');
    expect(messages[0].content).toContain('节点提示');
    expect(messages[0].content).toContain('引用提示');
    expect(messages[1]).toMatchObject({ role: 'user', content: '历史问题' });
    expect(messages[2]).toMatchObject({ role: 'assistant', content: '历史回答' });
    expect(messages[3].content).toContain('文档正文');
    expect(messages[3].content).toContain('解释文档');
  });
});
