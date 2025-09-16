import type { Job } from 'bullmq';
import { addLog } from '../../../common/system/log';
import { MongoEvalDatasetCollection } from './evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from './evalDatasetDataSchema';
import { MongoDatasetData } from '../../dataset/data/schema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataQualityResultEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/dataset/type';
import {
  type EvalDatasetDataSynthesizeData,
  getEvalDatasetDataSynthesizeWorker
} from './dataSynthesizeMq';
import { createSynthesizerInstance } from '../synthesizer';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { createEvalDatasetDataSynthesisUsage } from '../../../support/wallet/usage/controller';
import { addAuditLog } from '../../../support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function processor(job: Job<EvalDatasetDataSynthesizeData>) {
  const { dataId, intelligentGenerationModel, evalDatasetCollectionId } = job.data;

  try {
    addLog.info('Starting eval dataset data synthesis', {
      dataId,
      evalDatasetCollectionId,
      intelligentGenerationModel
    });

    const sourceData = await MongoDatasetData.findById(dataId);
    if (!sourceData) {
      throw new Error(`Source dataset data not found: ${dataId}`);
    }

    const evalDatasetCollection =
      await MongoEvalDatasetCollection.findById(evalDatasetCollectionId);
    if (!evalDatasetCollection) {
      throw new Error(`Eval dataset not found: ${evalDatasetCollectionId}`);
    }

    // Check AI points limit before synthesis
    await checkTeamAIPoints(evalDatasetCollection.teamId);

    const llmConfig = {
      name: intelligentGenerationModel
    };

    const synthesisCase = {
      context: sourceData.q ? [sourceData.q] : []
    };

    const synthesizer = createSynthesizerInstance('q_a_synthesizer', llmConfig);
    const synthesisResult = await synthesizer.synthesize(synthesisCase);

    // Save usage
    let totalPoints = 0;
    if (synthesisResult.usages?.length) {
      const { totalPoints: calculatedPoints } = await createEvalDatasetDataSynthesisUsage({
        teamId: evalDatasetCollection.teamId,
        tmbId: evalDatasetCollection.tmbId,
        model: intelligentGenerationModel,
        usages: synthesisResult.usages
      });
      totalPoints = calculatedPoints;
    }

    const qualityResult =
      synthesisResult.data?.metadata?.score && synthesisResult.data.metadata.score >= 0.7
        ? EvalDatasetDataQualityResultEnum.highQuality
        : EvalDatasetDataQualityResultEnum.needsOptimization;

    const evalData: Partial<EvalDatasetDataSchemaType> = {
      teamId: evalDatasetCollection.teamId,
      tmbId: evalDatasetCollection.tmbId,
      evalDatasetCollectionId: evalDatasetCollectionId,
      [EvalDatasetDataKeyEnum.UserInput]: synthesisResult.data?.qaPair.question,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: synthesisResult.data?.qaPair.answer,
      [EvalDatasetDataKeyEnum.ActualOutput]: '',
      [EvalDatasetDataKeyEnum.Context]: [],
      [EvalDatasetDataKeyEnum.RetrievalContext]: [],
      qualityMetadata: {
        status: EvalDatasetDataQualityStatusEnum.completed,
        score: synthesisResult.data?.metadata?.score,
        reason: synthesisResult.data?.metadata?.reason,
        usages: synthesisResult?.usages,
        finishTime: new Date()
      },
      synthesisMetadata: {
        sourceDataId: sourceData._id.toString(),
        sourceDatasetId: sourceData.datasetId.toString(),
        sourceCollectionId: sourceData.collectionId.toString(),
        intelligentGenerationModel,
        generatedAt: new Date(),
        synthesizedAt: new Date()
      },
      qualityResult,
      createFrom: EvalDatasetDataCreateFromEnum.intelligentGeneration
    };

    const insertedRecord = await MongoEvalDatasetData.create(evalData);

    addLog.info('Completed data synthesis', {
      dataId,
      evalDatasetCollectionId,
      insertedRecordId: insertedRecord._id,
      totalPoints
    });

    (async () => {
      addAuditLog({
        teamId: evalDatasetCollection.teamId,
        tmbId: evalDatasetCollection.tmbId,
        event: AuditEventEnum.SMART_GENERATE_EVALUATION_DATA,
        params: {
          collectionName: evalDatasetCollection.name
        }
      });
    })();

    return {
      success: true,
      insertedRecordId: insertedRecord._id
    };
  } catch (error) {
    addLog.error('Failed to synthesize eval dataset data', {
      dataId,
      evalDatasetCollectionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

// Initialize worker
export const initEvalDatasetDataSynthesizeWorker = () => {
  return getEvalDatasetDataSynthesizeWorker(processor);
};
