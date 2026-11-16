import { describe, expect, it } from 'vitest';
import { getDebugPanelWidth } from '@/pageComponents/app/detail/WorkflowComponents/Flow/debugPanelWidth';

describe('调试面板宽度', () => {
  it('以热区左沿计算上限，并在左侧面板打开时收缩', () => {
    const base = { minWidth: 460, viewportWidth: 1440 };
    expect(getDebugPanelWidth({ ...base, width: 100, leftBoundary: 100 })).toBe(460);
    expect(getDebugPanelWidth({ ...base, width: 1200, leftBoundary: 100 })).toBe(1200);
    expect(getDebugPanelWidth({ ...base, width: 1200, leftBoundary: 476 })).toBe(948);
    expect(getDebugPanelWidth({ ...base, width: 1200, leftBoundary: 1100 })).toBe(324);
  });
});
