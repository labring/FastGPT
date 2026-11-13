import { describe, expect, it } from 'vitest';
import { ChatUpstreamProtocolSchema } from '@fastgpt/global/core/ai/model/channel';
import {
  CreateChannelBodySchema,
  UpdateChannelBodySchema
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

describe('ChatUpstreamProtocolSchema', () => {
  it.each(['auto', 'responses', 'chat_completions'])(
    'preserves the explicitly selected protocol %s',
    (value) => {
      expect(ChatUpstreamProtocolSchema.parse(value)).toBe(value);
    }
  );

  it.each(['unknown', '', null, undefined, true, 1, {}, []])(
    'falls back to auto for unsupported value %j',
    (value) => {
      expect(ChatUpstreamProtocolSchema.parse(value)).toBe('auto');
    }
  );
});

describe('channel API protocol normalization', () => {
  it('normalizes invalid protocol values in create and update while preserving other configs', () => {
    const configs = { chat_upstream_protocol: { unexpected: true }, vendor_option: false };
    const created = CreateChannelBodySchema.parse({
      channelType: 'system',
      name: 'test',
      type: 1,
      key: '',
      models: [],
      configs
    });
    const updated = UpdateChannelBodySchema.parse({ id: 1, channelType: 'system', configs });
    expect(created.configs).toEqual({ chat_upstream_protocol: 'auto', vendor_option: false });
    expect(updated.configs).toEqual(created.configs);
  });

  it('keeps omitted update fields absent so unrelated edits retain the saved protocol', () => {
    expect(UpdateChannelBodySchema.parse({ id: 1, channelType: 'system' }).configs).toBeUndefined();
    expect(
      UpdateChannelBodySchema.parse({ id: 1, channelType: 'system', configs: {} }).configs
    ).toEqual({});
  });
});
