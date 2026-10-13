import { describe, expect, it } from 'vitest';
import { resolveTestMaxWorkers } from './vitestWorkers';

describe('resolveTestMaxWorkers', () => {
  it('uses CPU - 1 in CI', () => {
    expect(resolveTestMaxWorkers({ isCI: true, cpuCount: 10 })).toBe(9);
  });

  it('uses half of the CPUs locally', () => {
    expect(resolveTestMaxWorkers({ isCI: false, cpuCount: 10 })).toBe(5);
    expect(resolveTestMaxWorkers({ isCI: false, cpuCount: 7 })).toBe(3);
  });

  it('always keeps at least one worker', () => {
    expect(resolveTestMaxWorkers({ isCI: true, cpuCount: 1 })).toBe(1);
    expect(resolveTestMaxWorkers({ isCI: false, cpuCount: 1 })).toBe(1);
    expect(resolveTestMaxWorkers({ isCI: false, cpuCount: 0 })).toBe(1);
  });

  it('prefers a valid explicit override', () => {
    expect(resolveTestMaxWorkers({ override: '8', isCI: false, cpuCount: 10 })).toBe(8);
    expect(resolveTestMaxWorkers({ override: '25%', isCI: true, cpuCount: 10 })).toBe('25%');
  });

  it('falls back to the environment default for an invalid override', () => {
    expect(resolveTestMaxWorkers({ override: 'invalid', isCI: true, cpuCount: 10 })).toBe(9);
    expect(resolveTestMaxWorkers({ override: '0', isCI: false, cpuCount: 10 })).toBe(5);
  });
});
