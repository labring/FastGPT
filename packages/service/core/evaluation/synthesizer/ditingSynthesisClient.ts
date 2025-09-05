import type {
  HttpConfig,
  DatasetSynthesisRequest,
  DatasetSynthesisResponse
} from '@fastgpt/global/core/evaluation/metric/type';

function loadHttpConfigFromEnv(): HttpConfig {
  return {
    url: process.env.DITING_BASE_URL || 'http://diting:3000',
    timeout: Number(process.env.DITING_TIMEOUT) || 300000
  };
}

export function createDitingSynthesisClient(config: HttpConfig = loadHttpConfigFromEnv()) {
  function getFullUrl(path: string) {
    return config.url.replace(/\/$/, '') + path;
  }

  return {
    async runSynthesis(request: DatasetSynthesisRequest): Promise<DatasetSynthesisResponse> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000);

      try {
        const res = await fetch(getFullUrl('/api/v1/dataset-synthesis/runs'), {
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
          throw new Error(`HTTP ${res.status}: ${errorText}`);
        }

        return (await res.json()) as DatasetSynthesisResponse;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error('Synthesis request timeout');
        }
        throw err;
      }
    }
  };
}
