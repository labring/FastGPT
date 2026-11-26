import { createRequire } from 'node:module';

const { read, utils } = createRequire(
  new URL('../../packages/service/package.json', import.meta.url)
)('xlsx');

export const readXlsxRows = (buffer: Buffer): string[][] => {
  const workbook = read(buffer, { type: 'buffer' });
  return utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: '',
    raw: true
  });
};
