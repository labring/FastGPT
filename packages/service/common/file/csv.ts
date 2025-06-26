// Function to escape CSV fields to prevent injection attacks
export const escapeCsvField = (field: any): string => {
  if (field == null) return '';

  let fieldStr = String(field);

  // Check for dangerous starting characters
  if (fieldStr.match(/^[\=\+\-\@\|]/)) {
    // Add prefix to neutralize
    fieldStr = `'${fieldStr}`;
  }

  // Handle special characters
  if (
    fieldStr.includes(',') ||
    fieldStr.includes('"') ||
    fieldStr.includes('\n') ||
    fieldStr.includes('\r')
  ) {
    // Escape quotes and wrap field
    fieldStr = `"${fieldStr.replace(/"/g, '""')}"`;
  }

  return fieldStr;
};

export const generateCsv = (headers: string[], data: string[][]) => {
  const escapedHeaders = headers.map((header) => escapeCsvField(header));
  const escapedData = data.map((row) => row.map((cell) => escapeCsvField(cell)));

  const csv = [escapedHeaders.join(','), ...escapedData.map((row) => row.join(','))].join('\n');
  return csv;
};
