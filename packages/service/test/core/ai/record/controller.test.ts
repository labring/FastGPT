import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLLMRequestRecord,
  getLLMRequestRecords,
  sanitizeLLMRequestRecordPayload,
  saveLLMRequestRecord
} from '@fastgpt/service/core/ai/record/controller';
import { MongoLLMRequestRecord } from '@fastgpt/service/core/ai/record/schema';
import { createStreamResponse } from '@fastgpt/service/core/ai/llm/request/response/stream';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { StreamResponseType } from '@fastgpt/global/core/ai/llm/type';

const createBase64 = (length = 320) => 'a'.repeat(length);

beforeEach(async () => {
  await MongoLLMRequestRecord.deleteMany({});
});

describe('sanitizeLLMRequestRecordPayload', () => {
  it('redacts base64 data urls without changing surrounding request structure', () => {
    const payload = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe this image' },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${createBase64()}`
              }
            }
          ]
        }
      ]
    };

    const result = sanitizeLLMRequestRecordPayload(payload);

    expect(result).toEqual({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe this image' },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,[base64 omitted]'
              }
            }
          ]
        }
      ]
    });
    expect(payload.messages[0].content[1].image_url?.url).toContain(createBase64());
  });

  it('redacts raw base64 data fields and keeps normal text', () => {
    const payload = {
      input_audio: {
        format: 'wav',
        data: createBase64()
      },
      text: 'plain text should stay'
    };

    expect(sanitizeLLMRequestRecordPayload(payload)).toEqual({
      input_audio: {
        format: 'wav',
        data: '[base64 omitted]'
      },
      text: 'plain text should stay'
    });
  });

  it('serializes nested errors and custom properties while redacting diagnostic data', () => {
    const cause = Object.assign(new Error('provider failed'), { code: 'PROVIDER_ERROR' });
    const error = Object.assign(
      new Error('tool failed', {
        cause: { original: cause, image: `data:image/png;base64,${createBase64()}` }
      }),
      { code: 'LLM_TOOL_CALL_ERROR' }
    );
    const result = sanitizeLLMRequestRecordPayload({
      error,
      date: new Date(0),
      buffer: Buffer.from('image'),
      empty: null,
      enabled: false
    });
    expect(result).toMatchObject({
      error: {
        name: 'Error',
        message: 'tool failed',
        stack: expect.any(String),
        code: 'LLM_TOOL_CALL_ERROR',
        cause: {
          original: {
            name: 'Error',
            message: 'provider failed',
            code: 'PROVIDER_ERROR',
            stack: expect.any(String)
          },
          image: 'data:image/png;base64,[base64 omitted]'
        }
      },
      date: new Date(0),
      buffer: '[base64 omitted]',
      empty: null,
      enabled: false
    });
    expect(error.cause).toHaveProperty('image', `data:image/png;base64,${createBase64()}`);
    const noStack = new Error('no stack');
    delete noStack.stack;
    expect(sanitizeLLMRequestRecordPayload(noStack)).toEqual({
      name: 'Error',
      message: 'no stack'
    });
  });

  it('omits stacks from top-level, nested and array errors but keeps other diagnostics', () => {
    const cause = Object.assign(new Error('provider failed'), { code: 'PROVIDER_ERROR' });
    const error = Object.assign(new Error('tool failed', { cause: { original: cause } }), {
      code: 'LLM_TOOL_CALL_ERROR'
    });
    const result = sanitizeLLMRequestRecordPayload({ error, errors: [cause] }, undefined, {
      omitErrorStack: true
    });
    expect(result).toEqual({
      error: {
        name: 'Error',
        message: 'tool failed',
        code: 'LLM_TOOL_CALL_ERROR',
        cause: {
          original: { name: 'Error', message: 'provider failed', code: 'PROVIDER_ERROR' }
        }
      },
      errors: [{ name: 'Error', message: 'provider failed', code: 'PROVIDER_ERROR' }]
    });
    // 原始 Error 不被修改，日志场景默认仍保留 stack。
    expect(error.stack).toEqual(expect.any(String));
    expect(sanitizeLLMRequestRecordPayload({ error })).toMatchObject({
      error: { stack: expect.any(String) }
    });
  });
});

describe('LLM request record team isolation', () => {
  it('persists actual stream tool error diagnostics through sanitization and MongoDB', async () => {
    async function* generate() {
      yield {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'invalid',
                  type: 'function',
                  function: { name: 'unknown', arguments: '{}' }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ]
      };
    }
    const result = await createStreamResponse({
      body: {
        messages: [],
        stream: true,
        tools: [{ type: 'function', function: { name: 'search', parameters: { type: 'object' } } }],
        model: {
          modelId: '68ad85a7463006c963799a64',
          type: ModelTypeEnum.llm,
          scope: ModelScopeEnum.system,
          provider: 'openai',
          model: 'gpt-4o',
          name: 'GPT-4o',
          config: { maxContext: 128000, maxResponse: 4096, quoteMaxToken: 60000, reasoning: false }
        }
      },
      response: generate() as unknown as StreamResponseType
    });
    await saveLLMRequestRecord({
      teamId: '507f1f77bcf86cd799439011',
      requestId: 'invalid_tool',
      body: {},
      response: result
    });
    const record = await getLLMRequestRecord('invalid_tool', '507f1f77bcf86cd799439011');
    expect(record?.response).toMatchObject({
      finish_reason: 'error',
      error: {
        name: 'LLMToolCallError',
        code: 'LLM_TOOL_CALL_ERROR',
        message: expect.stringContaining('no valid tool calls'),
        cause: {
          finish_reason: 'tool_calls',
          expectedToolNames: ['search'],
          receivedToolCalls: [
            {
              index: 0,
              id: 'invalid',
              type: 'function',
              function: { name: 'unknown', arguments: '{}' }
            }
          ]
        }
      }
    });
    // 请求记录会通过接口展示给团队成员，不保存包含服务端路径的调用栈。
    expect(record?.response?.error).not.toHaveProperty('stack');
  });

  it('saves records with very large video data urls after redacting base64 payloads', async () => {
    const largeVideoBase64 = createBase64(10_000_000);

    await saveLLMRequestRecord({
      teamId: '507f1f77bcf86cd799439011',
      requestId: 'large_video_request',
      body: {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'analyze this video' },
              {
                type: 'video_url',
                video_url: {
                  url: `data:video/mp4;base64,${largeVideoBase64}`
                }
              }
            ]
          }
        ]
      },
      response: { answerText: 'done' }
    });

    const record = await getLLMRequestRecord('large_video_request', '507f1f77bcf86cd799439011');

    expect(record?.body.messages[0].content[1].video_url.url).toBe(
      'data:video/mp4;base64,[base64 omitted]'
    );
    expect(record?.response).toEqual({ answerText: 'done' });
  });

  it('saves records with teamId and only reads them from the same team', async () => {
    await saveLLMRequestRecord({
      teamId: '507f1f77bcf86cd799439011',
      requestId: 'req_team_a',
      body: { prompt: 'team a prompt' },
      response: { answerText: 'team a answer' }
    });

    await expect(getLLMRequestRecord('req_team_a', '507f1f77bcf86cd799439012')).resolves.toBeNull();

    const record = await getLLMRequestRecord('req_team_a', '507f1f77bcf86cd799439011');

    expect(record).toMatchObject({
      requestId: 'req_team_a',
      body: { prompt: 'team a prompt' },
      response: { answerText: 'team a answer' }
    });
    expect(String(record?.teamId)).toBe('507f1f77bcf86cd799439011');
  });

  it('scopes batch record reads by teamId', async () => {
    await saveLLMRequestRecord({
      teamId: '507f1f77bcf86cd799439011',
      requestId: 'same_request_id',
      body: { prompt: 'team a prompt' },
      response: { answerText: 'team a answer' }
    });
    await saveLLMRequestRecord({
      teamId: '507f1f77bcf86cd799439012',
      requestId: 'same_request_id',
      body: { prompt: 'team b prompt' },
      response: { answerText: 'team b answer' }
    });

    const records = await getLLMRequestRecords(['same_request_id'], '507f1f77bcf86cd799439011');

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      requestId: 'same_request_id',
      body: { prompt: 'team a prompt' },
      response: { answerText: 'team a answer' }
    });
    expect(String(records[0]?.teamId)).toBe('507f1f77bcf86cd799439011');

    const teamBRecord = await getLLMRequestRecord('same_request_id', '507f1f77bcf86cd799439012');

    expect(teamBRecord).toMatchObject({
      requestId: 'same_request_id',
      body: { prompt: 'team b prompt' },
      response: { answerText: 'team b answer' }
    });
    expect(String(teamBRecord?.teamId)).toBe('507f1f77bcf86cd799439012');
  });
});
