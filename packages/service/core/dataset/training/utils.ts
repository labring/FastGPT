import Papa from 'papaparse';

export const parseCsvTable2Chunks = (rawText: string) => {
  const csvArr = Papa.parse(rawText).data as string[][];

  const chunks = csvArr
    .map((item) => ({
      q: item[0] || '',
      a: item[1] || ''
    }))
    .filter((item) => item.q || item.a);

  return {
    chunks
  };
};
