import Papa from 'papaparse';

/** 导出 API 的 title 沿用原先逗号分隔的表头契约。 */
export const parseCsvHeader = (title: string) =>
  Papa.parse<string[]>(title, { delimiter: ',' }).data[0] ?? [];
