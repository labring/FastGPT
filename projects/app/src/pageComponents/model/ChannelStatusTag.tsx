import { ChannelStatusEnum, ChannelStatusMap } from '@fastgpt/global/core/ai/channel';
import MyTag, { type ColorSchemaType, type TagProps } from '@fastgpt/web/components/common/Tag';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';

/**
 * 获取渠道状态对应的静态国际化文案。
 * 使用字面量分支确保 i18n 静态扫描工具能正确定位文案 key。
 */
export const getChannelStatusLabel = (
  t: (key: string, options?: any) => string,
  status?: number
) => {
  switch (status) {
    case ChannelStatusEnum.ChannelStatusEnabled:
      return t('config_model:channel_status_enabled');
    case ChannelStatusEnum.ChannelStatusDisabled:
      return t('config_model:channel_status_disabled');
    case ChannelStatusEnum.ChannelStatusAutoDisabled:
      return t('config_model:channel_status_auto_disabled');
    default:
      return t('config_model:channel_status_unknown');
  }
};

/**
 * 统一渲染模型渠道状态标签，包含样式映射与国际化文案。
 * 供模型悬浮渠道列表、关联弹窗与已关联渠道列表等场景复用。
 */
const ChannelStatusTag = ({
  status,
  type = 'borderFill',
  ...props
}: {
  status?: number;
} & Omit<TagProps, 'children'>) => {
  const { t } = useClientTranslation('config_model');
  const statusConfig = ChannelStatusMap[status as keyof typeof ChannelStatusMap];

  return (
    <MyTag
      type={type}
      colorSchema={(statusConfig?.colorSchema ?? 'gray') as ColorSchemaType}
      {...props}
    >
      {getChannelStatusLabel(t, status)}
    </MyTag>
  );
};

export default ChannelStatusTag;
