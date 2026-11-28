import { describe, expect, it } from 'vitest';
import FormData from 'form-data';
import { Readable } from 'node:stream';
import {
  encodeHttpFormData,
  HTTP_MULTIPART_MAX_BYTES
} from '@fastgpt/service/core/workflow/dispatch/tools/httpFormData';
import { UserConfigError } from '@fastgpt/global/common/error/utils';

/** 实际编码字节计量，复用固定块以验证预算而不物化整个附件。 */
describe('HTTP multipart encoded budget', () => {
  it('includes multipart headers and boundaries in the hard limit', async () => {
    const form = new FormData();
    const block = Buffer.alloc(1024 * 1024);
    const input = Readable.from(
      (async function* () {
        for (let size = 0; size < HTTP_MULTIPART_MAX_BYTES; size += block.length) yield block;
      })()
    );
    form.append('file', input, { filename: 'file.bin' });
    const encoded = encodeHttpFormData(form);
    let delivered = 0;
    try {
      await expect(
        (async () => {
          for await (const chunk of encoded) delivered += chunk.length;
        })()
      ).rejects.toBeInstanceOf(UserConfigError);
      expect(delivered).toBeLessThanOrEqual(HTTP_MULTIPART_MAX_BYTES);
    } finally {
      encoded.destroy();
      form.destroy();
      input.destroy();
    }
  });
});
