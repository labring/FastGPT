import Papa from 'papaparse';

// Interface for CSV row data structure
export interface CSVRow {
  user_input: string;
  expected_output: string;
  actual_output?: string;
  context?: string;
  retrieval_context?: string;
  metadata?: string;
}

// Required CSV columns that must be present
export const REQUIRED_CSV_COLUMNS = ['user_input', 'expected_output'] as const;

// Optional CSV columns that can be present
export const OPTIONAL_CSV_COLUMNS = [
  'actual_output',
  'context',
  'retrieval_context',
  'metadata'
] as const;

// All valid CSV columns
export const CSV_COLUMNS = [...REQUIRED_CSV_COLUMNS, ...OPTIONAL_CSV_COLUMNS] as const;

// Enum to CSV mapping for header normalization
export const ENUM_TO_CSV_MAPPING = {
  userInput: 'user_input',
  expectedOutput: 'expected_output',
  actualOutput: 'actual_output',
  context: 'context',
  retrievalContext: 'retrieval_context'
} as const;

/**
 * Normalize header names by mapping enum values to CSV column names
 * @param header - The header string to normalize
 * @returns The normalized header name
 */
function normalizeHeaderName(header: string): string {
  // For most CSV files, headers should be used as-is
  // Only apply mapping if the header matches an enum value exactly
  const mappedValue = ENUM_TO_CSV_MAPPING[header as keyof typeof ENUM_TO_CSV_MAPPING];
  return mappedValue || header;
}

/**
 * Parse CSV content using Papa Parse with optimized performance settings
 * @param csvContent - The raw CSV content string
 * @returns Array of parsed CSV rows
 * @throws Error if CSV parsing fails or required columns are missing
 */
export function parseCSVContent(csvContent: string): CSVRow[] {
  if (!csvContent.trim()) {
    return [];
  }

  // Parse CSV with Papa Parse for optimal performance
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    fastMode: false, // Disable fastMode to handle complex quoted fields
    transformHeader: (header: string) => {
      // Remove quotes and normalize header names
      const cleanHeader = header.replace(/^"|"$/g, '').trim();
      return normalizeHeaderName(cleanHeader);
    }
  });

  if (parseResult.errors.length > 0) {
    const error = parseResult.errors[0];
    throw new Error(`CSV parsing error at row ${error.row + 1}: ${error.message}`);
  }

  const data = parseResult.data as Record<string, string>[];

  if (data.length === 0) {
    return [];
  }

  // Get normalized headers from the first data row
  const headers = Object.keys(data[0]);

  // Validate CSV structure
  const missingColumns = REQUIRED_CSV_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    throw new Error(`CSV file is missing required columns: ${missingColumns.join(', ')}`);
  }

  // Convert to CSVRow format
  const rows: CSVRow[] = data.map((rowData) => {
    const row: CSVRow = {
      user_input: (rowData.user_input || '').trim(),
      expected_output: (rowData.expected_output || '').trim()
    };

    // Add optional fields if they exist
    if ('actual_output' in rowData) {
      row.actual_output = (rowData.actual_output || '').trim();
    }
    if ('context' in rowData) {
      row.context = (rowData.context || '').trim();
    }
    if ('retrieval_context' in rowData) {
      row.retrieval_context = (rowData.retrieval_context || '').trim();
    }
    if ('metadata' in rowData) {
      row.metadata = (rowData.metadata || '{}').trim();
    }

    return row;
  });

  return rows;
}
