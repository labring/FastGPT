import { createDocument } from 'zod-openapi';
import { AdminCorePath } from '../admin/core';
import { AdminSupportPath } from '../admin/support';
import { DevApiTagsMap } from '../tag';

export const adminOpenAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT Admin API',
    version: '0.1.0',
    description: 'FastGPT Admin API 文档'
  },
  paths: {
    ...AdminCorePath,
    ...AdminSupportPath
  },
  servers: [{ url: '/api' }],
  'x-tagGroups': [
    {
      name: '仪表盘',
      tags: [DevApiTagsMap.adminDashboard]
    },
    {
      name: '核心资源管理',
      tags: [DevApiTagsMap.adminApps]
    },
    {
      name: '系统配置',
      tags: [DevApiTagsMap.adminInform]
    }
  ]
});
