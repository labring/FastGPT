import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import {
  refreshModelTemplates,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateDefaultModelsBodySchema,
  type UpdateDefaultModelsBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

async function handler(req: ApiRequestProps<UpdateDefaultModelsBody>): Promise<void> {
  await authSystemAdmin({ req });
  const defaults = parseApiInput({ req, bodySchema: UpdateDefaultModelsBodySchema }).body;
  const pluginDocuments = await refreshModelTemplates();
  const defaultFields = [
    { modelId: defaults[ModelTypeEnum.llm], field: 'isDefault' },
    { modelId: defaults[ModelTypeEnum.embedding], field: 'isDefault' },
    { modelId: defaults[ModelTypeEnum.tts], field: 'isDefault' },
    { modelId: defaults[ModelTypeEnum.stt], field: 'isDefault' },
    { modelId: defaults[ModelTypeEnum.rerank], field: 'isDefault' },
    { modelId: defaults.datasetTextLLMModelId, field: 'isDefaultDatasetTextModel' },
    { modelId: defaults.datasetImageLLMModelId, field: 'isDefaultDatasetImageModel' },
    { modelId: defaults.chatTitleLLMModelId, field: 'isDefaultChatTitleModel' }
  ].filter((item): item is { modelId: string; field: string } => !!item.modelId);

  await mongoSessionRun(async (session) => {
    await MongoSystemModel.updateMany(
      { scope: ModelScopeEnum.system },
      {
        $unset: {
          isDefault: '',
          isDefaultDatasetTextModel: '',
          isDefaultDatasetImageModel: '',
          isDefaultChatTitleModel: ''
        }
      },
      { session }
    );
    if (defaultFields.length === 0) return;

    await MongoSystemModel.bulkWrite(
      defaultFields.map(({ modelId, field }) => ({
        updateOne: {
          filter: { _id: modelId, scope: ModelScopeEnum.system },
          update: { $set: { [field]: true } }
        }
      })),
      { session }
    );
  });

  await updatedReloadSystemModel({ pluginDocuments });
}

export default NextAPI(handler);
