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
import { MongoDatasetData } from '../../dataset/data/schema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import { addLog } from '../../../common/system/log';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

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
  teamId: string;
  correctionId: string;
  correctionData: CorrectionDataType;
  modelName: string;
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
  // Validate required parameters
  if (!teamId || !tmbId || !userId || !appId || !chatId || !dataId) {
    throw new Error('Missing required parameters for submitChatCorrection');
  }

  if (!correctionData || !correctionData.question?.trim()) {
    throw new Error('Correction data and question are required');
  }

  if (!modelName?.trim()) {
    throw new Error(ChatErrEnum.modelNameRequired);
  }

  // Check if correction already exists
  const existing = await MongoChatCorrection.findOne({ appId, chatId, dataId });

  addLog.info('Submitting chat correction', {
    appId,
    chatId,
    dataId,
    mode: correctionData.correctionMode,
    isUpdate: !!existing
  });

  return mongoSessionRun(async (session) => {
    let correctionId: string;

    if (existing) {
      addLog.debug('Updating existing correction', { correctionId: String(existing._id) });

      // Delete old vectors/indexes BEFORE updating
      if (existing.correctionData.correctionMode === CorrectionModeEnum.edit) {
        // Edit mode: delete vectors from vector store
        if (existing.correctionData.indexs && existing.correctionData.indexs.length > 0) {
          const vectorIds = existing.correctionData.indexs.map((idx: any) => idx.dataId);
          await deleteDatasetDataVector({
            teamId,
            idList: vectorIds
          });
        }
      } else if (existing.correctionData.correctionMode === CorrectionModeEnum.annotate) {
        // Annotate mode: remove correction indexes from dataset data
        if (
          existing.correctionData.correctedQuoteList &&
          existing.correctionData.correctedQuoteList.length > 0 &&
          existing.correctionData.question?.trim()
        ) {
          const vectorIds = await removeCorrectionIndexes({
            correctedQuoteList: existing.correctionData.correctedQuoteList,
            correctionQuestion: existing.correctionData.question || '',
            session
          });

          // Delete the vectors from vector store
          if (vectorIds.length > 0) {
            await deleteDatasetDataVector({
              teamId,
              idList: vectorIds
            });
          }
        } else if (!existing.correctionData.question?.trim()) {
          addLog.warn('Cannot remove old correction indexes: question is empty', {
            correctionId: String(existing._id)
          });
        }
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
        teamId,
        correctionId,
        correctionData,
        modelName,
        session
      });
    }

    addLog.info('Successfully submitted chat correction', {
      correctionId,
      mode: correctionData.correctionMode
    });

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
  try {
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
  } catch (error) {
    // If MongoDB operation fails, clean up inserted vectors to maintain consistency
    addLog.warn('MongoDB operation failed in edit mode, cleaning up inserted vectors', {
      correctionId,
      vectorIds: insertIds,
      error: (error as Error).message
    });
    try {
      await deleteDatasetDataVector({
        teamId,
        idList: insertIds
      });
    } catch (cleanupError) {
      addLog.error('Failed to cleanup vectors after MongoDB failure', {
        correctionId,
        vectorIds: insertIds,
        error: (cleanupError as Error).message
      });
    }
    throw error;
  }
}

/**
 * Process annotate mode correction - add correction question indexes to dataset data
 */
async function processAnnotateMode({
  teamId,
  correctionId,
  correctionData,
  modelName,
  session
}: ProcessAnnotateModeProps): Promise<void> {
  // Step 1: Store citation references in correction document
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

  // Step 2: Add correction question as a new index to each referenced dataset data
  if (correctionData.correctedQuoteList && correctionData.correctedQuoteList.length > 0) {
    const embModel = getEmbeddingModel(modelName);
    const insertedVectorIds: string[] = [];

    try {
      // Process each referenced dataset data
      for (const quote of correctionData.correctedQuoteList) {
        const datasetData = await MongoDatasetData.findById(quote.datasetDataId).session(session);

        if (!datasetData) {
          addLog.warn('Dataset data not found, skipping correction index addition', {
            datasetDataId: quote.datasetDataId
          });
          continue;
        }

        // Generate vector for the correction question
        const { insertIds } = await insertDatasetDataVector({
          model: embModel,
          teamId,
          datasetId: String(datasetData.datasetId),
          collectionId: String(datasetData.collectionId),
          inputs: [correctionData.question]
        });

        insertedVectorIds.push(insertIds[0]);

        // Add new correction index to the dataset data's indexes array
        await MongoDatasetData.updateOne(
          { _id: quote.datasetDataId },
          {
            $push: {
              indexes: {
                type: DatasetDataIndexTypeEnum.correction,
                dataId: insertIds[0],
                text: correctionData.question
              }
            }
          },
          { session }
        );
      }
    } catch (error) {
      // If MongoDB operation fails, clean up inserted vectors to maintain consistency
      if (insertedVectorIds.length > 0) {
        addLog.warn('MongoDB operation failed, cleaning up inserted vectors', {
          correctionId,
          vectorIds: insertedVectorIds,
          error: (error as Error).message
        });
        try {
          await deleteDatasetDataVector({
            teamId,
            idList: insertedVectorIds
          });
        } catch (cleanupError) {
          addLog.error('Failed to cleanup vectors after MongoDB failure', {
            correctionId,
            vectorIds: insertedVectorIds,
            error: (cleanupError as Error).message
          });
        }
      }
      throw error;
    }
  }
}

/**
 * Helper function: Remove correction indexes from dataset data records
 * @param correctionId - The correction ID to identify which indexes to remove
 * @param correctedQuoteList - List of dataset data IDs that have correction indexes
 * @param correctionQuestion - The correction question text to match
 * @param session - MongoDB session for transaction
 */
async function removeCorrectionIndexes({
  correctedQuoteList,
  correctionQuestion,
  session
}: {
  correctedQuoteList: Array<{ datasetDataId: string }>;
  correctionQuestion: string;
  session: ClientSession;
}): Promise<string[]> {

  if (!correctionQuestion || !correctionQuestion.trim()) {
    addLog.warn('Empty correction question provided to removeCorrectionIndexes, skipping removal');
    return [];
  }

  if (!correctedQuoteList || correctedQuoteList.length === 0) {
    addLog.debug('No corrected quotes to remove');
    return [];
  }

  const vectorIdsToDelete: string[] = [];

  for (const quote of correctedQuoteList) {
    try {
      // Fetch the dataset data
      const datasetData = await MongoDatasetData.findById(quote.datasetDataId).session(session);

      if (!datasetData) {
        addLog.warn('Dataset data not found during correction index removal', {
          datasetDataId: quote.datasetDataId,
          correctionQuestion
        });
        continue;
      }

      // Find correction indexes that match this correction's question
      const correctionIndexes =
        datasetData.indexes?.filter(
          (idx: DatasetDataIndexItemType) =>
            idx.type === DatasetDataIndexTypeEnum.correction && idx.text === correctionQuestion
        ) || [];

      if (correctionIndexes.length > 0) {
        // Collect vector IDs for deletion
        vectorIdsToDelete.push(
          ...correctionIndexes.map((idx: DatasetDataIndexItemType) => idx.dataId)
        );

        // Remove these indexes from the dataset data
        await MongoDatasetData.updateOne(
          { _id: quote.datasetDataId },
          {
            $pull: {
              indexes: {
                type: DatasetDataIndexTypeEnum.correction,
                text: correctionQuestion
              }
            }
          },
          { session }
        );
      }
    } catch (error) {
      addLog.error('Failed to remove correction indexes from dataset data', {
        datasetDataId: quote.datasetDataId,
        error: (error as Error).message
      });
      // Continue processing other quotes
      continue;
    }
  }

  return vectorIdsToDelete;
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
  // Validate required parameters
  if (!teamId || !correctionId) {
    throw new Error('Missing required parameters for deleteChatCorrection');
  }

  const correction = await MongoChatCorrection.findById(correctionId);
  if (!correction) {
    throw new Error('Correction not found');
  }

  addLog.info('Deleting chat correction', {
    correctionId,
    mode: correction.correctionData.correctionMode
  });

  await mongoSessionRun(async (session) => {
    // 1. Delete MongoDB record
    await MongoChatCorrection.deleteOne({ _id: correctionId }, { session });

    // 2. Update ChatItem to remove correction reference
    await MongoChatItem.updateOne(
      { correctionId: new Types.ObjectId(correctionId) },
      { $unset: { correctionId: 1 } },
      { session }
    );

    // 3. Delete vectors and cleanup indexes based on mode
    if (correction.correctionData.correctionMode === CorrectionModeEnum.edit) {
      // Edit mode: delete vectors from vector store
      if (correction.correctionData.indexs && correction.correctionData.indexs.length > 0) {
        const vectorIds = correction.correctionData.indexs.map((idx: any) => idx.dataId);
        await deleteDatasetDataVector({
          teamId,
          idList: vectorIds
        });
      }
    } else if (correction.correctionData.correctionMode === CorrectionModeEnum.annotate) {
      // Annotate mode: remove correction indexes from dataset data
      if (
        correction.correctionData.correctedQuoteList &&
        correction.correctionData.correctedQuoteList.length > 0
      ) {
        const vectorIds = await removeCorrectionIndexes({
          correctedQuoteList: correction.correctionData.correctedQuoteList,
          correctionQuestion: correction.correctionData.question,
          session
        });

        // Delete the vectors from vector store
        if (vectorIds.length > 0) {
          await deleteDatasetDataVector({
            teamId,
            idList: vectorIds
          });
        }
      }
    }

    addLog.info('Successfully deleted chat correction', { correctionId });
  });
}


