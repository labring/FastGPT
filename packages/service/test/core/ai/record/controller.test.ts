import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLLMRequestRecord,
  getLLMRequestRecords,
  sanitizeLLMRequestRecordPayload,
  saveLLMRequestRecord
} from '@fastgpt/service/core/ai/record/controller';
import { MongoLLMRequestRecord } from '@fastgpt/service/core/ai/record/schema';

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

  it.each([false, true])(
    'omits stacks from nested and array errors with enumerable=%s',
    (enumerable) => {
      const cause = Object.assign(new Error('provider failed'), { code: 'PROVIDER_ERROR' });
      const error = Object.assign(new Error('tool failed', { cause: { original: cause } }), {
        code: 'LLM_TOOL_CALL_ERROR'
      });
      Object.defineProperty(error, 'stack', { enumerable });
      Object.defineProperty(cause, 'stack', { enumerable });
      const result = sanitizeLLMRequestRecordPayload(
        { error, errors: [cause] },
        {
          omitErrorStack: true
        }
      );
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
    }
  );
});

describe('LLM request record team isolation', () => {
  it.each([false, true])(
    'persists upstream errors without stacks with enumerable=%s',
    async (enumerable) => {
      const cause = Object.assign(new Error('provider disconnected'), { code: 'PROVIDER_ERROR' });
      const error = Object.assign(new Error('upstream failed', { cause }), {
        code: 'UPSTREAM_ERROR'
      });
      Object.defineProperty(error, 'stack', { enumerable });
      Object.defineProperty(cause, 'stack', { enumerable });
      await saveLLMRequestRecord({
        teamId: '507f1f77bcf86cd799439011',
        requestId: 'upstream_error',
        body: {},
        response: { error }
      });
      const record = await getLLMRequestRecord('upstream_error', '507f1f77bcf86cd799439011');
      expect(record?.response).toEqual({
        error: {
          name: 'Error',
          code: 'UPSTREAM_ERROR',
          message: 'upstream failed',
          cause: {
            name: 'Error',
            code: 'PROVIDER_ERROR',
            message: 'provider disconnected'
          }
        }
      });
      // 入库清理顶层及 cause 的调用栈，原始 Error 仍可用于系统日志。
      expect(error.stack).toEqual(expect.any(String));
      expect(cause.stack).toEqual(expect.any(String));
      expect(error.cause).toBe(cause);
    }
  );

  it('redacts image, audio and very large video payloads before saving the request to MongoDB', async () => {
    const videoBase64 = createBase64(10_000_000);
    const imageBase64 = createBase64();
    const audioBase64 = createBase64();
    const body = {
      model: 'gpt-4o',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'analyze these media files' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
            { type: 'input_audio', input_audio: { data: audioBase64, format: 'wav' } },
            { type: 'video_url', video_url: { url: `data:video/mp4;base64,${videoBase64}` } },
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
          ]
        }
      ]
    };
    await saveLLMRequestRecord({
      teamId: '507f1f77bcf86cd799439011',
      requestId: 'media_request',
      body,
      response: { answerText: 'done' }
    });
    const record = await getLLMRequestRecord('media_request', '507f1f77bcf86cd799439011');
    expect(record?.body).toEqual({
      model: 'gpt-4o',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'analyze these media files' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,[base64 omitted]' } },
            { type: 'input_audio', input_audio: { data: '[base64 omitted]', format: 'wav' } },
            { type: 'video_url', video_url: { url: 'data:video/mp4;base64,[base64 omitted]' } },
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
          ]
        }
      ]
    });
    expect(record?.response).toEqual({ answerText: 'done' });
    expect(JSON.stringify(record?.body)).not.toContain(videoBase64);
    expect(JSON.stringify(body)).toContain(videoBase64);
    expect(JSON.stringify(body)).toContain(imageBase64);
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
