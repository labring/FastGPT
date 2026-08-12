import { describe, expect, it } from 'vitest';
import { StandardSubLevelEnum } from '../../../../support/wallet/sub/constants';
import type { SubPlanType } from '../../../../support/wallet/sub/type';
import { getRuntimeSubPlansConfig } from '../../../../support/wallet/sub/utils';

describe('getRuntimeSubPlansConfig', () => {
  it('returns a complete custom plan inherited from advanced without mutating source config', () => {
    const source = {
      standard: {
        [StandardSubLevelEnum.advanced]: {
          price: 599,
          totalPoints: 25000,
          maxTeamMember: 50,
          maxAppAmount: 200,
          maxDatasetAmount: 100,
          maxDatasetSize: 36000,
          chatHistoryStoreDuration: 360,
          ticketResponseTime: 24
        },
        [StandardSubLevelEnum.custom]: {
          name: 'Custom',
          customFormUrl: 'https://example.com/contact',
          maxTeamMember: 200
        }
      }
    } as SubPlanType;

    const result = getRuntimeSubPlansConfig(source);

    expect(result?.standard?.custom).toMatchObject({
      name: 'Custom',
      customFormUrl: 'https://example.com/contact',
      price: 599,
      maxTeamMember: 200,
      maxAppAmount: 200,
      ticketResponseTime: 24
    });
    expect(source.standard?.custom).toEqual({
      name: 'Custom',
      customFormUrl: 'https://example.com/contact',
      maxTeamMember: 200
    });
  });

  it('keeps source config unchanged when advanced is missing', () => {
    const source = {
      standard: {
        [StandardSubLevelEnum.custom]: { customFormUrl: 'https://example.com/contact' }
      }
    } as SubPlanType;

    expect(getRuntimeSubPlansConfig(source)).toBe(source);
  });
});
