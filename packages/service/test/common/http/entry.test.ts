import { describe, expect, it } from 'vitest';
import { redactRequestUrl } from '@fastgpt/service/common/http/entry';

describe('redactRequestUrl', () => {
  it('redacts every declared query value while preserving non-sensitive parameters', () => {
    const secretTicket = 'secret-download-ticket';
    const url = `/api/core/dataset/collection/batchDownload?ticket=${secretTicket}&source=web&ticket=second-secret`;

    const redactedUrl = redactRequestUrl(url, ['ticket']);

    expect(redactedUrl).not.toContain(secretTicket);
    expect(redactedUrl).not.toContain('second-secret');
    expect(redactedUrl).toContain('ticket=REDACTED');
    expect(redactedUrl).toContain('source=web');
  });

  it('returns URLs unchanged when no sensitive query value is present', () => {
    expect(redactRequestUrl('/api/health?source=web', ['ticket'])).toBe('/api/health?source=web');
  });
});
