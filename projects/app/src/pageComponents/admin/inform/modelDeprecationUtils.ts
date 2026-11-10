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

/** 将日期选择器的 UTC 日期格式化为 YYYY-MM-DD。 */
export const getUTCDateLabel = (date: Date) =>
  [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((value) => String(value).padStart(2, '0'))
    .join('-');

/** 计算计划下架日可选范围：服务端 UTC 明天至 UTC 今天后 90 天。 */
export const getPlannedDateBounds = (now = new Date()) => {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const min = new Date(today);
  min.setUTCDate(min.getUTCDate() + 1);

  const max = new Date(today);
  max.setUTCDate(max.getUTCDate() + MAX_PLANNED_DAYS);

  return { min, max };
};
