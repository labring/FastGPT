import { ModelDeprecationInformChannelEnum } from '@fastgpt/global/support/user/inform/constants';

const MAX_PLANNED_DAYS = 90;

type UpcomingDeprecationModel = {
  modelId: string;
  isActive?: boolean;
  isUpcomingDeprecation?: boolean;
};

export type ModelDeprecationInformChannelOption =
  | ModelDeprecationInformChannelEnum.inApp
  | 'email_or_sms';

/** 通知计划只包含已启用且配置为即将下架的模型。 */
export const getSelectableDeprecationModels = <T extends UpcomingDeprecationModel>(models: T[]) =>
  models.filter(
    ({ isActive, isUpcomingDeprecation }) => isActive === true && isUpcomingDeprecation === true
  );

/** 将界面上的短信/邮件合并项展开为 worker 按收件账号选择的具体渠道。 */
export const getModelDeprecationInformChannels = (
  channels: ModelDeprecationInformChannelOption[]
): ModelDeprecationInformChannelEnum[] =>
  channels.flatMap((channel) =>
    channel === 'email_or_sms'
      ? [ModelDeprecationInformChannelEnum.email, ModelDeprecationInformChannelEnum.sms]
      : [channel]
  );

/** 将日期选择器的本地日期格式化为 YYYY-MM-DD，避免 toISOString 提前 UTC 日界。 */
export const getLocalDateLabel = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value) => String(value).padStart(2, '0'))
    .join('-');

/** 计算计划下架日可选范围：明天至今天后 90 天，按浏览器本地日历日比较。 */
export const getPlannedDateBounds = (now = new Date()) => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const min = new Date(today);
  min.setDate(min.getDate() + 1);

  const max = new Date(today);
  max.setDate(max.getDate() + MAX_PLANNED_DAYS);

  return { min, max };
};
