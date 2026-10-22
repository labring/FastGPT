import { createAuxiliaryGenerationStream } from './stream';
import { createAuxiliaryGenerationUsage } from './usage';
import { clearAuxiliaryGenerationStop, shouldAuxiliaryGenerationStop } from './stop';
import type { AuxiliaryGenerationRunParams, AuxiliaryGenerationRunResult } from './type';
import { getActiveChatGenerationLease } from '../../chat/generationLease';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);

/**
 * 执行一次辅助生成。
 *
 * 该函数负责鉴权之后的通用生命周期：余额校验、用量记录、SSE 初始化、
 * stop 标记、processor 调用和结束事件。业务差异由调用方传入的 processor 承担。
 */
export const runAuxiliaryGeneration = async <T>({
  req,
  res,
  teamId,
  tmbId,
  userId,
  isRoot,
  lang,
  appName,
  sourceType,
  sourceId,
  chatId,
  generationRunId,
  query,
  userAnswer,
  files,
  data,
  histories,
  usageSource,
  processor,
  maxFiles,
  customPdfParse,
  onStreamContextReady
}: AuxiliaryGenerationRunParams<T>): Promise<
  AuxiliaryGenerationRunResult & {
    streamContext: Awaited<ReturnType<typeof createAuxiliaryGenerationStream>>;
  }
> => {
  let stopping = false;
  const startedAt = Date.now();
  const streamContext = await createAuxiliaryGenerationStream({
    req,
    res,
    teamId,
    sourceType,
    sourceId,
    chatId,
    generationRunId
  });
  let usageContext: Awaited<ReturnType<typeof createAuxiliaryGenerationUsage>>;
  try {
    onStreamContextReady?.(streamContext);
    usageContext = await createAuxiliaryGenerationUsage({
      teamId,
      tmbId,
      appName,
      sourceType,
      sourceId,
      usageSource
    });
    await clearAuxiliaryGenerationStop({
      sourceType,
      sourceId,
      chatId
    });
  } catch (error) {
    await streamContext.flushResume().catch((flushError) => {
      logger.warn('Failed to flush auxiliary generation stream after setup error', {
        sourceType,
        sourceId,
        chatId,
        generationRunId,
        error: flushError
      });
    });
    throw error;
  }

  const getGenerationLeaseStopped = () => {
    const lease = getActiveChatGenerationLease({ sourceType, sourceId, chatId }, generationRunId);
    if (!generationRunId) return false;
    return !lease || lease.signal.aborted;
  };

  const stopCheckTimer = setInterval(async () => {
    if (stopping) return;
    stopping =
      getGenerationLeaseStopped() ||
      (await shouldAuxiliaryGenerationStop({
        sourceType,
        sourceId,
        chatId,
        ...(generationRunId && { generationRunId })
      }));
  }, 100);

  try {
    const result = await processor({
      query,
      userAnswer,
      files,
      data,
      histories,
      requestOrigin: req.headers.origin,
      streamWriter: streamContext.write,
      checkIsStopping: () => stopping || getGenerationLeaseStopped(),
      usageSink: usageContext.pushUsage,
      maxFiles,
      customPdfParse,
      user: {
        teamId,
        tmbId,
        userId,
        isRoot,
        lang
      }
    });

    streamContext.writeDone();

    return {
      ...result,
      durationSeconds: +((Date.now() - startedAt) / 1000).toFixed(2),
      streamContext
    };
  } finally {
    clearInterval(stopCheckTimer);
    await clearAuxiliaryGenerationStop({
      sourceType,
      sourceId,
      chatId,
      ...(generationRunId && { generationRunId })
    });
  }
};
