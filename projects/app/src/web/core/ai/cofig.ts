import { GET } from '@/web/common/api/request';
import type { listResponse } from '@/pages/api/core/ai/model/list';

export const getSystemModelList = () => GET<listResponse>('/core/ai/model/list');
