import { describe, expect, it } from 'vitest';
import { getEvaluationFileHeader } from '@fastgpt/global/core/app/evaluation/utils';
import type { VariableItemType } from '@fastgpt/global/core/app/type';

// Helper to create mock variable items
const createMockVariable = (key: string, required: boolean = false): VariableItemType =>
  ({
    key,
    required,
    label: key,
    type: 'input',
    description: ''
  }) as VariableItemType;

describe('getEvaluationFileHeader', () => {
  describe('when appVariables is undefined or empty', () => {
    it('should return default header when appVariables is undefined', () => {
      const result = getEvaluationFileHeader(undefined);
      expect(result).toBe('*q,*a,history');
    });

    it('should return default header when appVariables is empty array', () => {
      const result = getEvaluationFileHeader([]);
      expect(result).toBe('*q,*a,history');
    });
  });

  describe('when appVariables has items', () => {
    it('should prefix required variables with asterisk', () => {
      const variables = [createMockVariable('name', true)];
      const result = getEvaluationFileHeader(variables);
      expect(result).toBe('*name,*q,*a,history');
    });

    it('should not prefix optional variables with asterisk', () => {
      const variables = [createMockVariable('name', false)];
      const result = getEvaluationFileHeader(variables);
      expect(result).toBe('name,*q,*a,history');
    });

    it('should handle mixed required and optional variables', () => {
      const variables = [
        createMockVariable('requiredVar', true),
        createMockVariable('optionalVar', false),
        createMockVariable('anotherRequired', true)
      ];
      const result = getEvaluationFileHeader(variables);
      expect(result).toBe('*requiredVar,optionalVar,*anotherRequired,*q,*a,history');
    });

    it('should handle single optional variable', () => {
      const variables = [createMockVariable('optional', false)];
      const result = getEvaluationFileHeader(variables);
      expect(result).toBe('optional,*q,*a,history');
    });

    it('should handle multiple required variables', () => {
      const variables = [
        createMockVariable('var1', true),
        createMockVariable('var2', true),
        createMockVariable('var3', true)
      ];
      const result = getEvaluationFileHeader(variables);
      expect(result).toBe('*var1,*var2,*var3,*q,*a,history');
    });

    it('should handle multiple optional variables', () => {
      const variables = [createMockVariable('var1', false), createMockVariable('var2', false)];
      const result = getEvaluationFileHeader(variables);
      expect(result).toBe('var1,var2,*q,*a,history');
    });

    it('should preserve variable order', () => {
      const variables = [
        createMockVariable('first', true),
        createMockVariable('second', false),
        createMockVariable('third', true)
      ];
      const result = getEvaluationFileHeader(variables);
      expect(result).toBe('*first,second,*third,*q,*a,history');
    });
  });

  describe('edge cases', () => {
    it('should handle variable with empty key', () => {
      const variables = [createMockVariable('', true)];
      const result = getEvaluationFileHeader(variables);
      expect(result).toBe('*,*q,*a,history');
    });

    it('should handle variable with special characters in key', () => {
      const variables = [createMockVariable('user_name', true)];
      const result = getEvaluationFileHeader(variables);
      expect(result).toBe('*user_name,*q,*a,history');
    });
  });
});
