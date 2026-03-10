import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum} from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { useCambAiServer } from '../../../../thirdProvider/cambAi/index';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.cambVoiceName]: string;
  [NodeInputKeyEnum.cambAudioUrl]: string;
  [NodeInputKeyEnum.cambGender]?: string;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.cambVoiceId]: string;
}>;

export const dispatchCambVoiceClone = async (props: Record<string, any>): Promise<Response> => {
  const {
    params: { cambVoiceName: voiceName = '', cambAudioUrl: audioUrl = '', cambGender: gender }
  } = props as Props;

  if (!voiceName || !audioUrl) {
    return Promise.reject({ message: '[CAMB AI] Voice name and audio URL are required' });
  }

  const apiKey = process.env.CAMB_API_KEY;
  if (!apiKey) {
    return Promise.reject({ message: '[CAMB AI] CAMB_API_KEY environment variable is required' });
  }

  const cambServer = useCambAiServer({ apiKey });

  const result = await cambServer.createCustomVoice({
    voice_name: voiceName,
    audio_url: audioUrl,
    gender: gender as 'male' | 'female' | undefined
  });

  const voiceId = String(result.voice_id);

  return {
    data: {
      [NodeOutputKeyEnum.cambVoiceId]: voiceId
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      voiceName,
      voiceId,
      status: result.status
    }
  };
};
