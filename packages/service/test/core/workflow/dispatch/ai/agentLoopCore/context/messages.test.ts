import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  buildAgentLoopCoreInputFilesPrompt,
  buildAgentLoopCoreInput,
  buildAgentLoopCoreRequestMessages,
  buildAgentLoopCoreSkillsPrompt,
  buildAgentLoopCoreSystemPrompt,
  buildAgentLoopCoreUserReminderInput,
  parseAgentLoopCoreUserSystemPrompt
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
import { describe, expect, it } from 'vitest';

describe('buildAgentLoopCoreRequestMessages', () => {
  it('keeps tool context and removes system messages by default', () => {
    const messages = buildAgentLoopCoreRequestMessages({
      messages: [
        {
          obj: ChatRoleEnum.System,
          value: [
            {
              text: {
                content: 'system prompt'
              }
            }
          ]
        },
        {
          obj: ChatRoleEnum.AI,
          value: [
            {
              tools: [
                {
                  id: 'call_search',
                  functionName: 'search',
                  params: '{"q":"FastGPT"}',
                  response: 'tool result'
                }
              ]
            }
          ]
        }
      ]
    });

    expect(messages.map((message) => message.role)).toEqual([
      ChatCompletionRequestMessageRoleEnum.Assistant,
      ChatCompletionRequestMessageRoleEnum.Tool
    ]);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        tool_calls: [
          expect.objectContaining({
            id: 'call_search',
            function: expect.objectContaining({
              name: 'search',
              arguments: '{"q":"FastGPT"}'
            })
          })
        ]
      })
    );
    expect(messages[1]).toEqual(
      expect.objectContaining({
        tool_call_id: 'call_search',
        content: 'tool result'
      })
    );
  });

  it('can keep system messages for ToolCall-compatible input', () => {
    expect(
      buildAgentLoopCoreRequestMessages({
        messages: [
          {
            obj: ChatRoleEnum.System,
            value: [
              {
                text: {
                  content: 'system prompt'
                }
              }
            ]
          }
        ],
        removeSystemMessages: false
      })
    ).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      }
    ]);
  });
});

describe('buildAgentLoopCoreInput', () => {
  it('keeps provider resume and child interactive fields inside one core input boundary', () => {
    const childrenInteractiveParams = {
      childrenResponse: {
        type: 'userSelect'
      },
      toolParams: {
        toolCallId: 'call_tool'
      }
    };

    expect(
      buildAgentLoopCoreInput({
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'answer'
          }
        ],
        systemPrompt: 'system prompt',
        providerState: {
          pendingMainContext: {
            askToolCallId: 'call_ask'
          }
        },
        userAnswer: 'confirmed',
        childrenInteractiveParams
      })
    ).toEqual({
      messages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: 'answer'
        }
      ],
      systemPrompt: 'system prompt',
      providerState: {
        pendingMainContext: {
          askToolCallId: 'call_ask'
        }
      },
      userAnswer: 'confirmed',
      childrenInteractiveParams
    });
  });
});

describe('agentLoopCore prompt helpers', () => {
  it('rewrites user system prompt and merges runtime prompts before rewriting', () => {
    expect(parseAgentLoopCoreUserSystemPrompt({ userSystemPrompt: '' })).toBe('');

    const prompt = buildAgentLoopCoreSystemPrompt({
      userSystemPrompt: 'system prompt',
      runtimePrompts: ['sandbox prompt']
    });

    expect(prompt).toContain('system prompt\n\nsandbox prompt');
    expect(prompt).toContain('<user_background></user_background>');
    expect(prompt).toContain('@工具名');
  });
});

describe('agentLoopCore reminder helpers', () => {
  it('builds escaped file and skill reminder blocks', () => {
    const filePrompt = buildAgentLoopCoreInputFilesPrompt([
      {
        id: `current-&-'"-0`,
        name: `a<b>&"c"'d.pdf`,
        type: ChatFileTypeEnum.file,
        url: '/guide.pdf'
      },
      {
        id: 'image-0',
        name: 'image.png',
        type: ChatFileTypeEnum.image,
        url: '/image.png'
      }
    ]);

    expect(filePrompt).toContain('<id>current-&amp;-&apos;&quot;-0</id>');
    expect(filePrompt).toContain('<name>a&lt;b&gt;&amp;&quot;c&quot;&apos;d.pdf</name>');
    expect(filePrompt).toContain('image-0');

    const skillPrompt = buildAgentLoopCoreSkillsPrompt([
      {
        id: 'skill_report',
        name: 'Report <R&D>',
        description: 'Write & review',
        directory: '/workspace/Report & Review',
        skillMdPath: '/workspace/Report & Review/SKILL.md'
      }
    ]);

    expect(skillPrompt).toContain('<name>Report &lt;R&amp;D&gt;</name>');
    expect(skillPrompt).toContain('<description>Write &amp; review</description>');
    expect(skillPrompt).toContain('<path>/workspace/Report &amp; Review/SKILL.md</path>');
  });

  it('builds current user reminder in stable section order', () => {
    const result = buildAgentLoopCoreUserReminderInput({
      query: '帮我总结',
      filesInfo: [
        {
          id: 'current-0',
          name: 'guide.pdf',
          type: ChatFileTypeEnum.file,
          url: '/guide.pdf'
        }
      ],
      selectedDataset: [
        {
          datasetId: 'dataset_1',
          name: '产品知识库',
          intro: '产品 <FAQ> & 售后说明'
        }
      ],
      currentWorkingDirectory: '/workspace',
      currentTime: '2026-05-14 10:00:00 Thursday'
    });

    expect(result).toContain('<system-reminder>');
    expect(result.indexOf('## 文件')).toBeLessThan(result.indexOf('## 知识库'));
    expect(result.indexOf('## 知识库')).toBeLessThan(result.indexOf('## 背景信息'));
    expect(result).toContain('<description>产品 &lt;FAQ&gt; &amp; 售后说明</description>');
    expect(result).toContain('当前 sandbox 工作目录: /workspace');
    expect(result).toContain('帮我总结');
  });
});
