import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { openAPITagGroups } from '../../../openapi/path';
import { DevApiTagsMap } from '../../../openapi/tag';

describe('reverse invoke OpenAPI contracts', () => {
  it('groups plugin and sandbox reverse invoke APIs under the dedicated section', () => {
    expect(openAPITagGroups).toContainEqual({
      name: '通用-反向调用',
      tags: [DevApiTagsMap.reverseInvokePlugin, DevApiTagsMap.reverseInvokeSandbox]
    });

    expect(openAPIDocument.paths?.['/invoke/fileUpload']?.post?.tags).toEqual([
      DevApiTagsMap.reverseInvokePlugin
    ]);
    expect(openAPIDocument.paths?.['/invoke/userInfo']?.post?.tags).toEqual([
      DevApiTagsMap.reverseInvokePlugin
    ]);
    expect(openAPIDocument.paths?.['/core/ai/sandbox/keepalive']?.post?.tags).toEqual([
      DevApiTagsMap.reverseInvokeSandbox
    ]);
    expect(openAPIDocument.paths?.['/core/ai/sandbox/verifyTicket']?.get?.tags).toEqual([
      DevApiTagsMap.reverseInvokeSandbox
    ]);
    expect(openAPIDocument.paths?.['/core/ai/sandbox/upload']?.post?.tags).toEqual([
      DevApiTagsMap.sandbox
    ]);
  });

  it('documents invoke authorization and multipart file upload fields', () => {
    const fileUpload = openAPIDocument.paths?.['/invoke/fileUpload']?.post;
    const userInfo = openAPIDocument.paths?.['/invoke/userInfo']?.post;
    const uploadSchema = fileUpload?.requestBody?.content?.['multipart/form-data']?.schema;

    expect(fileUpload?.parameters).toContainEqual(
      expect.objectContaining({ name: 'authorization', in: 'header', required: true })
    );
    expect(userInfo?.parameters).toContainEqual(
      expect.objectContaining({ name: 'authorization', in: 'header', required: true })
    );
    expect(uploadSchema).toEqual(
      expect.objectContaining({
        type: 'object',
        required: expect.arrayContaining(['file']),
        properties: expect.objectContaining({
          file: expect.objectContaining({ format: 'binary' }),
          fileName: expect.objectContaining({ type: 'string' })
        })
      })
    );
  });
});
