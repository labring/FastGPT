import { describe, expect, it } from 'vitest';
import { AdminPath } from '../../../openapi/admin';
import { openAPIPaths } from '../../../openapi/path';
import { AdminLicensePath } from '../../../openapi/admin/license';

describe('admin license OpenAPI registration', () => {
  it('registers all license routes in the admin and complete API path maps', () => {
    for (const route of [
      '/proApi/admin/license/auth',
      '/proApi/admin/license/active',
      '/proApi/admin/license/instanceId'
    ] as const) {
      expect(AdminPath[route]).toBe(AdminLicensePath[route]);
      expect(openAPIPaths[route]).toBe(AdminLicensePath[route]);
    }
  });
});
