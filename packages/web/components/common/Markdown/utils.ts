/**
 * Export table data to CSV format
 * @param tableElement - HTML table element to export
 * @param filename - Name of the exported file (without extension)
 */
export const exportTableToCSV = (tableElement: HTMLTableElement, filename: string = 'table') => {
  const rows: string[][] = [];

  // Extract header rows
  const thead = tableElement.querySelector('thead');
  if (thead) {
    const headerRows = thead.querySelectorAll('tr');
    headerRows.forEach((row) => {
      const cells: string[] = [];
      row.querySelectorAll('th').forEach((cell) => {
        cells.push(escapeCsvCell(cell.textContent || ''));
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });
  }

  // Extract body rows
  const tbody = tableElement.querySelector('tbody');
  if (tbody) {
    const bodyRows = tbody.querySelectorAll('tr');
    bodyRows.forEach((row) => {
      const cells: string[] = [];
      row.querySelectorAll('td').forEach((cell) => {
        cells.push(escapeCsvCell(cell.textContent || ''));
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });
  }

  // Convert to CSV format
  const csvContent = rows.map((row) => row.join(',')).join('\n');

  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Trigger download
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Escape special characters in CSV cell content
 * @param cell - Cell content to escape
 * @returns Escaped cell content
 */
const escapeCsvCell = (cell: string): string => {
  // Remove leading/trailing whitespace
  let content = cell.trim();

  // If cell contains comma, double quote, or newline, wrap in quotes
  if (content.includes(',') || content.includes('"') || content.includes('\n')) {
    // Escape existing double quotes by doubling them
    content = content.replace(/"/g, '""');
    content = `"${content}"`;
  }

  return content;
};
