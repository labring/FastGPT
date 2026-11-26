import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../openapi/provider/devapi';
import { DevApiTagsMap } from '../../../../openapi/tag';

describe('track OpenAPI contracts', () => {
  it('documents the unified endpoint and omits the removed endpoint', () => {
    const unified = openAPIDocument.paths?.['/common/tracks/push']?.post;

    expect(unified?.tags).toContain(DevApiTagsMap.commonOther);
    expect(unified?.tags).toContain(DevApiTagsMap.chatHistory);
    expect(unified?.requestBody).toBeDefined();
    expect(unified?.responses?.['429']).toBeDefined();
    expect(openAPIDocument.paths?.['/core/chat/outLink/track']).toBeUndefined();
  });
});
