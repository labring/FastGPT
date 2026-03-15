import { describe, it, expect } from 'vitest';
import { buildStandardPlan } from '@fastgpt/service/support/wallet/sub/utils';
import {
  SubTypeEnum,
  SubModeEnum,
  StandardSubLevelEnum
} from '@fastgpt/global/support/wallet/sub/constants';
import type {
  TeamSubSchemaType,
  TeamStandardSubPlanItemType
} from '@fastgpt/global/support/wallet/sub/type';

const mockId1 = '507f1f77bcf86cd799439011';
const mockId2 = '507f1f77bcf86cd799439012';

const baseStandard: TeamSubSchemaType = {
  _id: mockId1,
  teamId: mockId2,
  type: SubTypeEnum.standard,
  startTime: new Date('2024-01-01'),
  expiredTime: new Date('2025-01-01'),
  currentMode: SubModeEnum.month,
  nextMode: SubModeEnum.month,
  currentSubLevel: StandardSubLevelEnum.basic,
  nextSubLevel: StandardSubLevelEnum.basic,
  totalPoints: 1000,
  surplusPoints: 500,
  currentExtraDatasetSize: 0
};

const baseConstants: TeamStandardSubPlanItemType = {
  price: 99,
  name: 'Basic Plan',
  desc: 'Basic description',
  totalPoints: 2000,
  maxTeamMember: 10,
  maxAppAmount: 50,
  maxDatasetAmount: 20,
  maxDatasetSize: 100,
  chatHistoryStoreDuration: 30
};

describe('buildStandardPlan', () => {
  describe('展示字段始终取自 standardConstants', () => {
    it('name/desc/price 取自 standardConstants', () => {
      const result = buildStandardPlan(baseStandard, baseConstants);
      expect(result.name).toBe('Basic Plan');
      expect(result.desc).toBe('Basic description');
      expect(result.price).toBe(99);
    });

    it('priceDescription/customFormUrl/customDescriptions 取自 standardConstants', () => {
      const constants: TeamStandardSubPlanItemType = {
        ...baseConstants,
        priceDescription: '联系销售',
        customFormUrl: 'https://example.com/form',
        customDescriptions: ['特性A', '特性B']
      };
      const result = buildStandardPlan(baseStandard, constants);
      expect(result.priceDescription).toBe('联系销售');
      expect(result.customFormUrl).toBe('https://example.com/form');
      expect(result.customDescriptions).toEqual(['特性A', '特性B']);
    });

    it('wecom 取自 standardConstants', () => {
      const constants: TeamStandardSubPlanItemType = {
        ...baseConstants,
        wecom: { price: 9.9, points: 500 }
      };
      const result = buildStandardPlan(baseStandard, constants);
      expect(result.wecom).toEqual({ price: 9.9, points: 500 });
    });

    it('standardConstants 展示字段为 undefined 时结果也为 undefined', () => {
      const result = buildStandardPlan(baseStandard, baseConstants);
      expect(result.priceDescription).toBeUndefined();
      expect(result.customFormUrl).toBeUndefined();
      expect(result.customDescriptions).toBeUndefined();
      expect(result.wecom).toBeUndefined();
    });
  });

  describe('DB 元数据从 standard spread', () => {
    it('携带 _id/teamId/type/时间/模式等字段', () => {
      const result = buildStandardPlan(baseStandard, baseConstants);
      expect(result._id).toBe(mockId1);
      expect(result.teamId).toBe(mockId2);
      expect(result.type).toBe(SubTypeEnum.standard);
      expect(result.startTime).toEqual(new Date('2024-01-01'));
      expect(result.expiredTime).toEqual(new Date('2025-01-01'));
      expect(result.currentMode).toBe(SubModeEnum.month);
      expect(result.nextMode).toBe(SubModeEnum.month);
      expect(result.currentSubLevel).toBe(StandardSubLevelEnum.basic);
      expect(result.nextSubLevel).toBe(StandardSubLevelEnum.basic);
    });

    it('totalPoints/surplusPoints/currentExtraDatasetSize 来自 standard', () => {
      const result = buildStandardPlan(baseStandard, baseConstants);
      // standard.totalPoints=1000，standardConstants.totalPoints=2000，应取 standard
      expect(result.totalPoints).toBe(1000);
      expect(result.surplusPoints).toBe(500);
      expect(result.currentExtraDatasetSize).toBe(0);
    });

    it('annualBonusPoints 来自 standard', () => {
      const standard: TeamSubSchemaType = { ...baseStandard, annualBonusPoints: 200 };
      const result = buildStandardPlan(standard, baseConstants);
      expect(result.annualBonusPoints).toBe(200);
    });
  });

  describe('限制字段：DB override 优先', () => {
    it('standard.maxTeamMember 有值时取 standard 的值', () => {
      const standard: TeamSubSchemaType = { ...baseStandard, maxTeamMember: 5 };
      const result = buildStandardPlan(standard, baseConstants);
      expect(result.maxTeamMember).toBe(5);
    });

    it('standard.maxTeamMember 为 undefined 时回退到 standardConstants', () => {
      const result = buildStandardPlan(baseStandard, baseConstants);
      expect(result.maxTeamMember).toBe(10);
    });

    it('standard.requestsPerMinute 有值时取 standard 的值', () => {
      const standard: TeamSubSchemaType = { ...baseStandard, requestsPerMinute: 60 };
      const constants: TeamStandardSubPlanItemType = { ...baseConstants, requestsPerMinute: 30 };
      const result = buildStandardPlan(standard, constants);
      expect(result.requestsPerMinute).toBe(60);
    });

    it('standard.requestsPerMinute 为 undefined 时回退到 standardConstants', () => {
      const constants: TeamStandardSubPlanItemType = { ...baseConstants, requestsPerMinute: 30 };
      const result = buildStandardPlan(baseStandard, constants);
      expect(result.requestsPerMinute).toBe(30);
    });

    it('standard.chatHistoryStoreDuration 有值时取 standard 的值', () => {
      const standard: TeamSubSchemaType = { ...baseStandard, chatHistoryStoreDuration: 90 };
      const result = buildStandardPlan(standard, baseConstants);
      expect(result.chatHistoryStoreDuration).toBe(90);
    });

    it('standard.chatHistoryStoreDuration 为 undefined 时回退到 standardConstants', () => {
      const result = buildStandardPlan(baseStandard, baseConstants);
      expect(result.chatHistoryStoreDuration).toBe(30);
    });

    it('standard.maxDatasetSize 有值时取 standard 的值', () => {
      const standard: TeamSubSchemaType = { ...baseStandard, maxDatasetSize: 200 };
      const result = buildStandardPlan(standard, baseConstants);
      expect(result.maxDatasetSize).toBe(200);
    });

    it('standard.maxDatasetSize 为 undefined 时回退到 standardConstants', () => {
      const result = buildStandardPlan(baseStandard, baseConstants);
      expect(result.maxDatasetSize).toBe(100);
    });

    it('所有可选限制字段 DB override 行为一致', () => {
      const standard: TeamSubSchemaType = {
        ...baseStandard,
        websiteSyncPerDataset: 100,
        appRegistrationCount: 5,
        auditLogStoreDuration: 180,
        ticketResponseTime: 4,
        customDomain: 3,
        maxUploadFileSize: 512,
        maxUploadFileCount: 20
      };
      const constants: TeamStandardSubPlanItemType = {
        ...baseConstants,
        websiteSyncPerDataset: 50,
        appRegistrationCount: 2,
        auditLogStoreDuration: 90,
        ticketResponseTime: 8,
        customDomain: 1,
        maxUploadFileSize: 256,
        maxUploadFileCount: 10
      };
      const result = buildStandardPlan(standard, constants);
      expect(result.websiteSyncPerDataset).toBe(100);
      expect(result.appRegistrationCount).toBe(5);
      expect(result.auditLogStoreDuration).toBe(180);
      expect(result.ticketResponseTime).toBe(4);
      expect(result.customDomain).toBe(3);
      expect(result.maxUploadFileSize).toBe(512);
      expect(result.maxUploadFileCount).toBe(20);
    });

    it('可选限制字段全部 undefined 时回退到 standardConstants', () => {
      const constants: TeamStandardSubPlanItemType = {
        ...baseConstants,
        websiteSyncPerDataset: 50,
        appRegistrationCount: 2,
        auditLogStoreDuration: 90,
        ticketResponseTime: 8,
        customDomain: 1,
        maxUploadFileSize: 256,
        maxUploadFileCount: 10
      };
      const result = buildStandardPlan(baseStandard, constants);
      expect(result.websiteSyncPerDataset).toBe(50);
      expect(result.appRegistrationCount).toBe(2);
      expect(result.auditLogStoreDuration).toBe(90);
      expect(result.ticketResponseTime).toBe(8);
      expect(result.customDomain).toBe(1);
      expect(result.maxUploadFileSize).toBe(256);
      expect(result.maxUploadFileCount).toBe(10);
    });
  });

  describe('字段名映射：maxApp → maxAppAmount，maxDataset → maxDatasetAmount', () => {
    it('standard.maxApp 映射到结果的 maxAppAmount', () => {
      const standard: TeamSubSchemaType = { ...baseStandard, maxApp: 100 };
      const result = buildStandardPlan(standard, baseConstants);
      expect(result.maxAppAmount).toBe(100);
    });

    it('standard.maxApp 为 undefined 时 maxAppAmount 回退到 standardConstants.maxAppAmount', () => {
      const result = buildStandardPlan(baseStandard, baseConstants);
      expect(result.maxAppAmount).toBe(50);
    });

    it('standard.maxDataset 映射到结果的 maxDatasetAmount', () => {
      const standard: TeamSubSchemaType = { ...baseStandard, maxDataset: 30 };
      const result = buildStandardPlan(standard, baseConstants);
      expect(result.maxDatasetAmount).toBe(30);
    });

    it('standard.maxDataset 为 undefined 时 maxDatasetAmount 回退到 standardConstants.maxDatasetAmount', () => {
      const result = buildStandardPlan(baseStandard, baseConstants);
      expect(result.maxDatasetAmount).toBe(20);
    });

    it('standard.maxApp 和 standard.maxDataset 同时有值', () => {
      const standard: TeamSubSchemaType = { ...baseStandard, maxApp: 88, maxDataset: 44 };
      const result = buildStandardPlan(standard, baseConstants);
      expect(result.maxAppAmount).toBe(88);
      expect(result.maxDatasetAmount).toBe(44);
    });
  });
});
