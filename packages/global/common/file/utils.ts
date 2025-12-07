import path from 'path';

export const isCSVFile = (filename: string) => {
  const extension = path.extname(filename).toLowerCase();
  return extension === '.csv';
};
