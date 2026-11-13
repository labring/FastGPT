import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import { AdminInformPath } from '../../../../openapi/admin/system/inform';

describe('AdminInformPath', () => {
  it('generates valid OpenAPI documentation for the routes', () => {
    expect(() =>
      createDocument({
        openapi: '3.1.0',
        info: { title: 'Model deprecation inform API', version: '1.0.0' },
        paths: AdminInformPath
      })
    ).not.toThrow();
  });
});
