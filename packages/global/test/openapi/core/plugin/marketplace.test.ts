import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../openapi/provider/devapi';
import { openAPIPaths, openAPITagGroups } from '../../../../openapi/path';
import { DevApiTagNameAliases, DevApiTagsMap } from '../../../../openapi/tag';

const marketplaceOperations = [
  ['/marketplace/api/tool/list', 'post'],
  ['/marketplace/api/tool/detail', 'get'],
  ['/marketplace/api/tool/getDownloadUrl', 'get'],
  ['/marketplace/api/tool/getDownloadUrl', 'post'],
  ['/marketplace/api/tool/tags', 'get'],
  ['/marketplace/api/tool/versions', 'get']
] as const;

describe('marketplace OpenAPI contracts', () => {
  it('places Marketplace after reverse invoke with only the system tools tag', () => {
    const reverseInvokeGroupIndex = openAPITagGroups.findIndex(
      ({ name }) => name === '通用-反向调用'
    );

    expect(DevApiTagsMap.appSystemTool).toBe('系统工具');
    expect(DevApiTagsMap.pluginMarketplace).toBe('插件市场-系统工具');
    expect(DevApiTagNameAliases[DevApiTagsMap.pluginMarketplace]).toBe('系统工具');
    expect(openAPITagGroups[reverseInvokeGroupIndex + 1]).toEqual({
      name: '插件市场',
      tags: [DevApiTagsMap.pluginMarketplace]
    });
  });

  it('documents only Marketplace operations used by FastGPT App', () => {
    for (const [path, method] of marketplaceOperations) {
      expect(openAPIPaths[path]?.[method]).toBeDefined();
      expect(openAPIDocument.paths?.[path]?.[method]?.tags).toEqual([
        DevApiTagsMap.pluginMarketplace
      ]);
    }

    expect(openAPIPaths['/marketplace/api/tool/list']?.get).toBeUndefined();
    expect(openAPIPaths['/marketplace/api/admin/pkg/upload']).toBeUndefined();
    expect(openAPIPaths['/marketplace/api/admin/pkg/delete']).toBeUndefined();
    expect(openAPIPaths['/marketplace/api/admin/pkg/refresh']).toBeUndefined();
  });

  it('keeps tool-tag management outside of the Marketplace group', () => {
    expect(openAPIDocument.paths?.['/core/plugin/toolTag/list']?.get?.tags).not.toContain(
      DevApiTagsMap.pluginMarketplace
    );
  });
});
