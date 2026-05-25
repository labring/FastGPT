import { describe, expect, it } from 'vitest';
import { sanitizeLLMRequestRecordPayload } from '@fastgpt/service/core/ai/record/controller';

const createBase64 = (length = 320) => 'a'.repeat(length);

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

  it('redacts base64 embedded in a longer string', () => {
    const payload = {
      markdown: `![image](data:image/jpeg;base64,${createBase64()})`
    };

    expect(sanitizeLLMRequestRecordPayload(payload)).toEqual({
      markdown: '![image](data:image/jpeg;base64,[base64 omitted])'
    });
  });
});
