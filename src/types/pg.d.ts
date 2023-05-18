import { ModelDataStatusEnum } from '@/constants/model';

export interface PgKBDataItemType {
  id: string;
  q: string;
  a: string;
  status: `${ModelDataStatusEnum}`;
  model_id: string;
  user_id: string;
  kb_id: string;
}
