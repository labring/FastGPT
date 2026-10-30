import { describe, expect, it } from 'vitest';
import { buildWorkflowCustomHeaders } from '@/pageComponents/app/detail/Edit/HTTPTools/utils';

describe('buildWorkflowCustomHeaders', () => {
  it('moves values out of customHeaders and preserves unchanged secrets', () => {
    const result = buildWorkflowCustomHeaders({
      headers: [
        { key: 'X-New', value: 'new-value', edited: true },
        { key: 'X-Legacy', value: 'legacy-value' },
        { key: 'X-Cipher', value: '', secretKey: 'X-Cipher' },
        { key: 'X-Renamed', value: '', secretKey: 'X-Old' },
        { key: 'X-Plain', value: '', secretKey: 'X-Plain' },
        { key: 'X-Cleared', value: '', secretKey: 'X-Cleared', edited: true },
        { key: 'X-Empty', value: '' },
        { key: '', value: 'ignored' }
      ],
      storedSecrets: {
        'X-Cipher': { value: '', secret: 'ciphertext' },
        'X-Old': { value: '', secret: 'renamed-ciphertext' },
        'X-Plain': { value: 'pending-plaintext', secret: '' },
        'X-Cleared': { value: '', secret: 'removed-ciphertext' }
      }
    });

    expect(JSON.parse(result.customHeaders)).toEqual({
      'X-New': '',
      'X-Legacy': '',
      'X-Cipher': '',
      'X-Renamed': '',
      'X-Plain': '',
      'X-Cleared': '',
      'X-Empty': ''
    });
    expect(result.headerSecret).toEqual({
      'X-New': { value: 'new-value', secret: '' },
      'X-Legacy': { value: 'legacy-value', secret: '' },
      'X-Cipher': { value: '', secret: 'ciphertext' },
      'X-Renamed': { value: '', secret: 'renamed-ciphertext' },
      'X-Plain': { value: 'pending-plaintext', secret: '' }
    });
  });

  it('returns empty values when no request headers exist', () => {
    expect(buildWorkflowCustomHeaders({ headers: [], storedSecrets: {} })).toEqual({
      customHeaders: '{}',
      headerSecret: {}
    });
  });

  it('does not revive a deleted secret when a header with the same key is added again', () => {
    const result = buildWorkflowCustomHeaders({
      headers: [{ key: 'X-API-Key', value: '' }],
      storedSecrets: { 'X-API-Key': { value: '', secret: 'removed-ciphertext' } }
    });

    expect(result.headerSecret).toEqual({});
  });
});
