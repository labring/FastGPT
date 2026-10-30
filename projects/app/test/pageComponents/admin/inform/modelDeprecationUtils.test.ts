import { describe, expect, it } from 'vitest';
import {
  getLocalDateLabel,
  getPlannedDeprecationDateLabel,
  getSelectableDeprecationModels
} from '@/pageComponents/admin/inform/modelDeprecationUtils';

const models = [
  { modelId: 'model-a', isActive: true, isUpcomingDeprecation: true },
  { modelId: 'model-b', isActive: true, isUpcomingDeprecation: false },
  { modelId: 'model-c' },
  { modelId: 'model-d', isActive: false, isUpcomingDeprecation: true }
];

describe('getSelectableDeprecationModels', () => {
  it('returns only active models marked as upcoming deprecation', () => {
    expect(getSelectableDeprecationModels(models).map(({ modelId }) => modelId)).toEqual([
      'model-a'
    ]);
  });
});

describe('getLocalDateLabel', () => {
  it('keeps the selected local calendar day', () => {
    expect(getLocalDateLabel(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('getPlannedDeprecationDateLabel', () => {
  it('shows the server-normalized calendar day returned by the API', () => {
    expect(getPlannedDeprecationDateLabel('2026-12-31T00:00:00.000Z')).toBe('2026-12-31');
  });
});
