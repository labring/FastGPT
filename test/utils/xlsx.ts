import { createRequire } from 'node:module';

const { read, utils, write } = createRequire(
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

export const writeXlsxFixture = (
  sheets: { name: string; rows: string[][]; merges?: string[] }[]
): Buffer => {
  const workbook = utils.book_new();
  for (const { name, rows, merges } of sheets) {
    const worksheet = utils.aoa_to_sheet(rows);
    if (merges) worksheet['!merges'] = merges.map((range) => utils.decode_range(range));
    utils.book_append_sheet(workbook, worksheet, name);
  }
  return write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
