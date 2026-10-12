import { GET, POST } from '@/web/admin/common/request';
import type { ConfigStoreType } from '@/pageComponents/admin/config/type';

export const getInitFormData = () => GET<ConfigStoreType>('/proApi/admin/system/getConfig');

export const postUpdateConfig = (data: ConfigStoreType) =>
  POST('/proApi/admin/system/updateConfig', data);
