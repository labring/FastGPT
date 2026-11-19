import { describe, expect, it } from 'vitest';
import {
  CreateAppRegistrationBodySchema,
  CreateAppRegistrationResponseSchema
} from '../../../openapi/admin/support/appRegistration/api';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { DevApiTagsMap } from '../../../openapi/tag';

describe('Admin appRegistration OpenAPI contract', () => {
  it('registers POST /admin/support/appRegistration/create in OpenAPI with valid schemas and examples', () => {
    const operation = openAPIDocument.paths?.['/admin/support/appRegistration/create']?.post;
    expect(operation).toBeDefined();
    expect(operation?.tags).toEqual([DevApiTagsMap.adminApps]);
    expect(operation?.requestBody).toBeDefined();
    expect(operation?.responses?.[200]).toBeDefined();

    const rawId = '68ad85a7463006c963799a05';
    expect(CreateAppRegistrationBodySchema.parse({ appId: rawId.toUpperCase() })).toEqual({
      appId: rawId
    });
    expect(CreateAppRegistrationBodySchema.safeParse({ appId: 'invalid-id' }).success).toBe(false);
    expect(CreateAppRegistrationResponseSchema.parse({ success: true })).toEqual({
      success: true
    });
  });
});
