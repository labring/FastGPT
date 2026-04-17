import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkTeamAIPoints,
  checkTeamMemberLimit,
  checkTeamAppTypeLimit,
  checkTeamDatasetFolderLimit,
  checkDatasetIndexLimit,
  checkTeamDatasetLimit,
  checkTeamDatasetSyncPermission
} from '@fastgpt/service/support/permission/teamLimit';
import * as walletUtils from '@fastgpt/service/support/wallet/sub/utils';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import * as vectorController from '@fastgpt/service/common/vectorDB/controller';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';

// Valid ObjectId for testing
const mockTeamId = '507f1f77bcf86cd799439011';

describe('checkTeamAIPoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).subPlans;
  });

  it('当 global.subPlans.standard 不存在时直接返回', async () => {
    const result = await checkTeamAIPoints(mockTeamId);
    expect(result).toBeUndefined();
  });

  it('当积分充足时返回积分信息', async () => {
    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.basic]: {
          totalPoints: 2000
        }
      }
    };

    vi.spyOn(walletUtils.teamPoint, 'getTeamPoints').mockResolvedValue({
      totalPoints: 2000,
      surplusPoints: 1500,
      usedPoints: 500
    });

    const result = await checkTeamAIPoints(mockTeamId);

    expect(result).toEqual({
      totalPoints: 2000,
      usedPoints: 500
    });
  });

  it('当积分不足时抛出错误', async () => {
    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.basic]: {
          totalPoints: 2000
        }
      }
    };

    vi.spyOn(walletUtils.teamPoint, 'getTeamPoints').mockResolvedValue({
      totalPoints: 2000,
      surplusPoints: 0,
      usedPoints: 2000
    });

    await expect(checkTeamAIPoints(mockTeamId)).rejects.toBe(TeamErrEnum.aiPointsNotEnough);
  });

  it('当已用积分等于总积分时抛出错误', async () => {
    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.basic]: {
          totalPoints: 1000
        }
      }
    };

    vi.spyOn(walletUtils.teamPoint, 'getTeamPoints').mockResolvedValue({
      totalPoints: 1000,
      surplusPoints: 0,
      usedPoints: 1000
    });

    await expect(checkTeamAIPoints(mockTeamId)).rejects.toBe(TeamErrEnum.aiPointsNotEnough);
  });

  it('当已用积分超过总积分时抛出错误', async () => {
    (global as any).subPlans = {
      standard: {
        [StandardSubLevelEnum.basic]: {
          totalPoints: 1000
        }
      }
    };

    vi.spyOn(walletUtils.teamPoint, 'getTeamPoints').mockResolvedValue({
      totalPoints: 1000,
      surplusPoints: -100,
      usedPoints: 1100
    });

    await expect(checkTeamAIPoints(mockTeamId)).rejects.toBe(TeamErrEnum.aiPointsNotEnough);
  });
});

describe('checkTeamMemberLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('当团队成员数量未超限时正常通过', async () => {
    vi.spyOn(MongoTeamMember, 'countDocuments').mockResolvedValue(5);

    const mockStandard = {
      standard: {
        maxTeamMember: 10
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamMemberLimit(mockTeamId, 3)).resolves.toBeUndefined();
  });

  it('当新增成员后超过限制时抛出错误', async () => {
    vi.spyOn(MongoTeamMember, 'countDocuments').mockResolvedValue(8);

    const mockStandard = {
      standard: {
        maxTeamMember: 10
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamMemberLimit(mockTeamId, 3)).rejects.toBe(TeamErrEnum.teamOverSize);
  });

  it('当新增成员后刚好达到限制时正常通过', async () => {
    vi.spyOn(MongoTeamMember, 'countDocuments').mockResolvedValue(8);

    const mockStandard = {
      standard: {
        maxTeamMember: 10
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamMemberLimit(mockTeamId, 2)).resolves.toBeUndefined();
  });

  it('当 maxTeamMember 未设置时不限制', async () => {
    vi.spyOn(MongoTeamMember, 'countDocuments').mockResolvedValue(100);

    const mockStandard = {
      standard: {}
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamMemberLimit(mockTeamId, 50)).resolves.toBeUndefined();
  });

  it('查询时排除已离开的成员', async () => {
    const countSpy = vi.spyOn(MongoTeamMember, 'countDocuments').mockResolvedValue(5);

    const mockStandard = {
      standard: {
        maxTeamMember: 10
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await checkTeamMemberLimit(mockTeamId, 2);

    expect(countSpy).toHaveBeenCalledWith({
      teamId: mockTeamId,
      status: { $ne: TeamMemberStatusEnum.leave }
    });
  });
});

describe('checkTeamAppTypeLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).licenseData;
  });

  describe('app 类型检查', () => {
    it('当应用数量未超限时正常通过', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(30);

      const mockStandard = {
        standard: {
          maxAppAmount: 50
        }
      };
      vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'app',
          amount: 10
        })
      ).resolves.toBeUndefined();
    });

    it('当应用数量超限时抛出错误', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(45);

      const mockStandard = {
        standard: {
          maxAppAmount: 50
        }
      };
      vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'app',
          amount: 10
        })
      ).rejects.toBe(TeamErrEnum.appAmountNotEnough);
    });

    it('当 maxAppAmount 未设置时不限制', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(100);

      const mockStandard = {
        standard: {}
      };
      vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'app',
          amount: 50
        })
      ).resolves.toBeUndefined();
    });

    it('默认 amount 为 1', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(49);

      const mockStandard = {
        standard: {
          maxAppAmount: 50
        }
      };
      vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'app'
        })
      ).resolves.toBeUndefined();
    });

    it('查询时只统计 chatAgent/simple/workflow 类型', async () => {
      const countSpy = vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(30);

      const mockStandard = {
        standard: {
          maxAppAmount: 50
        }
      };
      vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

      await checkTeamAppTypeLimit({
        teamId: mockTeamId,
        appCheckType: 'app'
      });

      expect(countSpy).toHaveBeenCalledWith({
        teamId: mockTeamId,
        type: {
          $in: [AppTypeEnum.chatAgent, AppTypeEnum.simple, AppTypeEnum.workflow]
        }
      });
    });

    it('当系统许可证限制存在且超限时抛出系统错误', async () => {
      vi.spyOn(MongoApp, 'countDocuments')
        .mockResolvedValueOnce(30) // 团队应用数
        .mockResolvedValueOnce(150); // 系统总应用数

      const mockStandard = {
        standard: {
          maxAppAmount: 50
        }
      };
      vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

      (global as any).licenseData = {
        maxApps: 100
      };

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'app'
        })
      ).rejects.toBe(SystemErrEnum.licenseAppAmountLimit);
    });

    it('当系统许可证限制存在但未超限时正常通过', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValueOnce(30).mockResolvedValueOnce(80);

      const mockStandard = {
        standard: {
          maxAppAmount: 50
        }
      };
      vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

      (global as any).licenseData = {
        maxApps: 100
      };

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'app'
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('tool 类型检查', () => {
    it('当工具数量未超限时正常通过', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(500);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'tool',
          amount: 100
        })
      ).resolves.toBeUndefined();
    });

    it('当工具数量超过 1000 时抛出错误', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(950);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'tool',
          amount: 100
        })
      ).rejects.toBe(TeamErrEnum.pluginAmountNotEnough);
    });

    it('当工具数量刚好达到 1000 时正常通过', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(999);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'tool',
          amount: 1
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('folder 类型检查', () => {
    it('当文件夹数量未超限时正常通过', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(500);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'folder',
          amount: 100
        })
      ).resolves.toBeUndefined();
    });

    it('当文件夹数量超过 1000 时抛出错误', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(950);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'folder',
          amount: 100
        })
      ).rejects.toBe(TeamErrEnum.appFolderAmountNotEnough);
    });

    it('当文件夹数量刚好达到 1000 时正常通过', async () => {
      vi.spyOn(MongoApp, 'countDocuments').mockResolvedValue(999);

      await expect(
        checkTeamAppTypeLimit({
          teamId: mockTeamId,
          appCheckType: 'folder',
          amount: 1
        })
      ).resolves.toBeUndefined();
    });
  });
});

describe('checkTeamDatasetFolderLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('当知识库文件夹数量未超限时正常通过', async () => {
    vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValue(500);

    await expect(
      checkTeamDatasetFolderLimit({
        teamId: mockTeamId,
        amount: 100
      })
    ).resolves.toBeUndefined();
  });

  it('当知识库文件夹数量超过上限时抛出错误', async () => {
    vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValue(950);

    await expect(
      checkTeamDatasetFolderLimit({
        teamId: mockTeamId,
        amount: 100
      })
    ).rejects.toBe(TeamErrEnum.datasetFolderAmountNotEnough);
  });

  it('当知识库文件夹数量刚好达到上限时正常通过', async () => {
    vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValue(999);

    await expect(
      checkTeamDatasetFolderLimit({
        teamId: mockTeamId,
        amount: 1
      })
    ).resolves.toBeUndefined();
  });

  it('查询时只统计知识库 folder 类型', async () => {
    const countSpy = vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValue(0);

    await checkTeamDatasetFolderLimit({
      teamId: mockTeamId
    });

    expect(countSpy).toHaveBeenCalledWith({
      teamId: mockTeamId,
      type: DatasetTypeEnum.folder
    });
  });
});

describe('checkDatasetIndexLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('当 standard 不存在时直接返回', async () => {
    const mockPlanStatus = {
      standard: undefined,
      totalPoints: 1000,
      usedPoints: 500,
      datasetMaxSize: 10000
    };
    vi.spyOn(walletUtils, 'getTeamPlanStatus').mockResolvedValue(mockPlanStatus as any);
    vi.spyOn(vectorController, 'getVectorCountByTeamId').mockResolvedValue(5000);

    await expect(
      checkDatasetIndexLimit({
        teamId: mockTeamId,
        insertLen: 100
      })
    ).resolves.toBeUndefined();
  });

  it('当数据集大小未超限时正常通过', async () => {
    const mockPlanStatus = {
      standard: {
        maxDatasetSize: 10000
      },
      totalPoints: 2000,
      usedPoints: 500,
      datasetMaxSize: 10000
    };
    vi.spyOn(walletUtils, 'getTeamPlanStatus').mockResolvedValue(mockPlanStatus as any);
    vi.spyOn(vectorController, 'getVectorCountByTeamId').mockResolvedValue(5000);

    await expect(
      checkDatasetIndexLimit({
        teamId: mockTeamId,
        insertLen: 1000
      })
    ).resolves.toBeUndefined();
  });

  it('当数据集大小超限时抛出错误', async () => {
    const mockPlanStatus = {
      standard: {
        maxDatasetSize: 10000
      },
      totalPoints: 2000,
      usedPoints: 500,
      datasetMaxSize: 10000
    };
    vi.spyOn(walletUtils, 'getTeamPlanStatus').mockResolvedValue(mockPlanStatus as any);
    vi.spyOn(vectorController, 'getVectorCountByTeamId').mockResolvedValue(9500);

    await expect(
      checkDatasetIndexLimit({
        teamId: mockTeamId,
        insertLen: 1000
      })
    ).rejects.toBe(TeamErrEnum.datasetSizeNotEnough);
  });

  it('当数据集大小刚好达到限制时抛出错误', async () => {
    const mockPlanStatus = {
      standard: {
        maxDatasetSize: 10000
      },
      totalPoints: 2000,
      usedPoints: 500,
      datasetMaxSize: 10000
    };
    vi.spyOn(walletUtils, 'getTeamPlanStatus').mockResolvedValue(mockPlanStatus as any);
    vi.spyOn(vectorController, 'getVectorCountByTeamId').mockResolvedValue(9000);

    await expect(
      checkDatasetIndexLimit({
        teamId: mockTeamId,
        insertLen: 1000
      })
    ).rejects.toBe(TeamErrEnum.datasetSizeNotEnough);
  });

  it('当积分不足时抛出错误', async () => {
    const mockPlanStatus = {
      standard: {
        maxDatasetSize: 10000
      },
      totalPoints: 2000,
      usedPoints: 2000,
      datasetMaxSize: 10000
    };
    vi.spyOn(walletUtils, 'getTeamPlanStatus').mockResolvedValue(mockPlanStatus as any);
    vi.spyOn(vectorController, 'getVectorCountByTeamId').mockResolvedValue(5000);

    await expect(
      checkDatasetIndexLimit({
        teamId: mockTeamId,
        insertLen: 100
      })
    ).rejects.toBe(TeamErrEnum.aiPointsNotEnough);
  });

  it('当积分超支时抛出错误', async () => {
    const mockPlanStatus = {
      standard: {
        maxDatasetSize: 10000
      },
      totalPoints: 2000,
      usedPoints: 2500,
      datasetMaxSize: 10000
    };
    vi.spyOn(walletUtils, 'getTeamPlanStatus').mockResolvedValue(mockPlanStatus as any);
    vi.spyOn(vectorController, 'getVectorCountByTeamId').mockResolvedValue(5000);

    await expect(
      checkDatasetIndexLimit({
        teamId: mockTeamId,
        insertLen: 100
      })
    ).rejects.toBe(TeamErrEnum.aiPointsNotEnough);
  });

  it('默认 insertLen 为 0', async () => {
    const mockPlanStatus = {
      standard: {
        maxDatasetSize: 10000
      },
      totalPoints: 2000,
      usedPoints: 500,
      datasetMaxSize: 10000
    };
    vi.spyOn(walletUtils, 'getTeamPlanStatus').mockResolvedValue(mockPlanStatus as any);
    vi.spyOn(vectorController, 'getVectorCountByTeamId').mockResolvedValue(5000);

    await expect(
      checkDatasetIndexLimit({
        teamId: mockTeamId
      })
    ).resolves.toBeUndefined();
  });

  it('数据集大小检查优先于积分检查', async () => {
    const mockPlanStatus = {
      standard: {
        maxDatasetSize: 10000
      },
      totalPoints: 2000,
      usedPoints: 2000,
      datasetMaxSize: 10000
    };
    vi.spyOn(walletUtils, 'getTeamPlanStatus').mockResolvedValue(mockPlanStatus as any);
    vi.spyOn(vectorController, 'getVectorCountByTeamId').mockResolvedValue(9500);

    await expect(
      checkDatasetIndexLimit({
        teamId: mockTeamId,
        insertLen: 1000
      })
    ).rejects.toBe(TeamErrEnum.datasetSizeNotEnough);
  });
});

describe('checkTeamDatasetLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).licenseData;
  });

  it('当数据集数量未超限时正常通过', async () => {
    vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValue(10);

    const mockStandard = {
      standard: {
        maxDatasetAmount: 20
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamDatasetLimit(mockTeamId)).resolves.toBeUndefined();
  });

  it('当数据集数量超限时抛出错误', async () => {
    vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValue(20);

    const mockStandard = {
      standard: {
        maxDatasetAmount: 20
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamDatasetLimit(mockTeamId)).rejects.toBe(
      TeamErrEnum.datasetAmountNotEnough
    );
  });

  it('当数据集数量刚好达到限制时抛出错误', async () => {
    vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValue(20);

    const mockStandard = {
      standard: {
        maxDatasetAmount: 20
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamDatasetLimit(mockTeamId)).rejects.toBe(
      TeamErrEnum.datasetAmountNotEnough
    );
  });

  it('当 maxDatasetAmount 未设置时不限制', async () => {
    vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValue(100);

    const mockStandard = {
      standard: {}
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamDatasetLimit(mockTeamId)).resolves.toBeUndefined();
  });

  it('查询时排除文件夹类型', async () => {
    const countSpy = vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValue(10);

    const mockStandard = {
      standard: {
        maxDatasetAmount: 20
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await checkTeamDatasetLimit(mockTeamId);

    expect(countSpy).toHaveBeenCalledWith({
      teamId: mockTeamId,
      type: { $ne: DatasetTypeEnum.folder }
    });
  });

  it('当系统许可证限制存在且超限时抛出系统错误', async () => {
    vi.spyOn(MongoDataset, 'countDocuments')
      .mockResolvedValueOnce(10) // 团队数据集数
      .mockResolvedValueOnce(150); // 系统总数据集数

    const mockStandard = {
      standard: {
        maxDatasetAmount: 20
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    (global as any).licenseData = {
      maxDatasets: 100
    };

    await expect(checkTeamDatasetLimit(mockTeamId)).rejects.toBe(
      SystemErrEnum.licenseDatasetAmountLimit
    );
  });

  it('当系统许可证限制存在但未超限时正常通过', async () => {
    vi.spyOn(MongoDataset, 'countDocuments').mockResolvedValueOnce(10).mockResolvedValueOnce(80);

    const mockStandard = {
      standard: {
        maxDatasetAmount: 20
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    (global as any).licenseData = {
      maxDatasets: 100
    };

    await expect(checkTeamDatasetLimit(mockTeamId)).resolves.toBeUndefined();
  });

  it('系统许可证限制检查也排除文件夹类型', async () => {
    const countSpy = vi
      .spyOn(MongoDataset, 'countDocuments')
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(80);

    const mockStandard = {
      standard: {
        maxDatasetAmount: 20
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    (global as any).licenseData = {
      maxDatasets: 100
    };

    await checkTeamDatasetLimit(mockTeamId);

    expect(countSpy).toHaveBeenNthCalledWith(2, {
      type: { $ne: DatasetTypeEnum.folder }
    });
  });
});

describe('checkTeamDatasetSyncPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('当套餐支持网站同步时正常通过', async () => {
    const mockStandard = {
      standard: {
        websiteSyncPerDataset: 100
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamDatasetSyncPermission(mockTeamId)).resolves.toBeUndefined();
  });

  it('当套餐不支持网站同步时抛出错误', async () => {
    const mockStandard = {
      standard: {
        websiteSyncPerDataset: undefined
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamDatasetSyncPermission(mockTeamId)).rejects.toBe(
      TeamErrEnum.websiteSyncNotEnough
    );
  });

  it('当 websiteSyncPerDataset 为 0 时抛出错误', async () => {
    const mockStandard = {
      standard: {
        websiteSyncPerDataset: 0
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamDatasetSyncPermission(mockTeamId)).rejects.toBe(
      TeamErrEnum.websiteSyncNotEnough
    );
  });

  it('当 standard 不存在时不抛出错误', async () => {
    const mockStandard = {
      standard: undefined
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamDatasetSyncPermission(mockTeamId)).resolves.toBeUndefined();
  });

  it('当 websiteSyncPerDataset 为正数时正常通过', async () => {
    const mockStandard = {
      standard: {
        websiteSyncPerDataset: 50
      }
    };
    vi.spyOn(walletUtils, 'getTeamStandPlan').mockResolvedValue(mockStandard as any);

    await expect(checkTeamDatasetSyncPermission(mockTeamId)).resolves.toBeUndefined();
  });
});
