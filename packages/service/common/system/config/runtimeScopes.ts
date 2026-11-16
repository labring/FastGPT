import { LangfuseConfigSchema } from '@fastgpt/global/common/system/types';
import {
  ProEnvConfigSchema,
  projectProEnvConfig
} from '@fastgpt/global/common/system/config/proEnv';
import { SubPlanInputSchema } from '@fastgpt/global/support/wallet/sub/type';
import { MongoSystemInstanceConfig } from '../systemInstanceConfig/schema';

/** 运行期只读取 ENV、套餐与追踪配置的独立 scope；旧 fastgpt/fastgptPro 记录仅供升级迁移读取。 */
export const readRuntimeConfigScopes = async () => {
  const [envDoc, plansDoc, tracingDoc] = await Promise.all([
    MongoSystemInstanceConfig.findOne({ domain: 'proEnv' }).lean(),
    MongoSystemInstanceConfig.findOne({ domain: 'subPlans' }).lean(),
    MongoSystemInstanceConfig.findOne({ domain: 'langfuse' }).lean()
  ]);
  const proEnv = ProEnvConfigSchema.parse(envDoc?.overrides ?? {});
  const subPlans = plansDoc ? SubPlanInputSchema.parse(plansDoc.overrides) : undefined;
  const projection = projectProEnvConfig(proEnv);
  return {
    fastgptConfig: {
      ...projection,
      systemEnv: {
        ...projection.systemEnv,
        langfuse: tracingDoc ? LangfuseConfigSchema.parse(tracingDoc.overrides) : undefined
      },
      subPlans
    },
    fastgptConfigTime: plansDoc?.revision,
    // 保留旧返回键用于缓存签名，实际用单调 revision，避免时钟不同导致更新被遮蔽。
    proEnvUpdateTime: envDoc?.revision
  };
};
