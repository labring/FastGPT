import { describe, it, expect } from 'vitest';
import { InputType, OutputType, tool } from '../src/index';

describe('delay tool', () => {
  it('should delay for at least the given milliseconds', async () => {
    const ms = 100;
    const start = Date.now();
    await tool({ ms });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(ms);
  });
});
