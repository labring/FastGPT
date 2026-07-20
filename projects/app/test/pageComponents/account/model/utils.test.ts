import { describe, expect, it } from 'vitest';
import { normalizeModelFormData } from '@/pageComponents/account/model/utils';

describe('normalizeModelFormData', () => {
  it('removes empty optional number fields', () => {
    const data = {
      maxTemperature: '',
      batchSize: '',
      maxToken: '',
      charsPointsPrice: '',
      inputPrice: '',
      outputPrice: ''
    };

    expect(normalizeModelFormData(data)).toEqual({});
  });

  it('removes nullish and NaN values', () => {
    const data = {
      maxTemperature: Number.NaN,
      batchSize: null,
      maxToken: undefined,
      model: 'deepseek-v4-flash'
    };

    expect(normalizeModelFormData(data)).toEqual({ model: 'deepseek-v4-flash' });
  });

  it('preserves valid numbers and empty text fields', () => {
    const data = {
      maxTemperature: 0,
      batchSize: 1,
      defaultSystemChatPrompt: '',
      model: 'deepseek-v4-flash'
    };

    expect(normalizeModelFormData(data)).toEqual(data);
  });
});
