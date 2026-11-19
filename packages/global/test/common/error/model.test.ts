import { describe, expect, it } from 'vitest';
import { isModelConfigError, isNonRetryableModelError } from '../../../common/error/model';
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

describe('isNonRetryableModelError', () => {
  it.each([
    ModelErrEnum.unExist,
    ModelErrEnum.unConfigured,
    ModelErrEnum.noAvailableChannel,
    ModelErrEnum.authFailed,
    ModelErrEnum.upstreamQuotaExceeded,
    ModelErrEnum.permissionDenied,
    ModelErrEnum.modelNotFound,
    ModelErrEnum.contentBlocked,
    ModelErrEnum.inputTooLong,
    ModelErrEnum.invalidImage,
    ModelErrEnum.invalidRequest,
    ModelErrEnum.privateEndpointBlocked,
    ModelErrEnum.embeddingEmptyInput
  ])('recognizes non-retryable model error code %s as string or Error', (code) => {
    expect(isNonRetryableModelError(code)).toBe(true);
    expect(isNonRetryableModelError(new Error(code))).toBe(true);
    expect(isNonRetryableModelError(new UserError(code))).toBe(true);
  });

  it.each([
    ModelErrEnum.rateLimited,
    ModelErrEnum.requestTimeout,
    ModelErrEnum.serviceUnavailable,
    ModelErrEnum.networkError,
    ModelErrEnum.invalidResponse,
    ModelErrEnum.imageDownloadFailed
  ])('keeps transient model error code %s retryable by default', (code) => {
    expect(isNonRetryableModelError(code)).toBe(false);
    expect(isNonRetryableModelError(new Error(code))).toBe(false);
  });

  it('prioritizes explicit retryable flag on EmbeddingRequestError-like objects', () => {
    expect(
      isNonRetryableModelError({
        name: 'EmbeddingRequestError',
        message: ModelErrEnum.imageDownloadFailed,
        retryable: false
      })
    ).toBe(true);
    expect(
      isNonRetryableModelError({
        name: 'EmbeddingRequestError',
        message: ModelErrEnum.imageDownloadFailed,
        retryable: true
      })
    ).toBe(false);
    expect(
      isNonRetryableModelError({
        name: 'EmbeddingRequestError',
        message: ModelErrEnum.invalidRequest,
        retryable: true
      })
    ).toBe(false);
  });

  it.each([undefined, null, '', new Error('stage failed'), { message: 'unknown error' }])(
    'keeps unclassified errors retryable (%s)',
    (error) => {
      expect(isNonRetryableModelError(error)).toBe(false);
    }
  );
});
