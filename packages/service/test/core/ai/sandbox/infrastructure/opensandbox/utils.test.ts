import { describe, expect, it } from 'vitest';
import { BoundedOutputBuffer } from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox';

describe('opensandbox utils', () => {
  describe('BoundedOutputBuffer', () => {
    it('retains all output below the limit and drops oldest chunks when exceeding', () => {
      const buf = new BoundedOutputBuffer(10);
      buf.append('aaaaa');
      buf.append('bbbbb');
      expect(buf.toString()).toBe('aaaaabbbbb');
      expect(buf.truncated).toBe(false);

      buf.append('ccccc');
      expect(buf.toString()).toBe('bbbbbccccc');
      expect(buf.truncated).toBe(true);
    });

    it('supports separator and strips leading separator after truncation', () => {
      const buf = new BoundedOutputBuffer(4, '\n');
      buf.append('a');
      buf.append('b');
      buf.append('c');
      expect(buf.toString()).toBe('b\nc');
      expect(buf.truncated).toBe(true);
    });
  });
});
