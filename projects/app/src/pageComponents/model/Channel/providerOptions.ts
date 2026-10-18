import type { ChannelInfoType } from '@fastgpt/global/core/ai/model/channel';
import type { ProviderMetasResponse } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';

export const aceDataCloudOption = 'aceDataCloud';
export const aceDataCloudBaseUrl = 'https://api.acedata.cloud/openai';

/**
 * Ace 是已支持 OpenAI 协议的连接预设，不分配新的 AIProxy 协议 ID。
 * 仅在服务端确认 type=1 可创建时展示；选项身份只在表单内使用。
 */
export const getChannelProviderOptions = (metadata: ProviderMetasResponse, language: string) => {
  const protocols = Object.entries(metadata)
    .sort(
      ([, a], [, b]) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    )
    .flatMap(([channelId, data]) =>
      data.canCreate
        ? [
            {
              value: Number(channelId) as number | string,
              channelType: Number(channelId),
              label: parseI18nString(data.displayName ?? data.name, language as localeType),
              icon: data.avatar,
              defaultBaseUrl: data.defaultBaseUrl,
              keyHelp: data.keyHelp,
              website: data.website
            }
          ]
        : []
    );

  if (!metadata[1]?.canCreate) return protocols;

  return [
    ...protocols,
    {
      value: aceDataCloudOption,
      channelType: 1,
      label: 'Ace Data Cloud',
      icon: '/imgs/model/acedatacloud.png',
      defaultBaseUrl: aceDataCloudBaseUrl,
      keyHelp: language.startsWith('zh')
        ? 'Ace 应用 API Token，不含 Bearer 前缀'
        : 'Ace application API token, without Bearer',
      website:
        'https://platform.acedata.cloud/console/applications?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen&utm_content=fastgpt_provider_api_key'
    }
  ];
};

/** 编辑既有 Ace 连接时恢复品牌选项；其他自定义 OpenAI 地址仍显示原协议。 */
export const getChannelProviderOption = (channel: Pick<ChannelInfoType, 'type' | 'base_url'>) =>
  channel.type === 1 && channel.base_url?.replace(/\/+$/, '') === aceDataCloudBaseUrl
    ? aceDataCloudOption
    : channel.type;

/**
 * 显式选择连接预设时填入协议和地址；切换服务商清空旧密钥，防止发给另一地址。
 * 模型、映射等字段不在更新范围，保持用户已选模型配置。
 */
export const getChannelProviderSelection = (
  value: number | string,
  options: ReturnType<typeof getChannelProviderOptions>
) => {
  const selected = options.find((option) => option.value === value);
  if (!selected) return;
  return {
    type: selected.channelType,
    base_url: value === aceDataCloudOption ? aceDataCloudBaseUrl : '',
    key: ''
  };
};
