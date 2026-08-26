import type { ChannelType } from '@fastgpt/global/openapi/core/ai/channel/api';

export type ChannelScopeFilter = 'public' | 'team';

/**
 * 将前端显式选择的渠道范围映射为观测接口范围。
 * 普通成员始终固定为 team；root 可在系统渠道和 root 本人的私有渠道之间切换。
 */
export const getObservabilityChannelType = ({
  isRoot,
  activeGroupType
}: {
  isRoot: boolean;
  activeGroupType: ChannelScopeFilter;
}): ChannelType => (isRoot && activeGroupType === 'public' ? 'system' : 'team');
