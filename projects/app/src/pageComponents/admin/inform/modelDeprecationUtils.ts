import { format } from 'date-fns';
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

/** 所选日期按浏览器本地时间 23:59 截止；使用该日期的 offset，保留夏令时差异。 */
export const getPlannedDeprecationAt = (date: Date) => {
  const deadline = new Date(date);
  deadline.setHours(23, 59, 0, 0);
  return format(deadline, "yyyy-MM-dd'T'HH:mm:ssxxx");
};

/** 捕获浏览器提交时的发送时间及 offset；同一幂等请求必须复用这个值。 */
export const getModelDeprecationNotificationTime = (now = new Date()) =>
  format(now, "yyyy-MM-dd'T'HH:mm:ssxxx");

/** 计算浏览器本地日期的可选范围：明天至今天后 90 天。 */
export const getPlannedDateBounds = (now = new Date()) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const min = new Date(today);
  min.setDate(min.getDate() + 1);
  const max = new Date(today);
  max.setDate(max.getDate() + MAX_PLANNED_DAYS);
  return { min, max };
};
