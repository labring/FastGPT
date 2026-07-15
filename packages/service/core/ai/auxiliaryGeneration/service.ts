import { createAuxiliaryGenerationStream } from './stream';
import { createAuxiliaryGenerationUsage } from './usage';
import type { AuxiliaryGenerationProcessorResponse, AuxiliaryGenerationRunParams } from './type';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import { clearAgentRuntimeStop, shouldAgentRuntimeStop } from '../runtimeStatus';

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
  query,
  files,
  data,
  histories,
  usageSource,
  usageId,
  processor,
  maxFiles,
  customPdfParse,
  onStreamContextReady,
  onBeforeStreamDone
}: AuxiliaryGenerationRunParams<T>): Promise<
  AuxiliaryGenerationProcessorResponse & {
    streamContext: Awaited<ReturnType<typeof createAuxiliaryGenerationStream>>;
  }
> => {
  let stopping = false;
  let stopCheckRunning = false;
  let stopCheckTimer: ReturnType<typeof setInterval> | undefined;
  const startedAt = Date.now();
  const runtimeStatusParams = { sourceType, sourceId, chatId };
  const streamContext = await createAuxiliaryGenerationStream({
    req,
    res,
    teamId,
    sourceType,
    sourceId,
    chatId
  });

  try {
    onStreamContextReady?.(streamContext);
    const usageContext = await createAuxiliaryGenerationUsage({
      teamId,
      tmbId,
      appName,
      sourceType,
      sourceId,
      usageSource,
      usageId
    });
    await clearAgentRuntimeStop(runtimeStatusParams).catch(() => undefined);

    res.once('close', () => {
      stopping = true;
    });

    stopCheckTimer = setInterval(async () => {
      if (stopping || stopCheckRunning) return;

      stopCheckRunning = true;
      try {
        if (await shouldAgentRuntimeStop(runtimeStatusParams)) {
          stopping = true;
        }
      } finally {
        stopCheckRunning = false;
      }
    }, 100);

    const result = await processor({
      query,
      files,
      data,
      histories,
      requestOrigin: req.headers.origin,
      streamWriter: streamContext.write,
      checkIsStopping: () => stopping,
      usageSink: usageContext.pushUsage,
      usageId: usageContext.usageId,
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

    const durationSeconds = +((Date.now() - startedAt) / 1000).toFixed(2);
    streamContext.write(streamSseEvent.workflowDuration(durationSeconds));
    streamContext.write(streamSseEvent.answerStop());

    await onBeforeStreamDone?.({
      result,
      durationSeconds
    });

    streamContext.writeDone();

    return {
      ...result,
      streamContext
    };
  } finally {
    if (stopCheckTimer) {
      clearInterval(stopCheckTimer);
    }
    await clearAgentRuntimeStop(runtimeStatusParams).catch(() => undefined);
  }
};
