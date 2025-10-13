import { MongoEvalItem } from '../../task/schema';
import { Types } from '../../../../common/mongo';
import { addLog } from '../../../../common/system/log';
import { franc } from 'franc';
import { tify } from 'chinese-conv';

export enum LanguageType {
  English = 'en',
  SimplifiedChinese = 'zh-CN',
  TraditionalChinese = 'zh-TW'
}

// Language type to display name mapping
export const LanguageDisplayNameMap: Record<LanguageType, string> = {
  [LanguageType.English]: 'English',
  [LanguageType.SimplifiedChinese]: '简体中文',
  [LanguageType.TraditionalChinese]: '繁體中文'
};

interface LanguageDetectionResult {
  language: LanguageType;
}

function detectLanguageFromText(text: string): 'en' | 'zh-cn' | 'zh-tw' {
  const content = text || '';
  const lang = franc(content);
  addLog.debug('[LanguageUtil] franc detected language', { lang });

  if (lang === 'eng') {
    return 'en';
  }

  // detect result is cmn or has chinese characters
  if (lang === 'cmn' || /[\u4e00-\u9fff]/.test(content)) {
    const hant = tify(content);
    return content === hant ? 'zh-tw' : 'zh-cn';
  }

  return 'en';
}

/**
 * Convert language code to LanguageType enum
 */
function languageCodeToType(code: 'en' | 'zh-cn' | 'zh-tw'): LanguageType {
  switch (code) {
    case 'en':
      return LanguageType.English;
    case 'zh-cn':
      return LanguageType.SimplifiedChinese;
    case 'zh-tw':
      return LanguageType.TraditionalChinese;
    default:
      return LanguageType.SimplifiedChinese;
  }
}

// Detect primary language of evaluation user inputs
export async function detectEvaluationLanguage(evalId: string): Promise<LanguageDetectionResult> {
  try {
    addLog.info('[LanguageUtil] Starting language detection', { evalId });

    const evalItems = await MongoEvalItem.find(
      { evalId: new Types.ObjectId(evalId) },
      { 'dataItem.userInput': 1 }
    ).lean();

    if (!evalItems || evalItems.length === 0) {
      addLog.warn('[LanguageUtil] No evaluation items found', { evalId });
      return {
        language: LanguageType.SimplifiedChinese
      };
    }

    const userInputTexts = evalItems
      .map((item) => item.dataItem?.userInput || '')
      .filter((input) => input.trim().length > 0);

    if (userInputTexts.length === 0) {
      addLog.warn('[LanguageUtil] No user input text found', { evalId });
      return {
        language: LanguageType.SimplifiedChinese
      };
    }

    const combinedUserInput = userInputTexts.join('\n');
    const detectedLanguageCode = detectLanguageFromText(combinedUserInput);
    const language = languageCodeToType(detectedLanguageCode);

    addLog.info('[LanguageUtil] Language detection completed', {
      evalId,
      language
    });

    return {
      language
    };
  } catch (error) {
    addLog.error('[LanguageUtil] Language detection failed', {
      evalId,
      error
    });
    return {
      language: LanguageType.SimplifiedChinese
    };
  }
}
