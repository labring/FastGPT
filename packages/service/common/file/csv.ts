import xlsx from 'node-xlsx';
import Papa from 'papaparse';

// Function to escape CSV fields to prevent injection attacks
export const sanitizeCsvField = (field: String): string => {
  if (field == null) return '';

  let fieldStr = String(field);

  // Check for dangerous starting characters that could cause CSV injection
  if (fieldStr.match(/^[\=\+\-\@\|]/)) {
    // Add prefix to neutralize potential formula injection
    fieldStr = `'${fieldStr}`;
  }

  // Handle special characters that need escaping in CSV
  if (
    fieldStr.includes(',') ||
    fieldStr.includes('"') ||
    fieldStr.includes('\n') ||
    fieldStr.includes('\r')
  ) {
    // Escape quotes and wrap field in quotes
    fieldStr = `"${fieldStr.replace(/"/g, '""')}"`;
  }

  return fieldStr;
};

export const generateCsv = (headers: string[], data: string[][]) => {
  const sanitizedHeaders = headers.map((header) => sanitizeCsvField(header));
  const sanitizedData = data.map((row) => row.map((cell) => sanitizeCsvField(cell)));

  const csv = [sanitizedHeaders.join(','), ...sanitizedData.map((row) => row.join(','))].join('\n');
  return csv;
};

/**
 * 将Excel buffer转换为CSV字符串（通用版本）
 * 只读取第一个sheet
 * @param buffer - Excel文件buffer
 * @returns CSV字符串，如果文件为空则返回空字符串
 */
export function excelBufferToCSV(buffer: Buffer): string {
  const sheets = xlsx.parse(buffer, {
    skipHidden: false,
    defval: ''
  });

  if (sheets.length === 0 || !sheets[0].data || sheets[0].data.length === 0) {
    return '';
  }

  return Papa.unparse(sheets[0].data, {
    quotes: false,
    delimiter: ',',
    newline: '\n'
  });
}
