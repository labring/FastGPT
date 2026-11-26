/** 格式化发布渠道列表的积分用量展示；缺省或 -1 显示无限制，0 作为有效上限保留显示。 */
export const formatOutLinkUsagePoints = ({
  usagePoints,
  maxUsagePoints,
  isPlus,
  unlimitedLabel
}: {
  usagePoints: number;
  maxUsagePoints?: number;
  isPlus?: boolean;
  unlimitedLabel: string;
}) => {
  const used = `${Math.round(usagePoints)}`;
  if (!isPlus) return used;
  const limit = maxUsagePoints ?? -1;
  return `${used} / ${limit > -1 ? limit : unlimitedLabel}`;
};
