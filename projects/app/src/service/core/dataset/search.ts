import type { DatasetSearchParams } from '@fastgpt/global/core/dataset/search/type';
import type { DatasetSearchProps } from '@fastgpt/service/core/dataset/search/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { search } from '@fastgpt/service/core/dataset/search/service';
import { createDatasetSearchRuntime } from '@fastgpt/service/core/dataset/search/runtime';
import type { ModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import {
  assertTeamFrequencyLimit,
  LimitTypeEnum
} from '@fastgpt/service/common/api/frequencyLimit';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';

type SearchApiAuth = DatasetSearchProps['context']['actor'] & { apikey: string };

/** API 场景适配：注入团队额度、成员计费和审计，搜索领域模块不反向依赖这些业务。 */
export const searchDatasetForApi = ({
  params,
  auth,
  modelHandle,
  usageAppName = 'Knowledge search',
  onRateLimit
}: {
  params: DatasetSearchParams;
  auth: SearchApiAuth;
  modelHandle?: ModelHandle;
  /** 旧搜索测试保留账单名称，避免迁移改变账单筛选与展示。 */
  usageAppName?: string;
  /** 仅传出限流元数据，HTTP 入口可据此写响应头，领域服务不依赖 res。 */
  onRateLimit?: (result: Awaited<ReturnType<typeof assertTeamFrequencyLimit>>) => void;
}) =>
  search({
    params,
    context: {
      actor: { teamId: auth.teamId, tmbId: auth.tmbId, isRoot: auth.isRoot },
      capabilities: { metadataFilter: Boolean(global.feConfigs.isPlus) }
    },
    deps: {
      ...createDatasetSearchRuntime({ modelHandle }),
      beforeSearch: async () => {
        const result = await assertTeamFrequencyLimit({
          teamId: auth.teamId,
          type: LimitTypeEnum.chat
        });
        onRateLimit?.(result);
        await checkTeamAIPoints(auth.teamId);
      },
      onUsage: async ({ items }) => {
        if (items.length === 0) return;
        const moduleNames = {
          embedding: i18nT('account_usage:embedding_index'),
          rerank: i18nT('account_usage:rerank'),
          queryExtension: i18nT('common:core.module.template.Query extension'),
          queryExtensionEmbedding: i18nT('account_usage:ai.query_extension_embedding'),
          imageCaption: i18nT('account_usage:image_parse')
        };
        const list = items.map((item) => ({
          moduleName: moduleNames[item.phase],
          modelId: item.model.modelId,
          inputTokens: item.inputTokens,
          outputTokens: item.outputTokens,
          amount: item.usedUserOpenAIKey ? 0 : formatModelChars2Points(item).totalPoints
        }));
        const totalPoints = list.reduce((sum, item) => sum + item.amount, 0);
        await createUsage({
          teamId: auth.teamId,
          tmbId: auth.tmbId,
          appName: usageAppName,
          source: auth.apikey ? UsageSourceEnum.api : UsageSourceEnum.fastgpt,
          list,
          totalPoints
        });
        if (auth.apikey) updateApiKeyUsage({ apikey: auth.apikey, totalPoints });
      },
      onSearched: async ({ datasets }) => {
        // 统计与审计均由入口注入；任一观测失败都不应使已计量的搜索变成失败。
        try {
          pushTrack.datasetSearch({
            teamId: auth.teamId,
            datasetIds: datasets.map((dataset) => String(dataset._id))
          });
        } catch (error) {
          getLogger(LogCategories.MODULE.DATASET.DATA).warn('Knowledge search tracking failed', {
            error
          });
        }
        // 审计失败沿用非阻断语义，不能让已执行并计量的搜索被客户端当作失败重试。
        try {
          for (const dataset of datasets) {
            await addAuditLog({
              teamId: auth.teamId,
              tmbId: auth.tmbId,
              event: AuditEventEnum.SEARCH_TEST,
              params: { datasetName: dataset.name, datasetType: getI18nDatasetType(dataset.type) }
            });
          }
        } catch (error) {
          getLogger(LogCategories.MODULE.DATASET.DATA).warn('Knowledge search audit failed', {
            error
          });
        }
      }
    }
  });
