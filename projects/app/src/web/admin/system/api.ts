import { GET } from '@/web/admin/common/request';
import type { ConfigStoreType } from '@/pageComponents/admin/config/type';

export const getInitFormData = () => GET<ConfigStoreType>('/proApi/admin/system/getConfig');
