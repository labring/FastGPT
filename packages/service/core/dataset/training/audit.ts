import { getTeamModelHandle } from '../../ai/model/catalog/service';
import type { ModelReferenceType } from '@fastgpt/global/core/ai/model/schema';

/**
 * 把知识库保存的模型引用解析成审计展示用的模型标识。
 *
 * 索引模型审计只服务于人工排查「谁把索引模型换成了什么」，因此优先用稳定的 `modelId`；
 * 团队已删除该模型时（历史数据或刚被清理）退回数据库里的旧名称字段，两者都没有就返回空串，
 * 避免审计写入因模型查询失败而整体失败。
 */
export const getTrainingAuditModelName = async ({
  teamId,
  reference
}: {
  teamId: string;
  reference: ModelReferenceType;
}): Promise<string> => {
  const fallback = String(reference.modelId ?? reference.model ?? '');
  if (!fallback) return '';

  try {
    const modelHandle = await getTeamModelHandle({ teamId });
    const model =
      modelHandle.findModelData(reference) ?? modelHandle.findModelData({ modelId: fallback });
    return String(model?.modelId ?? fallback);
  } catch {
    // 模型目录不可用时只影响日志可读性，不能让已经完成的重建流程报错。
    return fallback;
  }
};
