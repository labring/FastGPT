import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  LanguageType,
  detectEvaluationLanguage
} from '@fastgpt/service/core/evaluation/summary/util/languageUtil';

const mockFind = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/evaluation/task/schema', () => ({
  MongoEvalItem: {
    find: mockFind
  }
}));

vi.mock('@fastgpt/service/common/mongo', () => ({
  Types: {
    ObjectId: class {
      value: string;
      constructor(value: string) {
        this.value = value;
      }
    }
  }
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('languageUtil.detectEvaluationLanguage', () => {
  beforeEach(() => {
    mockFind.mockReset();
  });

  test('returns defaults when no evaluation items are found', async () => {
    const leanMock = vi.fn().mockResolvedValue([]);
    mockFind.mockReturnValue({ lean: leanMock });

    const result = await detectEvaluationLanguage('test-eval-id');

    expect(result.language).toBe(LanguageType.SimplifiedChinese);
  });

  test('detects English language from concatenated user inputs', async () => {
    const userInputs = [
      'Hello world this is a language detection test to provide enough context',
      'Another sentence ensures franc recognises the English language correctly'
    ];
    const leanMock = vi
      .fn()
      .mockResolvedValue(userInputs.map((text) => ({ dataItem: { userInput: text } })));
    mockFind.mockReturnValue({ lean: leanMock });

    const result = await detectEvaluationLanguage('english-eval-id');

    expect(result.language).toBe(LanguageType.English);
  });

  test('detects simplified Chinese language when conversion differs from original text', async () => {
    const userInputs = ['机器学习可以改变世界', '人工智能推动科技发展'];
    const leanMock = vi
      .fn()
      .mockResolvedValue(userInputs.map((text) => ({ dataItem: { userInput: text } })));
    mockFind.mockReturnValue({ lean: leanMock });

    const result = await detectEvaluationLanguage('chinese-eval-id');

    expect(result.language).toBe(LanguageType.SimplifiedChinese);
  });

  test('detects traditional Chinese language when text remains unchanged after conversion', async () => {
    const userInputs = ['繁體字樣展示傳統文化', '學習漢字的奧秘與歷史'];
    const leanMock = vi
      .fn()
      .mockResolvedValue(userInputs.map((text) => ({ dataItem: { userInput: text } })));
    mockFind.mockReturnValue({ lean: leanMock });

    const result = await detectEvaluationLanguage('trad-eval-id');

    expect(result.language).toBe(LanguageType.TraditionalChinese);
  });
});
