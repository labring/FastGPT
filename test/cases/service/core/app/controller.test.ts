import { describe, expect, it } from 'vitest';
import {
  beforeUpdateAppFormat,
  validateAppChatConfigVariables
} from '@fastgpt/service/core/app/controller';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

const createChatConfig = (keys: string[]) => ({
  variables: keys.map((key) => ({
    key,
    label: key,
    type: VariableInputEnum.input,
    description: ''
  }))
});

describe('validateAppChatConfigVariables', () => {
  it('accepts valid variable keys', () => {
    expect(() =>
      validateAppChatConfigVariables(createChatConfig(['customer_name', 'contact_email']) as any)
    ).not.toThrow();
  });

  it('rejects duplicate variable keys', () => {
    expect(() =>
      validateAppChatConfigVariables(createChatConfig(['customer_name', 'customer_name']) as any)
    ).toThrow(CommonErrEnum.invalidParams);
  });

  it('rejects invalid variable keys', () => {
    expect(() =>
      validateAppChatConfigVariables(createChatConfig(['customer-name']) as any)
    ).toThrow(CommonErrEnum.invalidParams);
  });

  it('rejects system variable keys', () => {
    expect(() => validateAppChatConfigVariables(createChatConfig(['userId']) as any)).toThrow(
      CommonErrEnum.invalidParams
    );
  });
});

describe('beforeUpdateAppFormat', () => {
  it('validates chat config variables even when nodes are empty', () => {
    expect(() =>
      beforeUpdateAppFormat({
        nodes: [],
        chatConfig: createChatConfig(['chatId'])
      })
    ).toThrow(CommonErrEnum.invalidParams);
  });
});
