import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { openAPITagGroups } from '../../../openapi/path';
import { DevApiTagsMap } from '../../../openapi/tag';

describe('App OpenAPI contracts', () => {
  it('registers app ownership transfer and template type APIs', () => {
    expect(openAPIDocument.paths?.['/proApi/core/app/changeOwner']?.post).toBeDefined();
    expect(
      openAPIDocument.paths?.['/proApi/core/app/template/getTemplateTypes']?.get
    ).toBeDefined();
  });

  it('groups app ownership transfer under permission and template types under template management', () => {
    expect(openAPIDocument.paths?.['/proApi/core/app/changeOwner']?.post?.tags).toEqual([
      DevApiTagsMap.permissionResource,
      DevApiTagsMap.appPer
    ]);
    expect(
      openAPIDocument.paths?.['/proApi/core/app/template/getTemplateTypes']?.get?.tags
    ).toEqual([DevApiTagsMap.appTemplate]);
    expect(openAPITagGroups.find(({ name }) => name === '核心-应用管理')?.tags).toContain(
      DevApiTagsMap.appTemplate
    );
  });
});
