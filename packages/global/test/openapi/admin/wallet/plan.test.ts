import { describe, expect, it } from 'vitest';
import {
  AddPlansBodySchema,
  UpdatePlanBodySchema
} from '../../../../openapi/admin/wallet/plan/api';
import { AdminPlanPath } from '../../../../openapi/admin/wallet/plan';
import { StandardSubLevelEnum, SubTypeEnum } from '../../../../support/wallet/sub/constants';

describe('Admin plan schemas', () => {
  const basePlan = {
    startTime: '2026-01-01T00:00:00.000Z',
    expiredTime: '2027-01-01T00:00:00.000Z',
    price: 100
  };

  describe('AddPlansBodySchema', () => {
    it('validates standard plans with required level', () => {
      const valid = AddPlansBodySchema.safeParse({
        ...basePlan,
        teamId: '68ad85a7463006c963799a05',
        type: SubTypeEnum.standard,
        level: StandardSubLevelEnum.basic,
        totalPoints: 1000,
        surplusPoints: 1000
      });
      expect(valid.success).toBe(true);

      const invalid = AddPlansBodySchema.safeParse({
        ...basePlan,
        teamId: '68ad85a7463006c963799a05',
        type: SubTypeEnum.standard
      });
      expect(invalid.success).toBe(false);
    });

    it('validates extraDatasetSize plans with required capacity', () => {
      const valid = AddPlansBodySchema.safeParse({
        ...basePlan,
        teamId: '68ad85a7463006c963799a05',
        type: SubTypeEnum.extraDatasetSize,
        extraDatasetSize: 1024
      });
      expect(valid.success).toBe(true);

      const invalid = AddPlansBodySchema.safeParse({
        ...basePlan,
        teamId: '68ad85a7463006c963799a05',
        type: SubTypeEnum.extraDatasetSize
      });
      expect(invalid.success).toBe(false);
    });

    it('validates extraPoints plans with required points', () => {
      const valid = AddPlansBodySchema.safeParse({
        ...basePlan,
        teamId: '68ad85a7463006c963799a05',
        type: SubTypeEnum.extraPoints,
        totalPoints: 5000,
        surplusPoints: 5000
      });
      expect(valid.success).toBe(true);

      const invalid = AddPlansBodySchema.safeParse({
        ...basePlan,
        teamId: '68ad85a7463006c963799a05',
        type: SubTypeEnum.extraPoints
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('UpdatePlanBodySchema', () => {
    it('validates standard plan updates and preserves zero limits', () => {
      const valid = UpdatePlanBodySchema.parse({
        ...basePlan,
        id: '68ad85a7463006c963799a05',
        type: SubTypeEnum.standard,
        level: StandardSubLevelEnum.advanced,
        maxTeamMember: 0,
        websiteSyncPerDataset: 0
      });
      expect(valid.type).toBe(SubTypeEnum.standard);
      if (valid.type === SubTypeEnum.standard) {
        expect(valid.maxTeamMember).toBe(0);
        expect(valid.websiteSyncPerDataset).toBe(0);
      }

      const invalid = UpdatePlanBodySchema.safeParse({
        ...basePlan,
        id: '68ad85a7463006c963799a05',
        type: SubTypeEnum.standard
      });
      expect(invalid.success).toBe(false);
    });

    it('validates extra capacity and point updates', () => {
      const validDataset = UpdatePlanBodySchema.safeParse({
        ...basePlan,
        id: '68ad85a7463006c963799a05',
        type: SubTypeEnum.extraDatasetSize,
        extraDatasetSize: 2048
      });
      expect(validDataset.success).toBe(true);

      const validPoints = UpdatePlanBodySchema.safeParse({
        ...basePlan,
        id: '68ad85a7463006c963799a05',
        type: SubTypeEnum.extraPoints,
        totalPoints: 10000,
        surplusPoints: 8000
      });
      expect(validPoints.success).toBe(true);
    });
  });

  it('defines clean OpenAPI path responses', () => {
    expect(
      AdminPlanPath['/proApi/admin/wallet/plan/addPlans']?.post?.responses?.[200]?.content
    ).toBeUndefined();
    expect(
      AdminPlanPath['/proApi/admin/wallet/plan/updatePlan']?.post?.responses?.[200]?.content
    ).toBeUndefined();
  });
});
