import { GET, PUT, DELETE, POST } from '@/web/common/api/request';

import { type GetPluginTagListResponse } from '@fastgpt/global/openapi/core/plugin/toolTag/api';

/* ============ plugin tags ============== */
export const getPluginToolTags = () => GET<GetPluginTagListResponse>(`/core/plugin/toolTag/list`);
