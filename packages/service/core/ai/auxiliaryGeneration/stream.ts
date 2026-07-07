import type { NextApiRequest, NextApiResponse } from 'next';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { STREAM_RESUME_REQUEST_HEADER } from '@fastgpt/global/core/chat/constants';
import { getSseErrorResponse, responseWrite } from '../../../common/response';
import { clearCookie } from '../../../support/permission/auth/common';
import { getStreamResumeMirror } from '../../chat/resume';
import { createAnswerDelta } from './utils';

export type AuxiliaryGenerationStreamWriter = (params: {
  event?: `${AuxiliaryGenerationEventEnum}` | string;
  data: string | object;
}) => void;

type CreateAuxiliaryGenerationStreamParams = {
  req: NextApiRequest;
  res: NextApiResponse;
  teamId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
};

type AuxiliaryGenerationStreamContext = {
  write: AuxiliaryGenerationStreamWriter;
  writeError: (error: unknown) => void;
  writeDone: () => void;
  flushResume: () => Promise<void>;
};

/**
 * 初始化辅助生成 SSE 响应。
 *
 * 这里只处理通用 SSE 协议、心跳和 chat stream resume mirror，不引入 workflow writer。
 * 调用方需要显式写入 answer/interactive/config 等业务事件。
 */
export const createAuxiliaryGenerationStream = async ({
  req,
  res,
  teamId,
  sourceType,
  sourceId,
  chatId
}: CreateAuxiliaryGenerationStreamParams): Promise<AuxiliaryGenerationStreamContext> => {
  const mirror = await getStreamResumeMirror({
    resumeRequestHeaderValue: req.headers?.[STREAM_RESUME_REQUEST_HEADER],
    teamId,
    sourceType,
    sourceId,
    chatId
  });

  if (!res.headersSent) {
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
  }

  const write: AuxiliaryGenerationStreamWriter = ({ event, data }) => {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const raw = `${event ? `event: ${event}\n` : ''}data: ${payload}\n\n`;
    void mirror?.enqueueRaw?.(raw);

    if (res.closed || res.writableEnded || res.destroyed) return;
    responseWrite({ res, event, data: payload });
  };

  let cleaned = false;
  const streamCheckTimer = setInterval(() => {
    write({
      event: AuxiliaryGenerationEventEnum.answer,
      data: createAnswerDelta({ text: '' })
    });
  }, 10000);

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(streamCheckTimer);
  };
  res.once('finish', cleanup);
  res.once('close', cleanup);
  res.on('error', () => {
    cleanup();
    res.end();
  });

  return {
    write,
    writeError(error) {
      const { data, shouldClearCookie } = getSseErrorResponse(error);
      if (shouldClearCookie) {
        clearCookie(res);
      }
      write({
        event: AuxiliaryGenerationEventEnum.error,
        data
      });
    },
    writeDone() {
      write({
        event: AuxiliaryGenerationEventEnum.answer,
        data: createAnswerDelta({
          text: null,
          finishReason: 'stop'
        })
      });
      write({
        event: AuxiliaryGenerationEventEnum.answer,
        data: '[DONE]'
      });
    },
    async flushResume() {
      await mirror?.flush();
      await mirror?.shrinkTTLAfterComplete();
    }
  };
};
