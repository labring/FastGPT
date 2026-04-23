import { describe, it, expect } from 'vitest';
import { sanitizeCsvField, generateCsv } from '@fastgpt/service/common/file/csv';

describe('sanitizeCsvField', () => {
  it('should return empty string for null/undefined', () => {
    expect(sanitizeCsvField(null as any)).toBe('');
    expect(sanitizeCsvField(undefined as any)).toBe('');
  });

  it('should return plain string unchanged', () => {
    expect(sanitizeCsvField('hello')).toBe('hello');
    expect(sanitizeCsvField('abc123')).toBe('abc123');
    expect(sanitizeCsvField('normal text')).toBe('normal text');
  });

  it('should prefix dangerous starting characters to prevent CSV injection', () => {
    expect(sanitizeCsvField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeCsvField('+cmd|')).toBe("'+cmd|");
    expect(sanitizeCsvField('-formula')).toBe("'-formula");
    expect(sanitizeCsvField('@import')).toBe("'@import");
    expect(sanitizeCsvField('|pipe')).toBe("'|pipe");
  });

  it('should wrap fields containing commas in quotes', () => {
    expect(sanitizeCsvField('hello,world')).toBe('"hello,world"');
  });

  it('should escape double quotes by doubling them', () => {
    expect(sanitizeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('should wrap fields containing newlines in quotes', () => {
    expect(sanitizeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(sanitizeCsvField('line1\rline2')).toBe('"line1\rline2"');
  });

  it('should handle both injection prefix and special characters', () => {
    // First adds prefix for dangerous char, then wraps in quotes for comma
    expect(sanitizeCsvField('=A1,B1')).toBe('"\'=A1,B1"');
  });

  it('should convert non-string types to string', () => {
    expect(sanitizeCsvField(123 as any)).toBe('123');
    expect(sanitizeCsvField(true as any)).toBe('true');
    expect(sanitizeCsvField(0 as any)).toBe('0');
  });

  it('should handle empty string', () => {
    expect(sanitizeCsvField('' as any)).toBe('');
  });
});

describe('generateCsv', () => {
  it('should generate CSV with headers and data', () => {
    const headers = ['Name', 'Age', 'City'];
    const data = [
      ['Alice', '30', 'Beijing'],
      ['Bob', '25', 'Shanghai']
    ];
    const result = generateCsv(headers, data);
    expect(result).toBe('Name,Age,City\nAlice,30,Beijing\nBob,25,Shanghai');
  });

  it('should generate CSV with only headers when data is empty', () => {
    const result = generateCsv(['A', 'B'], []);
    expect(result).toBe('A,B');
  });

  it('should sanitize headers and data cells', () => {
    const headers = ['=Formula', 'Normal'];
    const data = [['hello,world', '+cmd']];
    const result = generateCsv(headers, data);
    expect(result).toBe('\'=Formula,Normal\n"hello,world",\'+cmd');
  });

  it('should handle empty headers and data', () => {
    const result = generateCsv([], []);
    expect(result).toBe('');
  });

  it('should handle data with quotes and newlines', () => {
    const headers = ['Col'];
    const data = [['say "hi"'], ['line1\nline2']];
    const result = generateCsv(headers, data);
    expect(result).toBe('Col\n"say ""hi"""\n"line1\nline2"');
  });
});
