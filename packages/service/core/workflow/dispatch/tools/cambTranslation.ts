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
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.cambTranslatedText]: string;
}>;

export const dispatchCambTranslation = async (props: Record<string, any>): Promise<Response> => {
  const {
    params: {
      cambSourceText: sourceText = '',
      cambSourceLanguage: sourceLanguage = '1',
      cambTargetLanguage: targetLanguage = '139'
    }
  } = props as Props;

  if (!sourceText) {
    return Promise.reject({ message: '[CAMB AI] Source text is required' });
  }

  const apiKey = process.env.CAMB_API_KEY;
  if (!apiKey) {
    return Promise.reject({ message: '[CAMB AI] CAMB_API_KEY environment variable is required' });
  }

  const cambServer = useCambAiServer({ apiKey });

  const translatedTexts = await cambServer.translate({
    texts: [sourceText],
    source_language: Number(sourceLanguage),
    target_language: Number(targetLanguage)
  });

  const translatedText = translatedTexts[0] || '';

  return {
    data: {
      [NodeOutputKeyEnum.cambTranslatedText]: translatedText
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      sourceText,
      translatedText,
      sourceLanguage,
      targetLanguage
    }
  };
};
