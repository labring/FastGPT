import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '@fastgpt/global/openapi';
import { GetPreviewNodeQuerySchema } from '@fastgpt/global/openapi/core/app/tool/api';

describe('GetPreviewNodeQuerySchema', () => {
  it('accepts versionId, including empty string', () => {
    expect(
      GetPreviewNodeQuerySchema.safeParse({
        appId: 'systemTool-weather',
        versionId: ''
      }).success
    ).toBe(true);

    expect(
      GetPreviewNodeQuerySchema.safeParse({
        appId: 'systemTool-weather',
        versionId: '68ad85a7463006c963799a05'
      }).success
    ).toBe(true);
  });

  it('accepts getLatestVersion only when versionId is omitted', () => {
    expect(
      GetPreviewNodeQuerySchema.safeParse({
        appId: 'systemTool-weather',
        getLatestVersion: true
      }).success
    ).toBe(true);
  });

  it('rejects missing or duplicated version selectors', () => {
    expect(
      GetPreviewNodeQuerySchema.safeParse({
        appId: 'systemTool-weather'
      }).success
    ).toBe(false);

    expect(
      GetPreviewNodeQuerySchema.safeParse({
        appId: 'systemTool-weather',
        versionId: '',
        getLatestVersion: true
      }).success
    ).toBe(false);
  });

  it('rejects getLatestVersion=false', () => {
    expect(
      GetPreviewNodeQuerySchema.safeParse({
        appId: 'systemTool-weather',
        getLatestVersion: false
      }).success
    ).toBe(false);
  });

  it('keeps full OpenAPI document generation compatible with query params', () => {
    expect(openAPIDocument.paths['/core/app/tool/getPreviewNode']?.get).toBeDefined();
  });
});
