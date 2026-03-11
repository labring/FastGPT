import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum} from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { useCambAiServer } from '../../../../thirdProvider/cambAi/index';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.cambSourceText]: string;
  [NodeInputKeyEnum.cambSourceLanguage]: string;
  [NodeInputKeyEnum.cambTargetLanguage]: string;
  [NodeInputKeyEnum.cambVoiceId]: string;
  [NodeInputKeyEnum.cambSpeed]?: number;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.cambAudioUrl]: string;
  [NodeOutputKeyEnum.cambTranslatedText]: string;
}>;

export const dispatchCambTranslatedTTS = async (
  props: Record<string, any>
): Promise<Response> => {
  const {
    params: {
      cambSourceText: sourceText = '',
      cambSourceLanguage: sourceLanguage = '1',
      cambTargetLanguage: targetLanguage = '139',
      cambVoiceId: voiceId = '',
      cambSpeed: speed = 1.0
    }
  } = props as Props;

  if (!sourceText || !voiceId) {
    return Promise.reject({ message: '[CAMB AI] Source text and voice ID are required' });
  }

  const apiKey = process.env.CAMB_API_KEY;
  if (!apiKey) {
    return Promise.reject({ message: '[CAMB AI] CAMB_API_KEY environment variable is required' });
  }

  const cambServer = useCambAiServer({ apiKey });

  const result = await cambServer.translatedTTS({
    text: sourceText,
    source_language: Number(sourceLanguage),
    target_language: Number(targetLanguage),
    voice_id: Number(voiceId),
    speed
  });

  return {
    data: {
      [NodeOutputKeyEnum.cambAudioUrl]: result.audio_url || '',
      [NodeOutputKeyEnum.cambTranslatedText]: result.translated_text || ''
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      sourceText,
      translatedText: result.translated_text || '',
      audioUrl: result.audio_url || '',
      sourceLanguage,
      targetLanguage,
      voiceId
    }
  };
};
