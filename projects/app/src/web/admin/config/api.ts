import { GET, POST } from '@/web/admin/common/request';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import type { ConfigStoreType } from '@/pageComponents/admin/config/type';

export const getInitFormConfig = () => GET('/proApi/admin/common/system/getInitForm');
export const getInitFormData = () =>
  GET<ConfigStoreType>('/proApi/admin/routes/settings/getConfig');

export const postUpdateConfig = (data: ConfigStoreType) =>
  POST('/proApi/admin/routes/settings/updateConfig', data);

export const getFeConfigs = () =>
  GET<{ feConfigs?: FastGPTFeConfigsType }>('/proApi/common/system/getFeConfigs');
