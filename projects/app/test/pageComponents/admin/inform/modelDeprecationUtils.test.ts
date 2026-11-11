import { describe, expect, it } from 'vitest';
import { ModelDeprecationInformChannelEnum } from '@fastgpt/global/support/user/inform/constants';
import {
  getModelDeprecationInformChannels,
  getPlannedDateBounds,
  getPlannedDeprecationAt,
  getModelDeprecationNotificationTime,
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

describe('getPlannedDeprecationAt', () => {
  it('uses the selected browser calendar day at 23:59 with an explicit offset', () => {
    const value = getPlannedDeprecationAt(new Date(2026, 11, 31));
    expect(value).toMatch(/^2026-12-31T23:59:00[+-]\d{2}:\d{2}$/);
    expect(new Date(value)).toEqual(new Date(2026, 11, 31, 23, 59));
  });
});

describe('getModelDeprecationNotificationTime', () => {
  it('keeps the browser clock time and offset without changing the instant', () => {
    const now = new Date(2026, 10, 10, 14, 15, 16);
    const value = getModelDeprecationNotificationTime(now);
    expect(value).toMatch(/^2026-11-10T14:15:16[+-]\d{2}:\d{2}$/);
    expect(new Date(value)).toEqual(now);
  });
});

describe('getPlannedDateBounds', () => {
  it('uses browser calendar dates for tomorrow and the inclusive 90-day bound', () => {
    const { min, max } = getPlannedDateBounds(new Date(2026, 10, 9, 23, 30));
    expect(min).toEqual(new Date(2026, 10, 10));
    expect(max).toEqual(new Date(2027, 1, 7));
  });
});
