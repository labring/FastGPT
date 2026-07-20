/** Sandbox source 存活校验，作为 provisioning 与删除之间的持久 fence。 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoApp } from '../../../app/schema';
import { MongoAgentSkills } from '../../skill/model/schema';
import type { ClientSession } from '../../../../common/mongo';

/** source 不存在或已经设置 deleteTime 时禁止创建、恢复或迁移 Sandbox。 */
export async function assertSandboxSourceActive(params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  session?: ClientSession;
}) {
  const active = await (async () => {
    if (params.sourceType === ChatSourceTypeEnum.app) {
      return MongoApp.exists({ _id: params.sourceId, deleteTime: null }).session(
        params.session ?? null
      );
    }
    if (params.sourceType === ChatSourceTypeEnum.skillEdit) {
      return MongoAgentSkills.exists({ _id: params.sourceId, deleteTime: null }).session(
        params.session ?? null
      );
    }
    return null;
  })();

  if (!active) {
    throw new Error(
      `Sandbox source is missing or deleted: ${params.sourceType}/${params.sourceId}`
    );
  }
}

/** Source 删除任务只能清理已经由主业务事务标记为删除的资源。 */
export async function assertSandboxSourceDeleted(params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
}) {
  const deleted = await (async () => {
    if (params.sourceType === ChatSourceTypeEnum.app) {
      return MongoApp.exists({ _id: params.sourceId, deleteTime: { $ne: null } });
    }
    if (params.sourceType === ChatSourceTypeEnum.skillEdit) {
      return MongoAgentSkills.exists({ _id: params.sourceId, deleteTime: { $ne: null } });
    }
    return null;
  })();

  if (!deleted) {
    throw new Error(
      `Sandbox source is not marked for deletion: ${params.sourceType}/${params.sourceId}`
    );
  }
}
