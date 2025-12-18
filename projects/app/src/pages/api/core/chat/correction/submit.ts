import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  SubmitChatCorrectionParams,
  SubmitChatCorrectionResponse
} from '@fastgpt/global/core/chat/correction/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { submitChatCorrection } from '@fastgpt/service/core/chat/correction/controller';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<SubmitChatCorrectionParams>,
  _res: ApiResponseType<any>
): Promise<SubmitChatCorrectionResponse> {
  const { appId, chatId, dataId, correctionData } = req.body;
  // 1. Authentication
  const { teamId, tmbId, uid } = await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId
  });

  // 2. Validate chatItem exists
  const chatItem = await MongoChatItem.findOne({
    appId,
    chatId,
    dataId
  });

  if (!chatItem) {
    return Promise.reject('Chat item not found');
  }
  // 2.5 Get modelName from app config
  const app = await MongoApp.findById(appId, 'modules').lean();
  if (!app) return Promise.reject(AppErrEnum.unExist);

  const modelName: string =
    app.modules
      ?.find((node) => node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode)
      ?.inputs?.find((item) => item.key === NodeInputKeyEnum.datasetSelectList)
      ?.value?.find((v: { vectorModel?: { name: string } }) => v.vectorModel)?.vectorModel.name ??
    '';

  addLog.debug(`used model for correction: ${modelName}`);

  // 3. Call controller to process correction
  const correctionId = await submitChatCorrection({
    teamId,
    tmbId,
    userId: uid,
    appId,
    chatId,
    dataId,
    correctionData,
    modelName
  });

  return { correctionId };
}

export default NextAPI(handler);
