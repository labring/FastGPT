import { describe, expect, it } from 'vitest';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import {
  parseEvaluationCSV,
  validateEvaluationFile
} from '@fastgpt/service/core/app/evaluation/utils';

describe('parseEvaluationCSV', () => {
  it('classifies malformed CSV as an expected evaluation file error', () => {
    expect(() => parseEvaluationCSV('*q,*a,history\n"unterminated')).toThrowError(
      new UserError(AppErrEnum.invalidEvaluationFile)
    );
  });
});

describe('validateEvaluationFile', () => {
  it.each([
    ['invalid header', 'q,a,history\nquestion,answer,'],
    ['no data rows', '*q,*a,history'],
    ['too many rows', '*q,*a,history\n' + Array(1001).fill('question,answer,').join('\n')],
    ['missing required question', '*q,*a,history\n,answer,']
  ])('returns the same stable business identifier for %s', async (_name, csv) => {
    await expect(validateEvaluationFile(csv)).rejects.toMatchObject({
      name: 'UserError',
      message: AppErrEnum.invalidEvaluationFile
    });
  });

  it('uses the same business identifier for variable constraint violations', async () => {
    const variable: VariableItemType = {
      key: 'name',
      label: 'Name',
      type: VariableInputEnum.input,
      description: '',
      required: true,
      maxLength: 2
    };
    await expect(
      validateEvaluationFile('*name,*q,*a,history\nlong,question,answer,', [variable])
    ).rejects.toMatchObject({ name: 'UserError', message: AppErrEnum.invalidEvaluationFile });
  });

  it.each([1, 1000])('accepts %i valid rows', async (rowCount) => {
    const csv = '*q,*a,history\n' + Array(rowCount).fill('question,answer,').join('\n');
    await expect(validateEvaluationFile(csv)).resolves.toMatchObject({ dataLength: rowCount + 1 });
  });

  it('registers a dedicated business code and HTTP 400 without renumbering existing app errors', () => {
    expect(ERROR_RESPONSE[AppErrEnum.invalidEvaluationFile]).toMatchObject({
      code: 502008,
      statusText: AppErrEnum.invalidEvaluationFile,
      message: 'dashboard_evaluation:eval_file_check_error',
      httpStatus: 400
    });
    expect(ERROR_RESPONSE[AppErrEnum.parentFolderTypeMismatch].code).toBe(502007);
  });
});
