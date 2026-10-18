import { describe, expect, it } from 'vitest';
import {
  aceDataCloudBaseUrl,
  aceDataCloudOption,
  getChannelProviderOption,
  getChannelProviderOptions,
  getChannelProviderSelection
} from '@/pageComponents/model/Channel/providerOptions';
import type { ProviderMetasResponse } from '@fastgpt/global/openapi/core/ai/model/channel/api';

const metadata: ProviderMetasResponse = {
  1: {
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyHelp: 'OpenAI key',
    canCreate: true
  },
  3: { name: 'Azure', defaultBaseUrl: '', keyHelp: '', canCreate: true },
  8: { name: 'Unavailable', defaultBaseUrl: '', keyHelp: '', canCreate: false }
};

describe('native Ace Data Cloud connection preset', () => {
  it('appears alongside supported protocols and uses the existing OpenAI protocol', () => {
    const options = getChannelProviderOptions(metadata, 'en');
    expect(options.map((option) => option.label)).toEqual(['OpenAI', 'Azure', 'Ace Data Cloud']);
    expect(options.find((option) => option.value === aceDataCloudOption)).toMatchObject({
      channelType: 1,
      defaultBaseUrl: aceDataCloudBaseUrl,
      icon: '/imgs/model/acedatacloud.png'
    });
  });

  it('does not offer an unusable preset if protocol 1 is unavailable', () => {
    expect(getChannelProviderOptions({}, 'en')).toEqual([]);
    expect(
      getChannelProviderOptions({ ...metadata, 1: { ...metadata[1], canCreate: false } }, 'en')
    ).not.toContainEqual(expect.objectContaining({ value: aceDataCloudOption }));
  });

  it('pre-fills the fixed Ace endpoint and clears credentials on explicit selection', () => {
    const options = getChannelProviderOptions(metadata, 'en');
    expect(getChannelProviderSelection(aceDataCloudOption, options)).toEqual({
      type: 1,
      base_url: aceDataCloudBaseUrl,
      key: ''
    });
    expect(getChannelProviderSelection(3, options)).toEqual({ type: 3, base_url: '', key: '' });
    expect(getChannelProviderSelection('unknown', options)).toBeUndefined();
  });

  it('recognizes existing Ace endpoints without relabeling arbitrary OpenAI connections', () => {
    expect(getChannelProviderOption({ type: 1, base_url: `${aceDataCloudBaseUrl}/` })).toBe(
      aceDataCloudOption
    );
    expect(getChannelProviderOption({ type: 1, base_url: 'https://example.com/v1' })).toBe(1);
    expect(getChannelProviderOption({ type: 3, base_url: aceDataCloudBaseUrl })).toBe(3);
  });

  it('provides the application token destination with complete supported attribution tags', () => {
    const option = getChannelProviderOptions(metadata, 'zh-CN').find(
      (option) => option.value === aceDataCloudOption
    )!;
    const url = new URL(option.website!);
    expect(url.origin + url.pathname).toBe('https://platform.acedata.cloud/console/applications');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'opensource',
      utm_medium: 'referral',
      utm_campaign: 'evergreen',
      utm_content: 'fastgpt_provider_api_key'
    });
    expect(option.keyHelp).toContain('API Token');
  });
});
