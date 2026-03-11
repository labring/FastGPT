import { delay } from '@fastgpt/global/common/system/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { axios } from '../../common/api/axios';
import type {
  CambTranslateRequest,
  CambTaskResponse,
  CambTaskStatusResponse,
  CambTranslationResultResponse,
  CambCreateVoiceRequest,
  CambCreateVoiceResponse,
  CambTranslatedTTSRequest,
  CambTranslatedTTSResultResponse,
  CambVoice,
  CambTTSStreamRequest
} from './types';

const CAMB_API_BASE = 'https://client.camb.ai/apis';
const MAX_POLL_RETRIES = 120;
const POLL_INTERVAL_MS = 3000;

export const useCambAiServer = ({ apiKey }: { apiKey: string }) => {
  const headers = {
    'x-api-key': apiKey,
    'Content-Type': 'application/json'
  };

  const responseError = (err: any) => {
    if (!err) {
      return Promise.reject({ message: '[CAMB AI] Unknown error' });
    }
    if (typeof err === 'string') {
      return Promise.reject({ message: `[CAMB AI] ${err}` });
    }
    if (err?.response?.data?.detail) {
      const detail = err.response.data.detail;
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      return Promise.reject({ message: `[CAMB AI] ${msg}` });
    }
    if (err?.response?.data) {
      return Promise.reject({ message: `[CAMB AI] ${getErrText(err?.response?.data)}` });
    }
    if (typeof err.message === 'string') {
      return Promise.reject({ message: `[CAMB AI] ${err.message}` });
    }
    return Promise.reject({ message: `[CAMB AI] ${getErrText(err)}` });
  };

  // Poll task status until SUCCESS, returns run_id
  const pollTaskStatus = async (taskId: string, endpoint: string): Promise<number> => {
    for (let i = 0; i < MAX_POLL_RETRIES; i++) {
      await delay(POLL_INTERVAL_MS);

      try {
        const { data } = await axios.get<CambTaskStatusResponse>(
          `${CAMB_API_BASE}${endpoint}/${taskId}`,
          { headers }
        );

        if (data.status === 'SUCCESS') {
          if (data.run_id === null) {
            return Promise.reject({ message: '[CAMB AI] Task succeeded but no run_id returned' });
          }
          return data.run_id;
        }
        if (data.status === 'FAILED') {
          return Promise.reject({
            message: `[CAMB AI] Task failed: ${data.exception_reason || data.message || 'Unknown error'}`
          });
        }
        // PENDING or PROCESSING - continue polling
      } catch (err) {
        return responseError(err);
      }
    }
    return Promise.reject({ message: '[CAMB AI] Task polling timeout' });
  };

  // Translation: POST /translate -> poll /translate/{task_id} -> GET /translation-result/{run_id}
  const translate = async (params: CambTranslateRequest): Promise<string[]> => {
    try {
      const { data } = await axios.post<CambTaskResponse>(`${CAMB_API_BASE}/translate`, params, {
        headers
      });

      const runId = await pollTaskStatus(data.task_id, '/translate');

      const { data: result } = await axios.get<CambTranslationResultResponse>(
        `${CAMB_API_BASE}/translation-result/${runId}`,
        { headers }
      );

      return result.texts || [];
    } catch (err) {
      return responseError(err);
    }
  };

  // Create custom voice: POST /create-custom-voice (multipart)
  const createCustomVoice = async (
    params: CambCreateVoiceRequest
  ): Promise<CambCreateVoiceResponse> => {
    try {
      const { data } = await axios.post<CambCreateVoiceResponse>(
        `${CAMB_API_BASE}/create-custom-voice`,
        params,
        { headers }
      );
      return data;
    } catch (err) {
      return responseError(err);
    }
  };

  // Translated TTS: POST /translated-tts -> poll /translated-tts/{task_id}
  const translatedTTS = async (
    params: CambTranslatedTTSRequest
  ): Promise<CambTranslatedTTSResultResponse> => {
    try {
      const { data } = await axios.post<CambTaskResponse>(
        `${CAMB_API_BASE}/translated-tts`,
        params,
        { headers }
      );

      const runId = await pollTaskStatus(data.task_id, '/translated-tts');

      // Fetch the result using run_id
      const { data: result } = await axios.get<CambTranslatedTTSResultResponse>(
        `${CAMB_API_BASE}/tts-result/${runId}`,
        { headers }
      );

      return result;
    } catch (err) {
      return responseError(err);
    }
  };

  // List voices: GET /list-voices -> returns CambVoice[] directly
  const listVoices = async (): Promise<CambVoice[]> => {
    try {
      const { data } = await axios.get<CambVoice[]>(`${CAMB_API_BASE}/list-voices`, { headers });
      return data;
    } catch (err) {
      return responseError(err);
    }
  };

  // TTS Stream: POST /tts-stream -> returns binary audio/mpeg data
  // Note: /tts-stream uses string locale codes (e.g. 'en-us'), not numeric language IDs
  const ttsStream = async (params: CambTTSStreamRequest): Promise<Buffer> => {
    try {
      const { data } = await axios.post(`${CAMB_API_BASE}/tts-stream`, params, {
        headers,
        responseType: 'arraybuffer'
      });
      // If response is an error JSON encoded as arraybuffer, decode and throw
      if (data instanceof ArrayBuffer || Buffer.isBuffer(data)) {
        const buf = Buffer.from(data);
        // Check if it looks like JSON error (starts with '{')
        if (buf.length > 0 && buf[0] === 0x7b) {
          try {
            const errObj = JSON.parse(buf.toString('utf-8'));
            if (errObj.detail || errObj.error || errObj.message) {
              return responseError({ response: { data: errObj } });
            }
          } catch {
            // Not JSON, it's valid audio data
          }
        }
        return buf;
      }
      return Buffer.from(data);
    } catch (err) {
      return responseError(err);
    }
  };

  return {
    translate,
    createCustomVoice,
    translatedTTS,
    listVoices,
    ttsStream
  };
};
