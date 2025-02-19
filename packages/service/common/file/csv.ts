export const generateCsv = (headers: string[], data: string[][]) => {
  const csv = [headers.join(','), ...data.map((row) => row.join(','))].join('\n');
  return csv;
};
