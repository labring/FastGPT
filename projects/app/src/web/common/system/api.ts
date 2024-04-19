import type { InitDateResponse } from '@/global/common/api/systemRes';
import { GET } from '@/web/common/api/request';

export const getSystemInitData = () => GET<InitDateResponse>('/common/system/getInitData');
