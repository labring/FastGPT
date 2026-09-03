import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import { AdminSystemMigrationsPath } from '../../../../../openapi/admin/common/system/migrations';
import {
  adminOpenAPIPaths,
  adminOpenAPITagGroups,
  openAPIPaths,
  openAPITagGroups
} from '../../../../../openapi/path';
import { DevApiTagsMap } from '../../../../../openapi/tag';

const routes = {
  list: '/admin/migrations/list',
  failedRecords: '/admin/migrations/failedRecords',
  retry: '/admin/migrations/retry'
} as const;

describe('system migration Admin OpenAPI contracts', () => {
  it('registers all migration routes in both DevAPI and Admin documents', () => {
    expect(adminOpenAPIPaths[routes.list]?.get?.tags).toEqual([DevApiTagsMap.adminSystemMigration]);
    expect(adminOpenAPIPaths[routes.failedRecords]?.get?.tags).toEqual([
      DevApiTagsMap.adminSystemMigration
    ]);
    expect(adminOpenAPIPaths[routes.retry]?.post?.tags).toEqual([
      DevApiTagsMap.adminSystemMigration
    ]);

    expect(openAPIPaths[routes.list]?.get?.tags).toEqual([DevApiTagsMap.adminSystemMigration]);
    expect(openAPIPaths[routes.failedRecords]?.get?.tags).toEqual([
      DevApiTagsMap.adminSystemMigration
    ]);
    expect(openAPIPaths[routes.retry]?.post?.tags).toEqual([DevApiTagsMap.adminSystemMigration]);
  });

  it('places the migration tag in its dedicated Admin group', () => {
    expect(adminOpenAPITagGroups).toContainEqual({
      name: '管理员-系统接口',
      tags: [DevApiTagsMap.adminSystemMigration]
    });
    expect(openAPITagGroups).toContainEqual({
      name: '管理员-系统接口',
      tags: [DevApiTagsMap.adminSystemMigration]
    });
  });

  it('generates a valid OpenAPI document from the shared schemas', () => {
    expect(() =>
      createDocument({
        openapi: '3.1.0',
        info: { title: 'System migration Admin API', version: '1.0.0' },
        paths: AdminSystemMigrationsPath
      })
    ).not.toThrow();
  });
});
