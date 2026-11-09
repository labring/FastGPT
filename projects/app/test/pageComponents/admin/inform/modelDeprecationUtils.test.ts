import { describe, expect, it } from 'vitest';
import { ModelDeprecationInformChannelEnum } from '@fastgpt/global/support/user/inform/constants';
import {
  getModelDeprecationInformChannels,
  getLocalDateLabel,
  getPlannedDateBounds,
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

describe('getModelDeprecationInformChannels', () => {
  it('expands the merged email-or-sms option into both delivery channels', () => {
    expect(
      getModelDeprecationInformChannels([ModelDeprecationInformChannelEnum.inApp, 'email_or_sms'])
    ).toEqual([
      ModelDeprecationInformChannelEnum.inApp,
      ModelDeprecationInformChannelEnum.email,
      ModelDeprecationInformChannelEnum.sms
    ]);
  });
});

describe('getLocalDateLabel', () => {
  it('keeps the selected local calendar day', () => {
    expect(getLocalDateLabel(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('getPlannedDateBounds', () => {
  it('allows tomorrow through 90 days after today', () => {
    const { min, max } = getPlannedDateBounds(new Date(2026, 10, 9, 18, 30));

    expect(getLocalDateLabel(min)).toBe('2026-11-10');
    expect(getLocalDateLabel(max)).toBe('2027-02-07');
  });
});
