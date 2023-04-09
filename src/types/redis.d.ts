import { ModelDataStatusEnum } from '@/constants/redis';
export interface RedisModelDataItemType {
  id: string;
  q: string;
  text: string;
  status: `${ModelDataStatusEnum}`;
}
