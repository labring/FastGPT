import { synthesizeEvalData, callLLMJudge } from '../../common/external/diting';
import type {
  DiTingSyntheticEvalDataRequest,
  DiTingSyntheticEvalDataResponse,
  DiTingLLMJudgeRequest,
  DiTingLLMJudgeResponse
} from '../../common/external/diting';

const RERANK_SYNTHESIZER_NAME = 'eval_qa_pairs_synthesizer';

export type RerankSyntheticEvalDataRequest = Omit<
  DiTingSyntheticEvalDataRequest,
  'synthesizerConfig'
>;

export async function synthesizeRerankEvalData(
  request: RerankSyntheticEvalDataRequest
): Promise<DiTingSyntheticEvalDataResponse> {
  return synthesizeEvalData({
    ...request,
    synthesizerConfig: { synthesizerName: RERANK_SYNTHESIZER_NAME }
  });
}

/** Call DiTing LLM judge to determine truly relevant chunks for a query */
export type RerankLLMJudgeRequest = DiTingLLMJudgeRequest;
export type RerankLLMJudgeResponse = DiTingLLMJudgeResponse;

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
