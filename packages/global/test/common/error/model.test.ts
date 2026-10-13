import { describe, expect, it } from 'vitest';
import { isModelConfigError } from '../../../common/error/model';
import { ModelErrEnum } from '../../../common/error/code/model';
import { UserError } from '../../../common/error/utils';

describe('isModelConfigError', () => {
  it.each([ModelErrEnum.unExist, ModelErrEnum.unConfigured])(
    'recognizes the model error code %s regardless of display text',
    (code) => {
      expect(isModelConfigError(new UserError(code))).toBe(true);
      expect(isModelConfigError(new UserError(code, 'Model is disabled: Example'))).toBe(true);
    }
  );

  it.each([
    undefined,
    null,
    '',
    ModelErrEnum.unExist,
    new Error('request timeout'),
    new Error(ModelErrEnum.unExist),
    new UserError('unAuth'),
    new UserError('requestFailed', ModelErrEnum.unExist),
    { message: ModelErrEnum.unExist }
  ])('rejects unrelated or non-business errors (%s)', (error) => {
    expect(isModelConfigError(error)).toBe(false);
  });
});
