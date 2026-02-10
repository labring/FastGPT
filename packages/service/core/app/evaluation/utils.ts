import { evaluationFileErrors } from '@fastgpt/global/core/app/evaluation/constants';
import { getEvaluationFileHeader } from '@fastgpt/global/core/app/evaluation/utils';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import Papa from 'papaparse';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.APP);

export const parseEvaluationCSV = (rawText: string) => {
  const parseResult = Papa.parse(rawText.trim(), {
    skipEmptyLines: true,
    header: false,
    transformHeader: (header: string) => header.trim()
  });

  if (parseResult.errors.length > 0) {
    logger.error('CSV parsing failed', { errors: parseResult.errors });
    throw new Error('CSV parsing failed');
  }

  return parseResult.data as string[][];
};

export const validateEvaluationFile = async (
  rawText: string,
  appVariables?: VariableItemType[]
) => {
  // Parse CSV using Papa Parse
  const csvData = parseEvaluationCSV(rawText);
  const dataLength = csvData.length;

  // Validate file header
  const expectedHeader = getEvaluationFileHeader(appVariables);
  const actualHeader = csvData[0]?.join(',') || '';
  if (actualHeader !== expectedHeader) {
    logger.error('Evaluation file header mismatch', { expectedHeader, actualHeader });
    return Promise.reject(evaluationFileErrors);
  }

  // Validate data rows count
  if (dataLength <= 1) {
    logger.error('Evaluation file has no data rows');
    return Promise.reject(evaluationFileErrors);
  }

  const maxRows = 1000;
  if (dataLength - 1 > maxRows) {
    logger.error('Evaluation file exceeds max rows', {
      maxRows,
      rowCount: dataLength - 1
    });
    return Promise.reject(evaluationFileErrors);
  }

  const headers = csvData[0];

  // Get required field indices
  const requiredFields = headers
    .map((header, index) => ({ header: header.trim(), index }))
    .filter(({ header }) => header.startsWith('*'));

  const errors: string[] = [];

  // Validate each data row
  for (let i = 1; i < csvData.length; i++) {
    const values = csvData[i];

    // Check required fields
    requiredFields.forEach(({ header, index }) => {
      if (!values[index]?.trim()) {
        errors.push(`Row ${i + 1}: required field "${header}" is empty`);
      }
    });

    // Validate app variables
    if (appVariables) {
      validateRowVariables({
        values,
        variables: appVariables,
        rowNum: i + 1,
        errors
      });
    }
  }

  if (errors.length > 0) {
    logger.error('Evaluation file validation failed', { errors });
    return Promise.reject(evaluationFileErrors);
  }

  return { csvData, dataLength };
};

const validateRowVariables = ({
  values,
  variables,
  rowNum,
  errors
}: {
  values: string[];
  variables: VariableItemType[];
  rowNum: number;
  errors: string[];
}) => {
  variables.forEach((variable, index) => {
    const value = values[index]?.trim();

    // Skip validation if value is empty and not required
    if (!value && !variable.required) return;

    switch (variable.type) {
      case VariableInputEnum.input:
        // Validate string length
        if (variable.maxLength && value && value.length > variable.maxLength) {
          errors.push(
            `Row ${rowNum}: "${variable.label}" exceeds max length (${variable.maxLength})`
          );
        }
        break;

      case VariableInputEnum.numberInput:
        // Validate number type and range
        if (value) {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push(`Row ${rowNum}: "${variable.label}" must be a number`);
          } else {
            if (variable.min !== undefined && numValue < variable.min) {
              errors.push(`Row ${rowNum}: "${variable.label}" below minimum (${variable.min})`);
            }
            if (variable.max !== undefined && numValue > variable.max) {
              errors.push(`Row ${rowNum}: "${variable.label}" exceeds maximum (${variable.max})`);
            }
          }
        }
        break;

      case VariableInputEnum.select:
        // Validate select options
        if (value && variable.enums?.length) {
          const validOptions = variable.enums.map((item) => item.value);
          if (!validOptions.includes(value)) {
            errors.push(
              `Row ${rowNum}: "${variable.label}" invalid option. Valid: [${validOptions.join(', ')}]`
            );
          }
        }
        break;
    }
  });
};
