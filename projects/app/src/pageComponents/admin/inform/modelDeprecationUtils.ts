type UpcomingDeprecationModel = {
  modelId: string;
  isActive?: boolean;
  isUpcomingDeprecation?: boolean;
};

/** 通知计划只包含已启用且配置为即将下架的模型。 */
export const getSelectableDeprecationModels = <T extends UpcomingDeprecationModel>(models: T[]) =>
  models.filter(
    ({ isActive, isUpcomingDeprecation }) => isActive === true && isUpcomingDeprecation === true
  );

/** 将日期选择器的本地日期格式化为 YYYY-MM-DD，避免 toISOString 提前 UTC 日界。 */
export const getLocalDateLabel = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value) => String(value).padStart(2, '0'))
    .join('-');

export const getPlannedDeprecationDateLabel = (date: string) => getLocalDateLabel(new Date(date));
