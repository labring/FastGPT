import { describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import * as workflowContext from '@fastgpt/service/core/workflow/utils/context';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { filterDatasetsByTmbId } from '@fastgpt/service/core/dataset/utils';
import {
  type AgentInputFile,
  buildAgentInputFilesPrompt,
  buildAgentUserContextInput,
  buildAgentUserReminderInput,
  rewriteAgentUserMessagesWithFiles
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/userContext';

vi.mock('@fastgpt/global/common/time/timezone', () => ({
  getSystemTime: vi.fn(() => '2026-05-14 10:00:00 Thursday')
}));
vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    find: vi.fn(() => ({
      lean: vi.fn(async () => [])
    }))
  }
}));
vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  filterDatasetsByTmbId: vi.fn(async ({ datasetIds }) => datasetIds)
}));

const runWithContextAsync = <T>(
  value: Parameters<typeof runWithContext>[0],
  fn: (ctx: Parameters<Parameters<typeof runWithContext>[1]>[0]) => Promise<T>
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    runWithContext(value, () => {
      fn(value as Parameters<Parameters<typeof runWithContext>[1]>[0]).then(resolve, reject);
    });
  });

const createHumanMessage = ({
  dataId,
  text,
  files = []
}: {
  dataId?: string;
  text: string;
  files?: { name: string; url: string; type?: ChatFileTypeEnum }[];
}): ChatItemMiniType => ({
  dataId,
  obj: ChatRoleEnum.Human,
  value: runtimePrompt2ChatsValue({
    text,
    files: files.map((file) => ({
      name: file.name,
      url: file.url,
      type: file.type || ChatFileTypeEnum.file
    }))
  })
});

const createAiMessage = (dataId?: string): ChatItemMiniType => ({
  dataId,
  obj: ChatRoleEnum.AI,
  value: []
});

const createSystemMessage = (content = 'system noise'): ChatItemMiniType => ({
  obj: ChatRoleEnum.System,
  value: [
    {
      text: {
        content
      }
    }
  ]
});

const selectedDataset: SelectedDatasetType[] = [
  {
    datasetId: 'dataset_1',
    avatar: 'avatar',
    name: '产品知识库',
    vectorModel: {
      model: 'text-embedding-3-small'
    }
  }
];

describe('buildAgentInputFilesPrompt', () => {
  it('generates # Input Files XML block with stable ids', () => {
    const result = buildAgentInputFilesPrompt([
      {
        id: 'current-0',
        name: 'guide.pdf',
        type: ChatFileTypeEnum.file,
        url: '/guide.pdf'
      },
      {
        id: 'current-1',
        name: 'chart.png',
        type: ChatFileTypeEnum.image,
        url: '/chart.png'
      }
    ]);

    expect(result).toContain('# Input Files');
    expect(result).toContain('<id>current-0</id>');
    expect(result).toContain('<type>document</type>');
    expect(result).toContain('<id>current-1</id>');
    expect(result).toContain('<type>image</type>');
  });

  it('escapes XML fields in file metadata', () => {
    const result = buildAgentInputFilesPrompt([
      {
        id: `current-&-'"-0`,
        name: `a<b>&"c"'d.pdf`,
        type: ChatFileTypeEnum.file,
        url: '/guide.pdf'
      }
    ]);

    expect(result).toContain('<id>current-&amp;-&apos;&quot;-0</id>');
    expect(result).toContain('<name>a&lt;b&gt;&amp;&quot;c&quot;&apos;d.pdf</name>');
  });

  it('returns empty string when there are no files', () => {
    expect(buildAgentInputFilesPrompt()).toBe('');
  });
});

describe('buildAgentUserReminderInput', () => {
  it('builds current turn reminder with files datasets time and original query', () => {
    const result = buildAgentUserReminderInput({
      query: '帮我总结',
      filePrompt: buildAgentInputFilesPrompt([
        {
          id: 'current-0',
          name: 'guide.pdf',
          type: ChatFileTypeEnum.file,
          url: '/guide.pdf'
        }
      ]),
      selectedDataset,
      currentTime: '2026-05-14 10:00:00 Thursday'
    });

    expect(result).toContain('<system-reminder>');
    expect(result).toContain('# Input Files');
    expect(result).toContain('# Input datasets');
    expect(result).toContain('<id>dataset_1</id>');
    expect(result).toContain('# Current time');
    expect(result).toContain('帮我总结');
  });

  it('escapes XML fields in dataset metadata', () => {
    const result = buildAgentUserReminderInput({
      query: 'hello',
      selectedDataset: [
        {
          ...selectedDataset[0],
          datasetId: 'dataset&1',
          name: 'A<B>'
        }
      ]
    });

    expect(result).toContain('<id>dataset&amp;1</id>');
    expect(result).toContain('<name>A&lt;B&gt;</name>');
  });

  it('includes dataset description when backend context provides it', () => {
    const result = buildAgentUserReminderInput({
      query: 'hello',
      selectedDataset: [
        {
          ...selectedDataset[0],
          intro: '产品 <FAQ> & 售后说明'
        }
      ]
    });

    expect(result).toContain('<description>产品 &lt;FAQ&gt; &amp; 售后说明</description>');
  });

  it('builds reminder from each optional context independently', () => {
    expect(
      buildAgentUserReminderInput({
        query: '',
        currentTime: '2026-05-14 10:00:00 Thursday'
      })
    ).toContain(`# Current time
2026-05-14 10:00:00 Thursday`);
    expect(
      buildAgentUserReminderInput({
        query: '',
        currentTime: '2026-05-14 10:00:00 Thursday'
      })
    ).toBe(`<system-reminder>
# Current time
2026-05-14 10:00:00 Thursday
</system-reminder>`);

    const datasetOnly = buildAgentUserReminderInput({
      query: 'hello',
      selectedDataset
    });
    expect(datasetOnly).toContain('# Input datasets');
    expect(datasetOnly).not.toContain('# Input Files');
    expect(datasetOnly).not.toContain('# Current time');
  });

  it('returns original query when there is no context', () => {
    expect(buildAgentUserReminderInput({ query: 'hello' })).toBe('hello');
    expect(buildAgentUserReminderInput({ query: '' })).toBe('');
  });
});

describe('rewriteAgentUserMessagesWithFiles', () => {
  it('only rewrites historical human messages with file context', () => {
    const history = createHumanMessage({
      dataId: 'history_1',
      text: '上一轮文件是什么',
      files: [{ name: 'old.pdf', url: '/old.pdf' }]
    });
    const filesByMessage = new Map<ChatItemMiniType, AgentInputFile[]>([
      [
        history,
        [
          {
            id: 'history_1-0',
            name: 'old.pdf',
            type: ChatFileTypeEnum.file,
            url: '/old.pdf'
          }
        ]
      ]
    ]);

    const [rewritten] = rewriteAgentUserMessagesWithFiles({
      messages: [history],
      filesByMessage
    });
    const { text, files } = chatValue2RuntimePrompt(rewritten.value);

    expect(files).toEqual([]);
    expect(text).toContain('# Input Files');
    expect(text).toContain('<id>history_1-0</id>');
    expect(text).not.toContain('# Input datasets');
    expect(text).not.toContain('# Current time');
    expect(text).toContain('上一轮文件是什么');
  });

  it('keeps non-human messages and human messages without file context untouched', () => {
    const system = createSystemMessage();
    const ai = createAiMessage('ai_1');
    const humanWithoutFiles = createHumanMessage({
      dataId: 'human_1',
      text: '没有文件'
    });

    const result = rewriteAgentUserMessagesWithFiles({
      messages: [system, ai, humanWithoutFiles],
      filesByMessage: new Map()
    });

    expect(result[0]).toBe(system);
    expect(result[1]).toBe(ai);
    expect(result[2]).toBe(humanWithoutFiles);
  });
});

describe('buildAgentUserContextInput', () => {
  it('rewrites histories and current input while keeping file ids consistent with maps', async () => {
    vi.mocked(MongoDataset.find).mockReturnValueOnce({
      lean: vi.fn(async () => [
        {
          _id: 'dataset_1',
          intro: '后端读取到的知识库介绍'
        }
      ])
    } as any);

    await runWithContextAsync(
      {
        queryUrlTypeMap: {
          '/old.pdf': ChatFileTypeEnum.file,
          '/current.pdf': ChatFileTypeEnum.file,
          '/current.png': ChatFileTypeEnum.image
        },
        mcpClientMemory: {}
      },
      async () => {
        const history = createHumanMessage({
          dataId: 'history_1',
          text: '历史问题',
          files: [{ name: 'old.pdf', url: '/old.pdf' }]
        });
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [history, createSystemMessage(), createAiMessage('history_ai_1')],
          currentFiles: ['/current.pdf', '/current.png'],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          currentQuery: runtimePrompt2ChatsValue({
            text: '前端原始问题',
            files: [
              {
                name: 'current.pdf',
                url: '/current.pdf',
                type: ChatFileTypeEnum.file
              }
            ]
          }),
          selectedDataset,
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.filesMap).toEqual({
          'history_ai_1-0': '/old.pdf',
          'current_chat_item-0': '/current.pdf'
        });
        expect(result.allFilesMap).toEqual({
          'history_ai_1-0': {
            name: 'old.pdf',
            type: ChatFileTypeEnum.file,
            url: '/old.pdf'
          },
          'current_chat_item-0': {
            name: 'current.pdf',
            type: ChatFileTypeEnum.file,
            url: '/current.pdf'
          },
          'current_chat_item-1': {
            name: 'current.png',
            type: ChatFileTypeEnum.image,
            url: '/current.png'
          }
        });

        const { text: historyText } = chatValue2RuntimePrompt(result.rewrittenHistories[0].value);
        const { text: currentText, files: currentFiles } = chatValue2RuntimePrompt(
          result.currentUserMessage.value
        );

        expect(historyText).toContain('<id>history_ai_1-0</id>');
        expect(historyText).not.toContain('# Current time');
        expect(currentFiles).toEqual([]);
        expect(currentText).toContain('<id>current_chat_item-0</id>');
        expect(currentText).toContain('<id>current_chat_item-1</id>');
        expect(currentText).toContain('# Input datasets');
        expect(currentText).toContain('<description>后端读取到的知识库介绍</description>');
        expect(currentText).toContain('2026-05-14 10:00:00 Thursday');
        expect(currentText).toContain('当前问题');
      }
    );
  });

  it('loads dataset name and description from backend when selected state only keeps id', async () => {
    vi.mocked(MongoDataset.find).mockReturnValueOnce({
      lean: vi.fn(async () => [
        {
          _id: 'dataset_1',
          name: '后端知识库名',
          intro: '后端知识库介绍'
        }
      ])
    } as any);

    await runWithContextAsync(
      {
        queryUrlTypeMap: {},
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 0,
          histories: [],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          selectedDataset: [
            {
              datasetId: 'dataset_1'
            }
          ],
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(filterDatasetsByTmbId).toHaveBeenCalledWith({
          datasetIds: ['dataset_1'],
          tmbId: 'tmb_1'
        });
        expect(MongoDataset.find).toHaveBeenCalledWith(
          {
            _id: {
              $in: ['dataset_1']
            }
          },
          'name intro'
        );

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).toContain('<id>dataset_1</id>');
        expect(text).toContain('<name>后端知识库名</name>');
        expect(text).toContain('<description>后端知识库介绍</description>');
      }
    );
  });

  it('filters unauthorized datasets before loading backend metadata', async () => {
    vi.mocked(filterDatasetsByTmbId).mockResolvedValueOnce(['dataset_1']);
    vi.mocked(MongoDataset.find).mockReturnValueOnce({
      lean: vi.fn(async () => [
        {
          _id: 'dataset_1',
          name: '可读知识库',
          intro: '可读介绍'
        }
      ])
    } as any);

    await runWithContextAsync(
      {
        queryUrlTypeMap: {},
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 0,
          histories: [],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          selectedDataset: [
            {
              datasetId: 'dataset_1'
            },
            {
              datasetId: 'dataset_2'
            }
          ],
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(MongoDataset.find).toHaveBeenCalledWith(
          {
            _id: {
              $in: ['dataset_1']
            }
          },
          'name intro'
        );

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).toContain('<id>dataset_1</id>');
        expect(text).toContain('<name>可读知识库</name>');
        expect(text).not.toContain('dataset_2');
      }
    );
  });

  it('falls back to human dataId for orphan historical human messages', async () => {
    await runWithContextAsync(
      {
        queryUrlTypeMap: {
          '/old.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [
            createHumanMessage({
              dataId: 'history_human_1',
              text: '历史问题',
              files: [{ name: 'old.pdf', url: '/old.pdf' }]
            })
          ],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.filesMap).toEqual({
          'history_human_1-0': '/old.pdf'
        });
      }
    );
  });

  it('deduplicates current files after request origin normalization', async () => {
    await runWithContextAsync(
      {
        queryUrlTypeMap: {
          '/current.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [],
          currentFiles: ['https://fastgpt.example.com/current.pdf'],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          currentQuery: runtimePrompt2ChatsValue({
            text: '前端原始问题',
            files: [
              {
                name: 'current.pdf',
                url: '/current.pdf',
                type: ChatFileTypeEnum.file
              }
            ]
          }),
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          requestOrigin: 'https://fastgpt.example.com',
          maxFiles: 20
        });

        expect(result.filesMap).toEqual({
          'current_chat_item-0': '/current.pdf'
        });
        expect(Object.keys(result.allFilesMap)).toEqual(['current_chat_item-0']);

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text.match(/<file>/g)).toHaveLength(1);
        expect(text).toContain('<name>current.pdf</name>');
      }
    );
  });

  it('uses message index when historical human has no paired AI dataId or human dataId', async () => {
    await runWithContextAsync(
      {
        queryUrlTypeMap: {
          '/old.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [
            createSystemMessage(),
            createHumanMessage({
              text: '历史问题',
              files: [{ name: 'old.pdf', url: '/old.pdf' }]
            }),
            createHumanMessage({
              dataId: 'next_human',
              text: '下一轮问题'
            }),
            createAiMessage('next_ai_should_not_pair')
          ],
          currentUserInput: '当前问题',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.filesMap).toEqual({
          '1-0': '/old.pdf'
        });
        const { text } = chatValue2RuntimePrompt(result.rewrittenHistories[1].value);
        expect(text).toContain('<id>1-0</id>');
        expect(text).not.toContain('next_ai_should_not_pair');
      }
    );
  });

  it('accepts explicit history arrays and respects maxFiles per message', async () => {
    await runWithContextAsync(
      {
        queryUrlTypeMap: {
          '/a.pdf': ChatFileTypeEnum.file,
          '/b.pdf': ChatFileTypeEnum.file,
          '/c.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      async () => {
        const explicitHistory = [
          createHumanMessage({
            dataId: 'history_human',
            text: '历史问题',
            files: [
              { name: 'a.pdf', url: '/a.pdf' },
              { name: 'b.pdf', url: '/b.pdf' }
            ]
          }),
          createAiMessage('history_ai')
        ];

        const result = await buildAgentUserContextInput({
          history: explicitHistory,
          histories: [],
          currentFiles: ['/c.pdf', '/a.pdf'],
          currentUserInput: '当前问题',
          currentDataId: 'current_ai',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 1
        });

        expect(result.chatHistories).toBe(explicitHistory);
        expect(result.filesMap).toEqual({
          'history_ai-0': '/a.pdf',
          'current_ai-0': '/c.pdf'
        });
        expect(Object.keys(result.allFilesMap)).toEqual(['history_ai-0', 'current_ai-0']);
      }
    );
  });

  it('filters invalid urls, keeps data images for sandbox, and excludes images from read_files map', async () => {
    const dataImage = 'data:image/png;base64,AAAA';
    await runWithContextAsync(
      {
        queryUrlTypeMap: {
          '/doc.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [],
          currentFiles: ['not-a-url', 'data:text/plain;base64,AAAA', dataImage, '/doc.pdf'],
          currentUserInput: '分析这些文件',
          currentDataId: 'current_ai',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.filesMap).toEqual({
          'current_ai-2': '/doc.pdf'
        });
        expect(result.allFilesMap).toEqual({
          'current_ai-1': {
            name: 'image.png',
            type: ChatFileTypeEnum.image,
            url: dataImage
          },
          'current_ai-2': {
            name: 'doc.pdf',
            type: ChatFileTypeEnum.file,
            url: '/doc.pdf'
          }
        });

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).not.toContain('<id>current_ai-0</id>');
        expect(text).toContain('<id>current_ai-1</id>');
        expect(text).toContain('<type>image</type>');
        expect(text).toContain('<id>current_ai-2</id>');
        expect(text).not.toContain('not-a-url');
        expect(text).not.toContain('data:text/plain');
      }
    );
  });

  it('drops files when url normalization throws', async () => {
    await runWithContextAsync(
      {
        queryUrlTypeMap: {
          '/doc.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [],
          currentFiles: ['/doc.pdf'],
          currentUserInput: '分析文件',
          currentDataId: 'current_ai',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          requestOrigin: Symbol('invalid-origin'),
          maxFiles: 20
        } as any);

        expect(result.filesMap).toEqual({});
        expect(result.allFilesMap).toEqual({});

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).not.toContain('# Input Files');
        expect(text).toContain('分析文件');
      }
    );
  });

  it('uses parsed filename when chat file metadata has no name', async () => {
    await runWithContextAsync(
      {
        queryUrlTypeMap: {
          '/uploads/report%20v1.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [],
          currentUserInput: '总结报告',
          currentDataId: 'current_ai',
          currentQuery: runtimePrompt2ChatsValue({
            text: '原始问题',
            files: [
              {
                name: '',
                url: '/uploads/report%20v1.pdf',
                type: ChatFileTypeEnum.file
              }
            ]
          }),
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.queryInput).toBe('原始问题');
        expect(result.filesMap).toEqual({
          'current_ai-0': '/uploads/report%20v1.pdf'
        });
        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).toContain('<name>report v1.pdf</name>');
      }
    );
  });

  it('falls back to url as file name when neither chat metadata nor parsed url has a filename', async () => {
    await runWithContextAsync(
      {
        queryUrlTypeMap: {
          '/api/file/raw': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [],
          currentUserInput: '读取无扩展名文件',
          currentDataId: 'current_ai',
          currentQuery: runtimePrompt2ChatsValue({
            text: '原始问题',
            files: [
              {
                name: '',
                url: '/api/file/raw',
                type: ChatFileTypeEnum.file
              }
            ]
          }),
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.allFilesMap['current_ai-0']).toEqual({
          name: '/api/file/raw',
          type: ChatFileTypeEnum.file,
          url: '/api/file/raw'
        });
        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).toContain('<name>/api/file/raw</name>');
      }
    );
  });

  it('uses url as the final defensive file name fallback when parser returns an empty name', async () => {
    const parseUrlToFileTypeSpy = vi
      .spyOn(workflowContext, 'parseUrlToFileType')
      .mockReturnValueOnce({
        name: '',
        type: ChatFileTypeEnum.file,
        url: '/nameless'
      });

    await runWithContextAsync(
      {
        queryUrlTypeMap: {},
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [],
          currentFiles: ['/nameless'],
          currentUserInput: '读取文件',
          currentDataId: 'current_ai',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.allFilesMap['current_ai-0']).toEqual({
          name: '/nameless',
          type: ChatFileTypeEnum.file,
          url: '/nameless'
        });
        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).toContain('<name>/nameless</name>');
      }
    );

    parseUrlToFileTypeSpy.mockRestore();
  });

  it('ignores non-string file urls defensively', async () => {
    await runWithContextAsync(
      {
        queryUrlTypeMap: {},
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 6,
          histories: [
            createHumanMessage({
              dataId: 'history_human',
              text: '历史问题',
              files: [{ name: 'broken.pdf', url: 123 as any }]
            })
          ],
          currentUserInput: '当前问题',
          currentDataId: 'current_ai',
          currentQuery: runtimePrompt2ChatsValue({
            text: '原始问题',
            files: [
              {
                name: 'broken.pdf',
                url: 456 as any,
                type: ChatFileTypeEnum.file
              }
            ]
          }),
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.filesMap).toEqual({});
        expect(result.allFilesMap).toEqual({});
        expect(result.rewrittenHistories[0]).toBe(result.chatHistories[0]);

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).not.toContain('# Input Files');
        expect(text).toContain('当前问题');
      }
    );
  });

  it('handles requests without currentQuery or files', async () => {
    await runWithContextAsync(
      {
        queryUrlTypeMap: {},
        mcpClientMemory: {}
      },
      async () => {
        const result = await buildAgentUserContextInput({
          history: 0,
          histories: [
            createHumanMessage({
              dataId: 'ignored_history',
              text: '不会进入历史',
              files: [{ name: 'ignored.pdf', url: '/ignored.pdf' }]
            })
          ],
          currentUserInput: '只问一个问题',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.chatHistories).toEqual([]);
        expect(result.rewrittenHistories).toEqual([]);
        expect(result.queryInput).toBe('');
        expect(result.filesMap).toEqual({});
        expect(result.allFilesMap).toEqual({});

        const { text, files } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(files).toEqual([]);
        expect(text).toContain('# Current time');
        expect(text).toContain('只问一个问题');
        expect(text).not.toContain('# Input Files');
      }
    );
  });
});
