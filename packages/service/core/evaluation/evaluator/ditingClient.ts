import type {
  HttpConfig,
  EvaluationRequest,
  EvaluationResponse
} from '@fastgpt/global/core/evaluation/metric/type';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

function loadHttpConfigFromEnv(): HttpConfig {
  return {
    url: process.env.DITING_BASE_URL || 'http://diting:3000',
    timeout: Number(process.env.DITING_TIMEOUT) || 300000
  };
}

export function createDitingClient(config: HttpConfig = loadHttpConfigFromEnv()) {
  function getFullUrl(path: string) {
    return config.url.replace(/\/$/, '') + path;
  }

  return {
    async runEvaluation(request: EvaluationRequest): Promise<EvaluationResponse> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000);

      try {
        const res = await fetch(getFullUrl('/api/v1/evaluations/runs'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorText = await res.text().catch(() => res.statusText);
          if (res.status >= 500) {
            throw new Error(EvaluationErrEnum.evaluatorServiceUnavailable);
          } else {
            throw new Error(EvaluationErrEnum.evaluatorInvalidResponse);
          }
        }

        const response = await res.json();
        if (!response) {
          throw new Error(EvaluationErrEnum.evaluatorInvalidResponse);
        }

        return response as EvaluationResponse;
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
          throw new Error(EvaluationErrEnum.evaluatorRequestTimeout);
        }

        const networkErrorCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'];
        if (err.code && networkErrorCodes.includes(err.code)) {
          throw new Error(EvaluationErrEnum.evaluatorNetworkError);
        }

        if (Object.values(EvaluationErrEnum).includes(err.message)) {
          throw err;
        }

        throw new Error(EvaluationErrEnum.evaluatorServiceUnavailable);
      }
    }
  };
}
