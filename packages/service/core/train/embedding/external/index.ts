import { synthesizeEvalData, callLLMJudge } from '../../common/external/diting';
import type {
  DiTingSyntheticEvalDataRequest,
  DiTingSyntheticEvalDataResponse,
  DiTingLLMJudgeRequest,
  DiTingLLMJudgeResponse
} from '../../common/external/diting';

const EMBEDDING_SYNTHESIZER_NAME = 'eval_qa_pairs_synthesizer';

export type EmbeddingSyntheticEvalDataRequest = Omit<
  DiTingSyntheticEvalDataRequest,
  'synthesizerConfig'
>;

export async function synthesizeEmbeddingEvalData(
  request: EmbeddingSyntheticEvalDataRequest
): Promise<DiTingSyntheticEvalDataResponse> {
  return synthesizeEvalData({
    ...request,
    synthesizerConfig: { synthesizerName: EMBEDDING_SYNTHESIZER_NAME }
  });
}

/** Call DiTing LLM judge to determine truly relevant chunks for a query */
export type EmbeddingLLMJudgeRequest = DiTingLLMJudgeRequest;
export type EmbeddingLLMJudgeResponse = DiTingLLMJudgeResponse;

export async function judgeRelevantChunks(
  request: DiTingLLMJudgeRequest
): Promise<DiTingLLMJudgeResponse> {
  return callLLMJudge(request);
}

// SFT Bridge - re-export from common package
export {
  createSFTTask,
  querySFTTaskStatus,
  deleteSFTTask,
  SFTTaskStatus
} from '../../common/external/sftbridge';

export type {
  CreateSFTTaskRequest,
  CreateSFTTaskResponse,
  QuerySFTTaskStatusRequest,
  QuerySFTTaskStatusResponse,
  DeleteSFTTaskRequest,
  DeleteSFTTaskResponse
} from '../../common/external/sftbridge';
