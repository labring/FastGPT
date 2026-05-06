import { describe, expect, it } from 'vitest';
import { deriveCsLoginTarget } from '../src/csSession';

describe('deriveCsLoginTarget', () => {
  it('keeps base target for non-proxy paths', () => {
    expect(deriveCsLoginTarget('http://upstream:1234', '/')).toBe('http://upstream:1234');
    expect(deriveCsLoginTarget('http://upstream:1234', '/foo/bar')).toBe('http://upstream:1234');
  });

  it('maps /proxy/{port}/... paths to the same inner proxy base', () => {
    expect(deriveCsLoginTarget('http://upstream:1234', '/proxy/8080/')).toBe(
      'http://upstream:1234/proxy/8080'
    );
    expect(deriveCsLoginTarget('http://upstream:1234', '/proxy/8080/workbench?x=1')).toBe(
      'http://upstream:1234/proxy/8080'
    );
  });
});
