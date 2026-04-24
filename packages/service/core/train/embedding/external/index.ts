import { synthesizeEvalData } from '../../common/external/diting';
import type {
  DiTingSyntheticEvalDataRequest,
  DiTingSyntheticEvalDataResponse
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
