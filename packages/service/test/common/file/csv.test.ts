import { describe, expect, it } from 'vitest';
import { parseCsvHeader } from '@fastgpt/service/common/file/csv';

describe('parseCsvHeader', () => {
  it('keeps quoted commas and quotes within one header cell', () => {
    expect(parseCsvHeader('Time,"App, \"\"Name\"\"",Points')).toEqual([
      'Time',
      'App, "Name"',
      'Points'
    ]);
  });
});
