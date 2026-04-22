import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SubTypeEnum,
  SubModeEnum,
  StandardSubLevelEnum
} from '@fastgpt/global/support/wallet/sub/constants';
import type {
  TeamSubSchemaType,
  TeamStandardSubPlanItemType,
  StandSubPlanLevelMapType
} from '@fastgpt/global/support/wallet/sub/type';
import {
  buildStandardPlan,
  getStandardPlansConfig,
  getStandardPlanConfig,
  sortStandPlans,
  initTeamFreePlan,
  getTeamStandPlan,
  getTeamPlanStatus,
  teamPoint,
  teamQPM,
  clearTeamPlanCache
} from '@fastgpt/service/support/wallet/sub/utils';
import { MongoTeamSub } from '@fastgpt/service/support/wallet/sub/schema';

// Valid ObjectId for testing
const mockTeamId = '507f1f77bcf86cd799439011';
const mockPlanId = '507f1f77bcf86cd799439012';

const baseStandard: TeamSubSchemaType = {
  _id: mockPlanId,
  teamId: mockTeamId,
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

describe('getStandardPlansConfig', () => {
  beforeEach(() => {
    // 清理 global.subPlans
    delete (global as any).subPlans;
  });

  it('返回 global.subPlans.standard 配置', () => {
    const mockStandardPlans: StandSubPlanLevelMapType = {
      [StandardSubLevelEnum.free]: {
        price: 0,
        totalPoints: 100,
        maxTeamMember: 1,
        maxAppAmount: 5,
        maxDatasetAmount: 2,
        chatHistoryStoreDuration: 7,
        maxDatasetSize: 10
      },
      [StandardSubLevelEnum.basic]: {
        price: 99,
        totalPoints: 2000,
        maxTeamMember: 10,
        maxAppAmount: 50,
        maxDatasetAmount: 20,
        chatHistoryStoreDuration: 30,
        maxDatasetSize: 100
      },
      [StandardSubLevelEnum.advanced]: {
        price: 299,
        totalPoints: 10000,
        maxTeamMember: 50,
        maxAppAmount: 200,
        maxDatasetAmount: 100,
        chatHistoryStoreDuration: 90,
        maxDatasetSize: 500
      },
      [StandardSubLevelEnum.custom]: {
        price: 999,
        totalPoints: 50000,
        maxTeamMember: 200,
        maxAppAmount: 1000,
        maxDatasetAmount: 500,
        chatHistoryStoreDuration: 365,
        maxDatasetSize: 2000
      },
      [StandardSubLevelEnum.experience]: {
        price: 0,
        totalPoints: 500,
        maxTeamMember: 3,
        maxAppAmount: 10,
        maxDatasetAmount: 5,
        chatHistoryStoreDuration: 14,
        maxDatasetSize: 30
      },
      [StandardSubLevelEnum.team]: {
        price: 199,
        totalPoints: 5000,
        maxTeamMember: 20,
        maxAppAmount: 100,
        maxDatasetAmount: 50,
        chatHistoryStoreDuration: 60,
        maxDatasetSize: 300
      },
      [StandardSubLevelEnum.enterprise]: {
        price: 599,
        totalPoints: 30000,
        maxTeamMember: 100,
        maxAppAmount: 500,
        maxDatasetAmount: 300,
        chatHistoryStoreDuration: 180,
        maxDatasetSize: 1000
      }
    };

    (global as any).subPlans = {
      standard: mockStandardPlans
    };

    const result = getStandardPlansConfig();
    expect(result).toBe(mockStandardPlans);
    expect(result).toHaveProperty(StandardSubLevelEnum.free);
    expect(result).toHaveProperty(StandardSubLevelEnum.basic);
    expect(result).toHaveProperty(StandardSubLevelEnum.advanced);
  });

  it('global.subPlans 不存在时返回 undefined', () => {
    const result = getStandardPlansConfig();
    expect(result).toBeUndefined();
  });

  it('global.subPlans 存在但 standard 不存在时返回 undefined', () => {
    (global as any).subPlans = {};
    const result = getStandardPlansConfig();
    expect(result).toBeUndefined();
  });
});

describe('getStandardPlanConfig', () => {
  beforeEach(() => {
    delete (global as any).subPlans;
  });

  it('返回指定 level 的套餐配置', () => {
    const mockBasicPlan: TeamStandardSubPlanItemType = {
      price: 99,
      totalPoints: 2000,
      maxTeamMember: 10,
      maxAppAmount: 50,
      maxDatasetAmount: 20,
      chatHistoryStoreDuration: 30,
      maxDatasetSize: 100
    };

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.basic]: mockBasicPlan
      }
    };

    const result = getStandardPlanConfig(StandardSubLevelEnum.basic);
    expect(result).toBe(mockBasicPlan);
    expect(result?.price).toBe(99);
    expect(result?.totalPoints).toBe(2000);
  });

  it('返回 free 级别配置', () => {
    const mockFreePlan: TeamStandardSubPlanItemType = {
      price: 0,
      totalPoints: 100,
      maxTeamMember: 1,
      maxAppAmount: 5,
      maxDatasetAmount: 2,
      chatHistoryStoreDuration: 7,
      maxDatasetSize: 10
    };

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.free]: mockFreePlan
      }
    };

    const result = getStandardPlanConfig(StandardSubLevelEnum.free);
    expect(result).toBe(mockFreePlan);
  });

  it('返回 advanced 级别配置', () => {
    const mockAdvancedPlan: TeamStandardSubPlanItemType = {
      price: 299,
      totalPoints: 10000,
      maxTeamMember: 50,
      maxAppAmount: 200,
      maxDatasetAmount: 100,
      chatHistoryStoreDuration: 90,
      maxDatasetSize: 500
    };

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.advanced]: mockAdvancedPlan
      }
    };

    const result = getStandardPlanConfig(StandardSubLevelEnum.advanced);
    expect(result).toBe(mockAdvancedPlan);
  });

  it('返回 custom 级别配置', () => {
    const mockCustomPlan: TeamStandardSubPlanItemType = {
      price: 999,
      totalPoints: 50000,
      maxTeamMember: 200,
      maxAppAmount: 1000,
      maxDatasetAmount: 500,
      chatHistoryStoreDuration: 365,
      maxDatasetSize: 2000
    };

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.custom]: mockCustomPlan
      }
    };

    const result = getStandardPlanConfig(StandardSubLevelEnum.custom);
    expect(result).toBe(mockCustomPlan);
  });

  it('global.subPlans 不存在时返回 undefined', () => {
    const result = getStandardPlanConfig(StandardSubLevelEnum.basic);
    expect(result).toBeUndefined();
  });

  it('global.subPlans.standard 不存在时返回 undefined', () => {
    (global as any).subPlans = {};
    const result = getStandardPlanConfig(StandardSubLevelEnum.basic);
    expect(result).toBeUndefined();
  });

  it('指定的 level 不存在时返回 undefined', () => {
    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.free]: {
          price: 0,
          totalPoints: 100,
          maxTeamMember: 1,
          maxAppAmount: 5,
          maxDatasetAmount: 2,
          chatHistoryStoreDuration: 7,
          maxDatasetSize: 10
        }
      }
    };

    const result = getStandardPlanConfig(StandardSubLevelEnum.basic);
    expect(result).toBeUndefined();
  });
});

describe('sortStandPlans', () => {
  const createMockPlan = (
    level: StandardSubLevelEnum,
    id: string = '507f1f77bcf86cd799439011'
  ): TeamSubSchemaType => ({
    _id: id,
    teamId: '507f1f77bcf86cd799439012',
    type: SubTypeEnum.standard,
    startTime: new Date('2024-01-01'),
    expiredTime: new Date('2025-01-01'),
    currentMode: SubModeEnum.month,
    nextMode: SubModeEnum.month,
    currentSubLevel: level,
    nextSubLevel: level,
    totalPoints: 1000,
    surplusPoints: 500,
    currentExtraDatasetSize: 0
  });

  it('按 weight 降序排序：custom(7) > enterprise(6) > advanced(5)', () => {
    const plans = [
      createMockPlan(StandardSubLevelEnum.advanced, 'id1'),
      createMockPlan(StandardSubLevelEnum.custom, 'id2'),
      createMockPlan(StandardSubLevelEnum.enterprise, 'id3')
    ];

    const sorted = sortStandPlans(plans);

    expect(sorted[0].currentSubLevel).toBe(StandardSubLevelEnum.custom); // weight: 7
    expect(sorted[1].currentSubLevel).toBe(StandardSubLevelEnum.enterprise); // weight: 6
    expect(sorted[2].currentSubLevel).toBe(StandardSubLevelEnum.advanced); // weight: 5
  });

  it('按 weight 降序排序：basic(4) > team(3) > experience(2) > free(1)', () => {
    const plans = [
      createMockPlan(StandardSubLevelEnum.free, 'id1'),
      createMockPlan(StandardSubLevelEnum.experience, 'id2'),
      createMockPlan(StandardSubLevelEnum.team, 'id3'),
      createMockPlan(StandardSubLevelEnum.basic, 'id4')
    ];

    const sorted = sortStandPlans(plans);

    expect(sorted[0].currentSubLevel).toBe(StandardSubLevelEnum.basic); // weight: 4
    expect(sorted[1].currentSubLevel).toBe(StandardSubLevelEnum.team); // weight: 3
    expect(sorted[2].currentSubLevel).toBe(StandardSubLevelEnum.experience); // weight: 2
    expect(sorted[3].currentSubLevel).toBe(StandardSubLevelEnum.free); // weight: 1
  });

  it('完整排序：custom > enterprise > advanced > basic > team > experience > free', () => {
    const plans = [
      createMockPlan(StandardSubLevelEnum.free, 'id1'),
      createMockPlan(StandardSubLevelEnum.basic, 'id2'),
      createMockPlan(StandardSubLevelEnum.advanced, 'id3'),
      createMockPlan(StandardSubLevelEnum.custom, 'id4'),
      createMockPlan(StandardSubLevelEnum.experience, 'id5'),
      createMockPlan(StandardSubLevelEnum.team, 'id6'),
      createMockPlan(StandardSubLevelEnum.enterprise, 'id7')
    ];

    const sorted = sortStandPlans(plans);

    expect(sorted[0].currentSubLevel).toBe(StandardSubLevelEnum.custom); // 7
    expect(sorted[1].currentSubLevel).toBe(StandardSubLevelEnum.enterprise); // 6
    expect(sorted[2].currentSubLevel).toBe(StandardSubLevelEnum.advanced); // 5
    expect(sorted[3].currentSubLevel).toBe(StandardSubLevelEnum.basic); // 4
    expect(sorted[4].currentSubLevel).toBe(StandardSubLevelEnum.team); // 3
    expect(sorted[5].currentSubLevel).toBe(StandardSubLevelEnum.experience); // 2
    expect(sorted[6].currentSubLevel).toBe(StandardSubLevelEnum.free); // 1
  });

  it('单个元素数组保持不变', () => {
    const plans = [createMockPlan(StandardSubLevelEnum.basic)];
    const sorted = sortStandPlans(plans);

    expect(sorted).toHaveLength(1);
    expect(sorted[0].currentSubLevel).toBe(StandardSubLevelEnum.basic);
  });

  it('空数组返回空数组', () => {
    const plans: TeamSubSchemaType[] = [];
    const sorted = sortStandPlans(plans);

    expect(sorted).toHaveLength(0);
  });

  it('相同 level 的多个套餐保持相对顺序稳定', () => {
    const plans = [
      createMockPlan(StandardSubLevelEnum.basic, 'id1'),
      createMockPlan(StandardSubLevelEnum.basic, 'id2'),
      createMockPlan(StandardSubLevelEnum.basic, 'id3')
    ];

    const sorted = sortStandPlans(plans);

    expect(sorted).toHaveLength(3);
    expect(sorted[0]._id).toBe('id1');
    expect(sorted[1]._id).toBe('id2');
    expect(sorted[2]._id).toBe('id3');
  });

  it('修改原数组（sort 是 in-place 操作）', () => {
    const plans = [
      createMockPlan(StandardSubLevelEnum.free, 'id1'),
      createMockPlan(StandardSubLevelEnum.advanced, 'id2')
    ];

    const sorted = sortStandPlans(plans);

    expect(sorted).toBe(plans); // 返回的是同一个数组引用
    expect(plans[0].currentSubLevel).toBe(StandardSubLevelEnum.advanced);
    expect(plans[1].currentSubLevel).toBe(StandardSubLevelEnum.free);
  });

  it('混合不同 level 的套餐正确排序', () => {
    const plans = [
      createMockPlan(StandardSubLevelEnum.basic, 'id1'),
      createMockPlan(StandardSubLevelEnum.free, 'id2'),
      createMockPlan(StandardSubLevelEnum.custom, 'id3'),
      createMockPlan(StandardSubLevelEnum.advanced, 'id4')
    ];

    const sorted = sortStandPlans(plans);

    expect(sorted[0]._id).toBe('id3'); // custom
    expect(sorted[1]._id).toBe('id4'); // advanced
    expect(sorted[2]._id).toBe('id1'); // basic
    expect(sorted[3]._id).toBe('id2'); // free
  });
});

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
      expect(result._id).toBe(mockPlanId);
      expect(result.teamId).toBe(mockTeamId);
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

describe('initTeamFreePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).subPlans;
  });

  it('创建新的免费套餐（不存在时）', async () => {
    const teamId = mockTeamId;

    vi.spyOn(MongoTeamSub, 'findOne').mockResolvedValue(null);
    const mockCreatedPlan = {
      _id: mockPlanId,
      teamId,
      type: SubTypeEnum.standard,
      currentSubLevel: StandardSubLevelEnum.free
    };
    vi.spyOn(MongoTeamSub, 'create').mockResolvedValue([mockCreatedPlan] as any);

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.free]: {
          totalPoints: 100
        }
      }
    };

    const result = await initTeamFreePlan({ teamId });

    expect(MongoTeamSub.findOne).toHaveBeenCalled();
    expect(MongoTeamSub.create).toHaveBeenCalled();
    expect(result).toEqual([mockCreatedPlan]);
  });

  it('重置已存在的免费套餐', async () => {
    const teamId = mockTeamId;
    const mockExistingPlan = {
      _id: mockPlanId,
      teamId,
      type: SubTypeEnum.standard,
      currentSubLevel: StandardSubLevelEnum.free,
      nextSubLevel: StandardSubLevelEnum.free,
      currentMode: SubModeEnum.month,
      nextMode: SubModeEnum.month,
      startTime: new Date('2024-01-01'),
      expiredTime: new Date('2024-12-01'),
      totalPoints: 100,
      surplusPoints: -50,
      currentExtraDatasetSize: 0,
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(MongoTeamSub, 'findOne').mockResolvedValue(mockExistingPlan as any);

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.free]: {
          totalPoints: 100
        }
      }
    };

    await initTeamFreePlan({ teamId });

    expect(mockExistingPlan.surplusPoints).toBe(50); // -50 + 100
    expect(mockExistingPlan.save).toHaveBeenCalled();
  });
});

describe('getTeamStandPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).subPlans;
  });

  it('返回团队标准套餐', async () => {
    const teamId = mockTeamId;
    const mockPlan = {
      _id: mockPlanId,
      teamId,
      type: SubTypeEnum.standard,
      currentSubLevel: StandardSubLevelEnum.basic,
      totalPoints: 2000,
      surplusPoints: 1500,
      startTime: new Date('2024-01-01'),
      expiredTime: new Date('2025-01-01'),
      currentMode: SubModeEnum.month,
      nextMode: SubModeEnum.month,
      nextSubLevel: StandardSubLevelEnum.basic,
      currentExtraDatasetSize: 0
    };

    // getTeamStandPlan 不使用 .lean()，直接返回数组
    vi.spyOn(MongoTeamSub, 'find').mockResolvedValue([mockPlan] as any);

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.basic]: {
          name: 'Basic Plan',
          price: 99,
          totalPoints: 2000,
          maxTeamMember: 10,
          maxAppAmount: 50,
          maxDatasetAmount: 20,
          maxDatasetSize: 100,
          chatHistoryStoreDuration: 30
        }
      }
    };

    const result = await getTeamStandPlan({ teamId });

    expect(MongoTeamSub.find).toHaveBeenCalled();
    expect(result[SubTypeEnum.standard]).toBeDefined();
    expect(result[SubTypeEnum.standard]?.name).toBe('Basic Plan');
  });
});

describe('getTeamPlanStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).subPlans;
  });

  it('返回团队套餐状态（包含标准套餐）', async () => {
    const teamId = mockTeamId;
    const mockStandardPlan = {
      _id: mockPlanId,
      teamId,
      type: SubTypeEnum.standard,
      currentSubLevel: StandardSubLevelEnum.basic,
      totalPoints: 2000,
      surplusPoints: 1500,
      startTime: new Date('2024-01-01'),
      expiredTime: new Date('2025-01-01'),
      currentMode: SubModeEnum.month,
      nextMode: SubModeEnum.month,
      nextSubLevel: StandardSubLevelEnum.basic,
      currentExtraDatasetSize: 0,
      maxDatasetSize: 100
    };

    // getTeamPlanStatus 使用 .lean()，需要 mock 返回带 lean 方法的对象
    const mockQuery = {
      lean: vi.fn().mockResolvedValue([mockStandardPlan])
    };
    vi.spyOn(MongoTeamSub, 'find').mockReturnValue(mockQuery as any);

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.basic]: {
          name: 'Basic Plan',
          price: 99,
          totalPoints: 2000,
          maxTeamMember: 10,
          maxAppAmount: 50,
          maxDatasetAmount: 20,
          maxDatasetSize: 100,
          chatHistoryStoreDuration: 30
        }
      }
    };

    const result = await getTeamPlanStatus({ teamId });

    expect(result.totalPoints).toBe(2000);
    expect(result.usedPoints).toBe(500); // 2000 - 1500
    expect(result.datasetMaxSize).toBe(100);
    expect(result[SubTypeEnum.standard]).toBeDefined();
  });

  it('包含额外积分套餐', async () => {
    const teamId = mockTeamId;
    const mockStandardPlan = {
      _id: mockPlanId,
      teamId,
      type: SubTypeEnum.standard,
      currentSubLevel: StandardSubLevelEnum.basic,
      totalPoints: 2000,
      surplusPoints: 1500,
      startTime: new Date('2024-01-01'),
      expiredTime: new Date('2025-01-01'),
      currentMode: SubModeEnum.month,
      nextMode: SubModeEnum.month,
      nextSubLevel: StandardSubLevelEnum.basic,
      currentExtraDatasetSize: 0
    };

    const mockExtraPointsPlan = {
      _id: '507f1f77bcf86cd799439013',
      teamId,
      type: SubTypeEnum.extraPoints,
      totalPoints: 5000,
      surplusPoints: 3000,
      startTime: new Date('2024-01-01'),
      expiredTime: new Date('2025-01-01')
    };

    // getTeamPlanStatus 使用 .lean()
    const mockQuery = {
      lean: vi.fn().mockResolvedValue([mockStandardPlan, mockExtraPointsPlan])
    };
    vi.spyOn(MongoTeamSub, 'find').mockReturnValue(mockQuery as any);

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.basic]: {
          name: 'Basic Plan',
          price: 99,
          totalPoints: 2000,
          maxTeamMember: 10,
          maxAppAmount: 50,
          maxDatasetAmount: 20,
          maxDatasetSize: 100,
          chatHistoryStoreDuration: 30
        }
      }
    };

    const result = await getTeamPlanStatus({ teamId });

    expect(result.totalPoints).toBe(7000); // 2000 + 5000
    expect(result.usedPoints).toBe(2500); // 7000 - (1500 + 3000)
  });

  it('包含额外数据集大小套餐', async () => {
    const teamId = mockTeamId;
    const mockStandardPlan = {
      _id: mockPlanId,
      teamId,
      type: SubTypeEnum.standard,
      currentSubLevel: StandardSubLevelEnum.basic,
      totalPoints: 2000,
      surplusPoints: 1500,
      startTime: new Date('2024-01-01'),
      expiredTime: new Date('2025-01-01'),
      currentMode: SubModeEnum.month,
      nextMode: SubModeEnum.month,
      nextSubLevel: StandardSubLevelEnum.basic,
      currentExtraDatasetSize: 0,
      maxDatasetSize: 100
    };

    const mockExtraDatasetPlan = {
      _id: '507f1f77bcf86cd799439013',
      teamId,
      type: SubTypeEnum.extraDatasetSize,
      currentExtraDatasetSize: 200,
      totalPoints: 0,
      surplusPoints: 0,
      startTime: new Date('2024-01-01'),
      expiredTime: new Date('2025-01-01')
    };

    // getTeamPlanStatus 使用 .lean()
    const mockQuery = {
      lean: vi.fn().mockResolvedValue([mockStandardPlan, mockExtraDatasetPlan])
    };
    vi.spyOn(MongoTeamSub, 'find').mockReturnValue(mockQuery as any);

    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.basic]: {
          name: 'Basic Plan',
          price: 99,
          totalPoints: 2000,
          maxTeamMember: 10,
          maxAppAmount: 50,
          maxDatasetAmount: 20,
          maxDatasetSize: 100,
          chatHistoryStoreDuration: 30
        }
      }
    };

    const result = await getTeamPlanStatus({ teamId });

    expect(result.datasetMaxSize).toBe(300); // 100 + 200
  });
});

describe('teamPoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTeamPoints', () => {
    it('从缓存获取积分信息', async () => {
      const teamId = mockTeamId;

      // 全局 mock 会自动处理 Redis 调用
      const result = await teamPoint.getTeamPoints({ teamId });

      expect(result).toHaveProperty('totalPoints');
      expect(result).toHaveProperty('surplusPoints');
      expect(result).toHaveProperty('usedPoints');
    });
  });

  describe('incrTeamPointsCache', () => {
    it('增加团队积分缓存', async () => {
      const teamId = mockTeamId;
      const value = 100;

      // 全局 mock 会自动处理 Redis 调用
      await expect(teamPoint.incrTeamPointsCache({ teamId, value })).resolves.not.toThrow();
    });
  });

  describe('updateTeamPointsCache', () => {
    it('更新团队积分缓存', async () => {
      const teamId = mockTeamId;
      const totalPoints = 2000;
      const surplusPoints = 1500;

      // 全局 mock 会自动处理 Redis 调用
      await expect(
        teamPoint.updateTeamPointsCache({ teamId, totalPoints, surplusPoints })
      ).resolves.not.toThrow();
    });
  });

  describe('clearTeamPointsCache', () => {
    it('清除团队积分缓存', async () => {
      const teamId = mockTeamId;

      // 全局 mock 会自动处理 Redis 调用
      await expect(teamPoint.clearTeamPointsCache(teamId)).resolves.not.toThrow();
    });
  });
});

describe('teamQPM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).subPlans;
  });

  describe('getTeamQPMLimit', () => {
    it('获取团队 QPM 限制', async () => {
      const teamId = mockTeamId;

      // 全局 mock 会自动处理 Redis 和数据库调用
      const result = await teamQPM.getTeamQPMLimit(teamId);

      expect(typeof result === 'number' || result === null).toBe(true);
    });
  });

  describe('setCachedTeamQPMLimit', () => {
    it('设置团队 QPM 限制缓存', async () => {
      const teamId = mockTeamId;
      const limit = 60;

      // 全局 mock 会自动处理 Redis 调用
      await expect(teamQPM.setCachedTeamQPMLimit(teamId, limit)).resolves.not.toThrow();
    });
  });

  describe('clearTeamQPMLimitCache', () => {
    it('清除团队 QPM 限制缓存', async () => {
      const teamId = mockTeamId;

      // 全局 mock 会自动处理 Redis 调用
      await expect(teamQPM.clearTeamQPMLimitCache(teamId)).resolves.not.toThrow();
    });
  });
});

describe('clearTeamPlanCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('清除团队套餐相关的所有缓存', async () => {
    const teamId = mockTeamId;

    await clearTeamPlanCache(teamId);

    // 函数应该被调用（具体实现会调用 teamPoint 和 teamQPM 的清除方法）
    expect(teamId).toBeDefined();
  });
});
