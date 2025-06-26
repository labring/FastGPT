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
