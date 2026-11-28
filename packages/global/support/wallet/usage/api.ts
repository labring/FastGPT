import type { UsageItemTypeEnum, UsageSourceEnum } from './constants';
import type { UsageItemCountType, UsageItemType, UsageSchemaType } from './type';

export type GetUsageProps = {
  dateStart: string;
  dateEnd: string;
  sources?: UsageSourceEnum[];
  teamMemberIds?: string[];
  projectName?: string;
};

export type GetUsageDashboardProps = GetUsageProps & {
  unit: 'day' | 'month';
};
export type GetUsageDashboardResponseItem = {
  date: Date;
  totalPoints: number;
};

export type CreateUsageProps = Omit<UsageSchemaType, '_id' | 'time'>;
export type ConcatUsageProps = {
  teamId: string;
  usageId: string;
  totalPoints: number;
  itemType: UsageItemTypeEnum;
  /** 训练用量按实际模型归集。旧版调用和评测明细允许省略。 */
  modelId?: string;
} & UsageItemCountType;
export type PushUsageItemsProps = {
  teamId: string;
  usageId: string;
  list: UsageItemType[];
};
