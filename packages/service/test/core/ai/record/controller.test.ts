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
    expect(payload.messages[0].content[1].image_url.url).toContain(createBase64());
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
});

describe('LLM request record team isolation', () => {
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
