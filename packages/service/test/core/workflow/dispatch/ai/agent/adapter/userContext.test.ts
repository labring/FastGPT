import { describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import * as workflowContext from '@fastgpt/service/core/workflow/utils/context';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { filterDatasetsByTmbId } from '@fastgpt/service/core/dataset/utils';
import { useUserContext } from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/userContext';
import {
  buildAgentLoopCoreInputFilesPrompt,
  buildAgentLoopCoreSkillsPrompt,
  buildAgentLoopCoreUserReminderInput
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/context/reminder';
import type { DeployedSkillInfo } from '@fastgpt/service/core/ai/skill/runtime/types';

vi.mock('@fastgpt/global/common/time/timezone', () => ({
  getSystemTime: vi.fn(() => '2026-05-14 10:00:00 Thursday')
}));
vi.mock('@fastgpt/service/core/dataset/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/schema')>()),
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

const getUserContextMessagesForTest = async ({
  skillInfos,
  currentWorkingDirectory,
  ...params
}: Parameters<typeof useUserContext>[0] & {
  skillInfos?: DeployedSkillInfo[];
  currentWorkingDirectory?: string;
}) => {
  const context = await useUserContext(params);

  return {
    chatHistories: context.chatHistories,
    queryInput: context.queryInput,
    ...context.getCurrentMessages({
      skillInfos,
      currentWorkingDirectory
    }),
    currentFiles: context.currentFiles
  };
};

describe('buildAgentLoopCoreInputFilesPrompt', () => {
  it('generates file XML block for document files only', () => {
    const result = buildAgentLoopCoreInputFilesPrompt([
      {
        name: 'guide.pdf',
        type: ChatFileTypeEnum.file,
        url: '/guide.pdf'
      },
      {
        name: 'chart.png',
        type: ChatFileTypeEnum.image,
        url: '/chart.png'
      },
      {
        name: 'voice.mp3',
        type: ChatFileTypeEnum.audio,
        url: 'https://files.example.com/voice.mp3'
      },
      {
        name: 'demo.mp4',
        type: ChatFileTypeEnum.video,
        url: 'https://files.example.com/demo.mp4'
      }
    ]);

    expect(result).toContain('## 对话文件');
    expect(result).toContain('<url>/guide.pdf</url>');
    expect(result).toContain('<name>guide.pdf</name>');
    expect(result).toContain('<url>/chart.png</url>');
    expect(result).toContain('<url>https://files.example.com/voice.mp3</url>');
    expect(result).toContain('<url>https://files.example.com/demo.mp4</url>');
    expect(result).not.toContain('<id>');
    expect(result).toContain('<type>image</type>');
    expect(result).toContain('<type>audio</type>');
    expect(result).toContain('<type>video</type>');
  });

  it('escapes XML fields in file metadata', () => {
    const result = buildAgentLoopCoreInputFilesPrompt([
      {
        name: `a<b>&"c"'d.pdf`,
        type: ChatFileTypeEnum.file,
        url: '/guide.pdf'
      }
    ]);

    expect(result).toContain('<url>/guide.pdf</url>');
    expect(result).toContain('<name>a&lt;b&gt;&amp;&quot;c&quot;&apos;d.pdf</name>');
  });

  it('returns empty string when there are no files', () => {
    expect(buildAgentLoopCoreInputFilesPrompt()).toBe('');
  });
});

describe('buildAgentLoopCoreUserReminderInput', () => {
  it('builds current turn reminder with files datasets time and original query', () => {
    const result = buildAgentLoopCoreUserReminderInput({
      query: '帮我总结',
      skillInfos: [
        {
          id: 'skill_1',
          name: 'Skill',
          description: 'Skill description',
          directory: '/workspace/Skill',
          skillMdPath: '/workspace/Skill/SKILL.md'
        }
      ],
      filesInfo: [
        {
          name: 'guide.pdf',
          type: ChatFileTypeEnum.file,
          url: '/guide.pdf'
        }
      ],
      selectedDataset,
      currentWorkingDirectory: '/workspace',
      currentTime: '2026-05-14 10:00:00 Thursday'
    });

    expect(result).toContain('<system-reminder>');
    expect(result).toContain('<available_skills>');
    expect(result).toContain('<location>/workspace/Skill/SKILL.md</location>');
    expect(result.indexOf('<available_skills>')).toBeLessThan(result.indexOf('## 对话文件'));
    expect(result.indexOf('## 对话文件')).toBeLessThan(result.indexOf('## 知识库'));
    expect(result.indexOf('## 知识库')).toBeLessThan(result.indexOf('## 背景信息'));
    expect(result).toContain('## 对话文件');
    expect(result).toContain('## 知识库');
    expect(result).toContain('<id>dataset_1</id>');
    expect(result).toContain('## 背景信息');
    expect(result).toContain('当前时间: 2026-05-14 10:00:00 Thursday');
    expect(result).toContain('当前 sandbox 工作目录: /workspace');
    expect(result).toContain('帮我总结');
  });

  it('escapes XML fields in dataset metadata', () => {
    const result = buildAgentLoopCoreUserReminderInput({
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
    const result = buildAgentLoopCoreUserReminderInput({
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
      buildAgentLoopCoreUserReminderInput({
        query: '',
        currentWorkingDirectory: '/workspace'
      })
    ).toContain(`当前 sandbox 工作目录: /workspace`);
    expect(
      buildAgentLoopCoreUserReminderInput({
        query: '',
        currentTime: '2026-05-14 10:00:00 Thursday'
      })
    ).toContain(`当前时间: 2026-05-14 10:00:00 Thursday`);
    expect(
      buildAgentLoopCoreUserReminderInput({
        query: '',
        currentTime: '2026-05-14 10:00:00 Thursday'
      })
    ).toContain(`## 背景信息`);

    const datasetOnly = buildAgentLoopCoreUserReminderInput({
      query: 'hello',
      selectedDataset
    });
    expect(datasetOnly).toContain('## 知识库');
    expect(datasetOnly).not.toContain('## 对话文件');
    expect(datasetOnly).not.toContain('当前时间');
  });

  it('returns original query when there is no context', () => {
    expect(buildAgentLoopCoreUserReminderInput({ query: 'hello' })).toBe('hello');
    expect(buildAgentLoopCoreUserReminderInput({ query: '' })).toBe('');
    expect(
      buildAgentLoopCoreUserReminderInput({ query: 'hello', currentWorkingDirectory: '' })
    ).toBe('hello');
  });

  it('keeps skill prompt inside user system-reminder without requiring files or datasets', () => {
    const result = buildAgentLoopCoreUserReminderInput({
      query: '执行这个技能',
      skillInfos: [
        {
          id: 'skill_report',
          name: 'Report',
          description: 'Write reports',
          directory: '/workspace/Report',
          skillMdPath: '/workspace/Report/SKILL.md',
          appId: 'platform_skill_1',
          appName: 'Platform report skill',
          appDescription: 'Platform skill description'
        }
      ]
    });

    expect(result).toContain('以下技能为特定任务提供专门的操作说明：');
    expect(result).toContain('先使用 sandbox_read_file 读取完整的技能文件');
    expect(result).toContain('<available_skills>');
    expect(result).toContain('</available_skills>');
    expect(result).toContain('<name>Report</name>');
    expect(result).toContain('<description>Write reports</description>');
    expect(result).toContain('<location>/workspace/Report/SKILL.md</location>');
    expect(result).not.toContain('<app_id>');
    expect(result).not.toContain('<app_name>');
    expect(result).not.toContain('<app_description>');
    expect(result).not.toContain('Platform report skill');
    expect(result).toContain('执行这个技能');
  });

  it('escapes XML fields in skill metadata', () => {
    const result = buildAgentLoopCoreSkillsPrompt([
      {
        id: 'skill_report',
        name: 'Report <R&D>',
        description: 'Write & review',
        directory: '/workspace/Report & Review',
        skillMdPath: '/workspace/Report & Review/SKILL.md'
      }
    ]);

    expect(result).toContain('<name>Report &lt;R&amp;D&gt;</name>');
    expect(result).toContain('<description>Write &amp; review</description>');
    expect(result).toContain('<location>/workspace/Report &amp; Review/SKILL.md</location>');
  });
});

describe('useUserContext', () => {
  it('rewrites histories and current input with direct model URLs', async () => {
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
        mcpClientMemory: {}
      },
      async () => {
        const history = createHumanMessage({
          dataId: 'history_1',
          text: '历史问题',
          files: [{ name: 'old.pdf', url: 'https://files.example.com/old.pdf' }]
        });
        const result = await getUserContextMessagesForTest({
          history: 6,
          parseHistoryFiles: true,
          histories: [history, createSystemMessage(), createAiMessage('history_ai_1')],
          currentFiles: [
            'https://files.example.com/current.pdf',
            'https://files.example.com/current.png'
          ],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          currentQuery: runtimePrompt2ChatsValue({
            text: '前端原始问题',
            files: [
              {
                name: 'current.pdf',
                url: 'https://files.example.com/current.pdf',
                type: ChatFileTypeEnum.file
              }
            ]
          }),
          selectedDataset,
          currentWorkingDirectory: '/workspace',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        const { text: historyText } = chatValue2RuntimePrompt(result.rewrittenHistories[0].value);
        const { text: currentText, files: currentFiles } = chatValue2RuntimePrompt(
          result.currentUserMessage.value
        );

        expect(historyText).toContain('<url>https://files.example.com/old.pdf</url>');
        expect(historyText).not.toContain('当前 sandbox 工作目录');
        expect(historyText).not.toContain('当前时间');
        expect(currentFiles).toEqual([
          {
            name: 'current.png',
            type: ChatFileTypeEnum.image,
            url: 'https://files.example.com/current.png'
          }
        ]);
        expect(currentText).toContain('## 背景信息');
        expect(currentText).toContain('当前 sandbox 工作目录: /workspace');
        expect(currentText).toContain('<url>https://files.example.com/current.pdf</url>');
        expect(currentText).toContain('<url>https://files.example.com/current.png</url>');
        expect(currentText).not.toContain('<id>current_chat_item-');
        expect(currentText).toContain('## 知识库');
        expect(currentText).toContain('<description>后端读取到的知识库介绍</description>');
        expect(currentText).toContain('2026-05-14 10:00:00 Thursday');
        expect(currentText).toContain('当前问题');
        expect(result.currentFiles).toEqual([
          {
            name: 'current.pdf',
            type: ChatFileTypeEnum.file,
            url: 'https://files.example.com/current.pdf'
          },
          {
            name: 'current.png',
            type: ChatFileTypeEnum.image,
            url: 'https://files.example.com/current.png'
          }
        ]);
      }
    );
  });

  it('injects skill reminder only into the current user message', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          parseHistoryFiles: true,
          histories: [
            createHumanMessage({
              dataId: 'history_1',
              text: '历史问题',
              files: [{ name: 'old.pdf', url: 'https://files.example.com/old.pdf' }]
            }),
            createAiMessage('history_ai_1')
          ],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          skillInfos: [
            {
              id: 'skill_report',
              name: 'Report',
              description: 'Write reports',
              directory: '/workspace/Report',
              skillMdPath: '/workspace/Report/SKILL.md'
            }
          ],
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        const { text: historyText } = chatValue2RuntimePrompt(result.rewrittenHistories[0].value);
        const { text: currentText } = chatValue2RuntimePrompt(result.currentUserMessage.value);

        expect(historyText).toContain('## 对话文件');
        expect(historyText).not.toContain('<available_skills>');
        expect(currentText).toContain('<available_skills>');
        expect(currentText).toContain('<location>/workspace/Report/SKILL.md</location>');
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
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 0,
          histories: [],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          selectedDataset: [
            {
              datasetId: 'dataset_1'
            }
          ],
          authTmbId: true,
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
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
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
          authTmbId: true,
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

  it('rewrites historical files to direct model URLs', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          parseHistoryFiles: true,
          histories: [
            createHumanMessage({
              dataId: 'history_human_1',
              text: '历史问题',
              files: [{ name: 'old.pdf', url: 'https://files.example.com/old.pdf' }]
            })
          ],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        const { text } = chatValue2RuntimePrompt(result.rewrittenHistories[0].value);
        expect(text).toContain('<url>https://files.example.com/old.pdf</url>');
        expect(text).not.toContain('<id>');
      }
    );
  });

  it('deduplicates identical absolute file URLs', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          histories: [],
          currentFiles: ['https://files.example.com/current.pdf'],
          currentUserInput: '当前问题',
          currentDataId: 'current_chat_item',
          currentQuery: runtimePrompt2ChatsValue({
            text: '前端原始问题',
            files: [
              {
                name: 'current.pdf',
                url: 'https://files.example.com/current.pdf',
                type: ChatFileTypeEnum.file
              }
            ]
          }),
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.currentFiles).toEqual([
          {
            name: 'current.pdf',
            type: ChatFileTypeEnum.file,
            url: 'https://files.example.com/current.pdf'
          }
        ]);

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text.match(/<file>/g)).toHaveLength(1);
        expect(text).toContain('<name>current.pdf</name>');
      }
    );
  });

  it('rewrites historical files without requiring a message dataId', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          parseHistoryFiles: true,
          histories: [
            createSystemMessage(),
            createHumanMessage({
              text: '历史问题',
              files: [{ name: 'old.pdf', url: 'https://files.example.com/old.pdf' }]
            }),
            createHumanMessage({
              dataId: 'next_human',
              text: '下一轮问题'
            })
          ],
          currentUserInput: '当前问题',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        const { text } = chatValue2RuntimePrompt(result.rewrittenHistories[1].value);
        expect(text).toContain('<url>https://files.example.com/old.pdf</url>');
        expect(text).not.toContain('<id>');
      }
    );
  });

  it('accepts explicit history arrays and respects maxFiles per message', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const explicitHistory = [
          createHumanMessage({
            dataId: 'history_human',
            text: '历史问题',
            files: [
              { name: 'a.pdf', url: 'https://files.example.com/a.pdf' },
              { name: 'b.pdf', url: 'https://files.example.com/b.pdf' }
            ]
          }),
          createAiMessage('history_ai')
        ];

        const result = await getUserContextMessagesForTest({
          history: explicitHistory,
          parseHistoryFiles: true,
          histories: [],
          currentFiles: ['https://files.example.com/c.pdf', 'https://files.example.com/a.pdf'],
          currentUserInput: '当前问题',
          currentDataId: 'current_ai',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 1
        });

        expect(result.chatHistories).toBe(explicitHistory);
        const { text: historyText } = chatValue2RuntimePrompt(result.rewrittenHistories[0].value);
        const { text: currentText } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(historyText).toContain('<url>https://files.example.com/a.pdf</url>');
        expect(historyText).not.toContain('https://files.example.com/b.pdf');
        expect(currentText).toContain('<url>https://files.example.com/c.pdf</url>');
        expect(currentText).not.toContain('https://files.example.com/a.pdf');
      }
    );
  });

  it('removes historical files when the node file input is not bound', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          parseHistoryFiles: false,
          histories: [
            createHumanMessage({
              dataId: 'history_human',
              text: '历史问题',
              files: [
                { name: 'old.pdf', url: 'https://files.example.com/old.pdf' },
                {
                  name: 'old.png',
                  url: 'https://files.example.com/old.png',
                  type: ChatFileTypeEnum.image
                }
              ]
            })
          ],
          currentFiles: ['https://files.example.com/current.pdf'],
          currentUserInput: '当前问题',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        const historyPrompt = chatValue2RuntimePrompt(result.rewrittenHistories[0].value);
        const currentPrompt = chatValue2RuntimePrompt(result.currentUserMessage.value);

        expect(historyPrompt.text).toBe('历史问题');
        expect(historyPrompt.files).toEqual([]);
        expect(currentPrompt.text).toContain('https://files.example.com/current.pdf');
      }
    );
  });

  it('keeps valid media and document URLs in sandbox and user context', async () => {
    const dataImage = 'data:image/png;base64,AAAA';
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          histories: [],
          currentFiles: [
            'not-a-url',
            'data:text/plain;base64,AAAA',
            dataImage,
            'https://files.example.com/doc.pdf',
            'https://files.example.com/voice.mp3',
            'https://files.example.com/demo.mp4'
          ],
          currentUserInput: '分析这些文件',
          currentDataId: 'current_ai',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.currentFiles).toEqual([
          {
            name: 'doc.pdf',
            type: ChatFileTypeEnum.file,
            url: 'https://files.example.com/doc.pdf'
          },
          {
            name: 'voice.mp3',
            type: ChatFileTypeEnum.audio,
            url: 'https://files.example.com/voice.mp3'
          },
          {
            name: 'demo.mp4',
            type: ChatFileTypeEnum.video,
            url: 'https://files.example.com/demo.mp4'
          }
        ]);

        const { text, files } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(files).toEqual([
          {
            name: 'voice.mp3',
            type: ChatFileTypeEnum.audio,
            url: 'https://files.example.com/voice.mp3'
          },
          {
            name: 'demo.mp4',
            type: ChatFileTypeEnum.video,
            url: 'https://files.example.com/demo.mp4'
          }
        ]);
        expect(text).toContain('<url>https://files.example.com/doc.pdf</url>');
        expect(text).toContain('<url>https://files.example.com/voice.mp3</url>');
        expect(text).toContain('<url>https://files.example.com/demo.mp4</url>');
        expect(text).not.toContain('<id>');
        expect(text).toContain('<type>audio</type>');
        expect(text).toContain('<type>video</type>');
        expect(text).not.toContain(dataImage);
        expect(text).not.toContain('not-a-url');
        expect(text).not.toContain('data:text/plain');
      }
    );
  });

  it('does not use request origin when parsing absolute file URLs', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          histories: [],
          currentFiles: ['https://files.example.com/doc.pdf'],
          currentUserInput: '分析文件',
          currentDataId: 'current_ai',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          requestOrigin: Symbol('invalid-origin'),
          maxFiles: 20
        } as any);

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).toContain('## 对话文件');
        expect(text).toContain('分析文件');
      }
    );
  });

  it('uses parsed filename when chat file metadata has no name', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          histories: [],
          currentUserInput: '总结报告',
          currentDataId: 'current_ai',
          currentQuery: runtimePrompt2ChatsValue({
            text: '原始问题',
            files: [
              {
                name: '',
                url: 'https://files.example.com/uploads/report%20v1.pdf',
                type: ChatFileTypeEnum.file
              }
            ]
          }),
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.queryInput).toBe('原始问题');
        expect(result.currentFiles).toEqual([
          {
            name: 'report v1.pdf',
            type: ChatFileTypeEnum.file,
            url: 'https://files.example.com/uploads/report%20v1.pdf'
          }
        ]);
        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).toContain('<name>report v1.pdf</name>');
      }
    );
  });

  it('falls back to url as file name when neither chat metadata nor parsed url has a filename', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          histories: [],
          currentUserInput: '读取无扩展名文件',
          currentDataId: 'current_ai',
          currentQuery: runtimePrompt2ChatsValue({
            text: '原始问题',
            files: [
              {
                name: '',
                url: 'https://files.example.com/api/file/raw',
                type: ChatFileTypeEnum.file
              }
            ]
          }),
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).toContain('<name>raw</name>');
      }
    );
  });

  it('uses url as the final defensive file name fallback when parser returns an empty name', async () => {
    const parseUrlToFileTypeSpy = vi
      .spyOn(workflowContext, 'parseUrlToFileType')
      .mockReturnValueOnce({
        name: '',
        type: ChatFileTypeEnum.file,
        url: 'https://files.example.com/nameless'
      });

    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          histories: [],
          currentFiles: ['https://files.example.com/nameless'],
          currentUserInput: '读取文件',
          currentDataId: 'current_ai',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).toContain('<name>nameless</name>');
      }
    );

    parseUrlToFileTypeSpy.mockRestore();
  });

  it('ignores non-string file urls defensively', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
          history: 6,
          parseHistoryFiles: true,
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

        expect(result.currentFiles).toEqual([]);
        expect(result.rewrittenHistories[0]).toBe(result.chatHistories[0]);

        const { text } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(text).not.toContain('## 对话文件');
        expect(text).toContain('当前问题');
      }
    );
  });

  it('handles requests without currentQuery or files', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const result = await getUserContextMessagesForTest({
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
        expect(result.currentFiles).toEqual([]);

        const { text, files } = chatValue2RuntimePrompt(result.currentUserMessage.value);
        expect(files).toEqual([]);
        expect(text).toContain('当前时间');
        expect(text).toContain('只问一个问题');
        expect(text).not.toContain('## 对话文件');
      }
    );
  });

  it('keeps the last pending interactive round when history is 0', async () => {
    await runWithContextAsync(
      {
        mcpClientMemory: {}
      },
      async () => {
        const histories: ChatItemMiniType[] = [
          createHumanMessage({
            dataId: 'question_1',
            text: 'Need a choice'
          }),
          {
            obj: ChatRoleEnum.AI,
            memories: {
              'agentLoopMemory-agent_1': {
                providerState: {
                  pendingMainContext: {
                    messages: []
                  }
                }
              }
            },
            value: [
              {
                interactive: {
                  type: 'agentPlanAskQuery',
                  askId: 'ask_1',
                  params: {
                    content: 'Choose one',
                    options: ['A', 'B', 'C']
                  }
                }
              }
            ]
          }
        ];

        const result = await getUserContextMessagesForTest({
          history: 0,
          histories,
          currentUserInput: 'A',
          tmbId: 'tmb_1',
          timezone: 'Asia/Shanghai',
          maxFiles: 20
        });

        expect(result.chatHistories).toEqual(histories);
        expect(result.rewrittenHistories).toEqual(histories);
      }
    );
  });
});
