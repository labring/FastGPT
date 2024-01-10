import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { InitDateResponse } from '@/global/common/api/systemRes';

export const getSystemInitData = () => GET<InitDateResponse>('/common/system/getInitData');
