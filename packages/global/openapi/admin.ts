import { createDocument } from 'zod-openapi';
import { DashboardPath } from './admin/core/dashboard';
import { TagsMap } from './tag';
import { AdminSupportPath } from './admin/support';

export const adminOpenAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT Admin API',
    version: '0.1.0',
    description: 'FastGPT Admin API 文档'
  },
  paths: {
    ...DashboardPath,
    ...AdminSupportPath
  },
  servers: [{ url: '/api' }],
  'x-tagGroups': [
    {
      name: '仪表盘',
      tags: [TagsMap.adminDashboard]
    },
    {
      name: '系统配置',
      tags: [TagsMap.adminInform]
    }
  ]
});
