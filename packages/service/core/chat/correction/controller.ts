import { Types } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoChatCorrection } from './schema';
import { MongoChatItem } from '../chatItemSchema';
import type { CorrectionDataType } from '@fastgpt/global/core/chat/correction/type';
import { CorrectionModeEnum } from '@fastgpt/global/core/chat/correction/constants';
import { getEmbeddingModel } from '../../ai/model';
import {
  insertDatasetDataVector,
  deleteDatasetDataVector
} from '../../../common/vectorDB/controller';
import type { ClientSession } from '../../../common/mongo';

type SubmitChatCorrectionProps = {
  teamId: string;
  tmbId: string;
  userId: string;
  appId: string;
  chatId: string;
  dataId: string;
  correctionData: CorrectionDataType;
  modelName: string;
};

type ProcessEditModeProps = {
  teamId: string;
  appId: string;
  correctionId: string;
  correctionData: CorrectionDataType;
  modelName: string;
  session: ClientSession;
};

type ProcessAnnotateModeProps = {
  correctionId: string;
  correctionData: CorrectionDataType;
  session: ClientSession;
};

/**
 * Submit or update a chat correction
 */
export async function submitChatCorrection({
  teamId,
  tmbId,
  userId,
  appId,
  chatId,
  dataId,
  correctionData,
  modelName
}: SubmitChatCorrectionProps): Promise<string> {
  // Check if correction already exists
  const existing = await MongoChatCorrection.findOne({ appId, chatId, dataId });

  return mongoSessionRun(async (session) => {
    let correctionId: string;

    if (existing) {
      // Delete old vectors BEFORE updating (if edit mode)
      if (
        existing.correctionData.correctionMode === CorrectionModeEnum.edit &&
        existing.correctionData.indexs &&
        existing.correctionData.indexs.length > 0
      ) {
        const vectorIds = existing.correctionData.indexs.map((idx) => idx.dataId);
        await deleteDatasetDataVector({
          teamId,
          idList: vectorIds
        });
      }

      // Update existing record
      existing.correctionData = correctionData;
      existing.updateTime = new Date();
      await existing.save({ session });
      correctionId = String(existing._id);
    } else {
      // Create new record
      const [newCorrection] = await MongoChatCorrection.create(
        [
          {
            dataId,
            teamId: new Types.ObjectId(teamId),
            tmbId: new Types.ObjectId(tmbId),
            userId: new Types.ObjectId(userId),
            chatId,
            appId: new Types.ObjectId(appId),
            correctionData
          }
        ],
        { session }
      );
      correctionId = String(newCorrection._id);
    }

    // Update ChatItem
    await MongoChatItem.updateOne(
      { dataId },
      {
        correctionStatus: true,
        correctionId: new Types.ObjectId(correctionId)
      },
      { session }
    );

    // Process based on mode
    if (correctionData.correctionMode === CorrectionModeEnum.edit) {
      await processEditMode({
        teamId,
        appId,
        correctionId,
        correctionData,
        modelName,
        session
      });
    } else {
      await processAnnotateMode({
        correctionId,
        correctionData,
        session
      });
    }

    return correctionId;
  });
}

/**
 * Process edit mode correction - generate vectors and store in modeldata
 */
async function processEditMode({
  teamId,
  appId,
  correctionId,
  correctionData,
  modelName,
  session
}: ProcessEditModeProps): Promise<void> {
  const { question, correctedAnswer } = correctionData;

  if (!correctedAnswer) {
    throw new Error('correctedAnswer is required for edit mode');
  }

  // 1. Generate vectors for question and answer
  const embModel = getEmbeddingModel(modelName);
  // 2. Insert into modeldata table (reuse existing interface)
  // Use appId as datasetId, correctionId as collectionId
  const { insertIds } = await insertDatasetDataVector({
    model: embModel,
    teamId,
    datasetId: appId, // ← Use appId instead of datasetId
    collectionId: correctionId, // ← Use correctionId instead of collectionId
    inputs: [question, correctedAnswer]
  });

  // 3. Update correction document with index references
  await MongoChatCorrection.updateOne(
    { _id: correctionId },
    {
      $set: {
        'correctionData.indexs': [
          { type: 'q', dataId: String(insertIds[0]) },
          { type: 'a', dataId: String(insertIds[1]) }
        ]
      }
    },
    { session }
  );
}

/**
 * Process annotate mode correction - map quotes to indexes
 */
async function processAnnotateMode({
  correctionId,
  correctionData,
  session
}: ProcessAnnotateModeProps): Promise<void> {
  // Use correctedQuoteList's datasetDataIds as indexes
  const indexs =
    correctionData.correctedQuoteList?.map((quote) => ({
      type: 'c' as const,
      dataId: quote.datasetDataId
    })) || [];

  await MongoChatCorrection.updateOne(
    { _id: correctionId },
    { $set: { 'correctionData.indexs': indexs } },
    { session }
  );
}

/**
 * Delete a chat correction and cleanup vectors
 */
export async function deleteChatCorrection({
  teamId,
  correctionId
}: {
  teamId: string;
  correctionId: string;
}): Promise<void> {
  const correction = await MongoChatCorrection.findById(correctionId);
  if (!correction) {
    throw new Error('Correction not found');
  }

  await mongoSessionRun(async (session) => {
    // 1. Delete MongoDB record
    await MongoChatCorrection.deleteOne({ _id: correctionId }, { session });

    // 2. Update ChatItem to remove correction reference
    await MongoChatItem.updateOne(
      { correctionId: new Types.ObjectId(correctionId) },
      { $unset: { correctionStatus: 1, correctionId: 1 } },
      { session }
    );

    // 3. Delete vectors if edit mode
    if (
      correction.correctionData.correctionMode === CorrectionModeEnum.edit &&
      correction.correctionData.indexs &&
      correction.correctionData.indexs.length > 0
    ) {
      const vectorIds = correction.correctionData.indexs.map((idx) => idx.dataId);
      await deleteDatasetDataVector({
        teamId,
        idList: vectorIds
      });
    }
  });
}
