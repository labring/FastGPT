import { describe, expect, it } from 'vitest';
import { ModelDeprecationInformChannelEnum } from '@fastgpt/global/support/user/inform/constants';
import {
  getModelDeprecationInformChannels,
  getPlannedDateBounds,
  getUTCDateLabel,
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

describe('getUTCDateLabel', () => {
  it('keeps the selected UTC calendar day', () => {
    expect(getUTCDateLabel(new Date('2026-12-31T00:00:00.000Z'))).toBe('2026-12-31');
  });
});

describe('getPlannedDateBounds', () => {
  it('uses the same UTC day boundary regardless of browser timezone', () => {
    const { min, max } = getPlannedDateBounds(new Date('2026-11-09T23:30:00.000Z'));

    expect(getUTCDateLabel(min)).toBe('2026-11-10');
    expect(getUTCDateLabel(max)).toBe('2027-02-07');
  });
});
