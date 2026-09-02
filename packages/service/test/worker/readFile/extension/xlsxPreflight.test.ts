import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  preflightXlsx,
  type XlsxPreflightLimits
} from '@fastgpt/service/worker/readFile/extension/xlsxPreflight';

const defaultLimits: XlsxPreflightLimits = {
  maxRows: 3,
  maxColumns: 3,
  maxCells: 6,
  maxMergedCells: 4,
  maxUncompressedBytes: 1024 * 1024
};

const createZip = async (
  entries: Array<{
    path: string;
    content: string;
  }>
) => {
  const zip = new JSZip();
  entries.forEach(({ path, content }) => zip.file(path, content));
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
};

const findZipRecord = (buffer: Buffer, signature: number, fromEnd = false) => {
  const signatureBuffer = Buffer.allocUnsafe(4);
  signatureBuffer.writeUInt32LE(signature);
  const offset = fromEnd ? buffer.lastIndexOf(signatureBuffer) : buffer.indexOf(signatureBuffer);

  expect(offset).toBeGreaterThanOrEqual(0);
  return offset;
};

const worksheetXml = ({
  dimension,
  rows = '',
  merges = ''
}: {
  dimension?: string;
  rows?: string;
  merges?: string;
}) => `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${dimension ? `<dimension ref="${dimension}"/>` : ''}
  <sheetData>${rows}</sheetData>
  ${merges ? `<mergeCells>${merges}</mergeCells>` : ''}
</worksheet>`;

describe('preflightXlsx', () => {
  it('validates actual worksheet cells before SheetJS parsing', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({
          dimension: 'A1:B2',
          rows: '<row r="1"><c r="A1"/><c r="B1"/></row><row r="2"><c r="B2"/></row>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).resolves.toMatchObject({
      worksheetCount: 1,
      workbookCellCount: 4,
      workbookMergedCellCount: 0
    });
  });

  it('rejects cells outside a forged smaller dimension', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({
          dimension: 'A1:A1',
          rows: '<row r="1"><c r="A1"/></row><row r="2"><c r="B2"/></row>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'contains cells outside its declared range'
    );
  });

  it('uses real coordinates when dimension is missing', async () => {
    const buffer = await createZip([
      {
        path: 'custom/sheet.xml',
        content: worksheetXml({
          rows: '<row r="4"><c r="A4"/></row>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'maximum row limit of 3'
    );
  });

  it('recognizes a worksheet at a nonstandard OPC path', async () => {
    const buffer = await createZip([
      {
        path: 'custom/parts/data.bin',
        content: worksheetXml({
          dimension: 'A1',
          rows: '<row r="1"><c r="A1"/></row>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).resolves.toMatchObject({
      worksheetCount: 1,
      workbookCellCount: 1
    });
  });

  it('stops scanning a non-worksheet XML entry immediately after identifying its root', async () => {
    const buffer = await createZip([
      {
        path: 'xl/sharedStrings.xml',
        content: `<sst><si data-value="${'x'.repeat(20 * 1024)}"/></sst>`
      },
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({
          dimension: 'A1',
          rows: '<row r="1"><c r="A1"/></row>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).resolves.toMatchObject({
      worksheetCount: 1,
      workbookCellCount: 1
    });
  });

  it('rejects cumulative worksheet ranges above the workbook cell limit', async () => {
    const content = worksheetXml({
      dimension: 'A1:B2',
      rows: '<row r="1"><c r="A1"/></row>'
    });
    const buffer = await createZip([
      { path: 'xl/worksheets/sheet1.xml', content },
      { path: 'xl/worksheets/sheet2.xml', content }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'maximum cell limit of 6'
    );
  });

  it('rejects merge ranges outside the declared worksheet range', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({
          dimension: 'A1:A1',
          rows: '<row r="1"><c r="A1"/></row>',
          merges: '<mergeCell ref="A1:B1"/>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'merge range outside worksheet bounds'
    );
  });

  it('rejects cumulative merged-cell fills above the workbook limit', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({
          dimension: 'A1:C2',
          rows: '<row r="1"><c r="A1"/></row>',
          merges: '<mergeCell ref="A1:B1"/><mergeCell ref="A2:C2"/>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'maximum merged-cell fill limit of 4'
    );
  });

  it('ignores worksheet-looking tags inside comments and quoted attributes', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: `<?xml version="1.0"?>
          <!-- <c r="Z999"/> -->
          <worksheet data-note="1 > 0">
            <dimension ref="A1:A1"/>
            <sheetData><row r="1"><c r="A1"/></row></sheetData>
          </worksheet>`
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).resolves.toMatchObject({
      workbookCellCount: 1
    });
  });

  it('ignores worksheet-looking tags inside CDATA', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: `<worksheet>
          <dimension ref="A1:A1"/>
          <sheetData><row r="1"><c r="A1"><is><![CDATA[<c r="Z999"/>]]></is></c></row></sheetData>
        </worksheet>`
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).resolves.toMatchObject({
      workbookCellCount: 1
    });
  });

  it('rejects archive expansion above the configured byte budget', async () => {
    const content = worksheetXml({
      dimension: 'A1',
      rows: `<row r="1"><c r="A1"><v>${'x'.repeat(2048)}</v></c></row>`
    });
    const buffer = await createZip([{ path: 'xl/worksheets/sheet1.xml', content }]);

    await expect(
      preflightXlsx({
        buffer,
        limits: {
          ...defaultLimits,
          maxUncompressedBytes: 1024
        }
      })
    ).rejects.toThrow('maximum uncompressed data limit of 1024 bytes');
  });

  it('counts binary entries in the archive expansion budget', async () => {
    const worksheet = worksheetXml({
      dimension: 'A1',
      rows: '<row r="1"><c r="A1"/></row>'
    });
    const buffer = await createZip([
      { path: 'xl/worksheets/sheet1.xml', content: worksheet },
      { path: 'xl/media/image.bin', content: 'binary-data' }
    ]);

    await expect(
      preflightXlsx({
        buffer,
        limits: {
          ...defaultLimits,
          maxUncompressedBytes: Buffer.byteLength(worksheet) + Buffer.byteLength('binary-data') - 1
        }
      })
    ).rejects.toThrow('maximum uncompressed data limit');
  });

  it('uses streamed bytes when ZIP metadata understates the uncompressed size', async () => {
    const content = worksheetXml({
      dimension: 'A1',
      rows: `<row r="1"><c r="A1"><v>${'x'.repeat(2048)}</v></c></row>`
    });
    const buffer = await createZip([{ path: 'xl/worksheets/sheet1.xml', content }]);
    const forgedBuffer = Buffer.from(buffer);
    const centralDirectoryOffset = findZipRecord(forgedBuffer, 0x02014b50, true);
    forgedBuffer.writeUInt32LE(1, centralDirectoryOffset + 24);

    await expect(
      preflightXlsx({
        buffer: forgedBuffer,
        limits: {
          ...defaultLimits,
          maxUncompressedBytes: 1024
        }
      })
    ).rejects.toThrow();
  });

  it('supports implicit row and cell coordinates', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({
          dimension: 'A1:B1',
          rows: '<row><c/><c/></row>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).resolves.toMatchObject({
      workbookCellCount: 2
    });
  });

  it('rejects XML documents with a DOCTYPE declaration', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: '<!DOCTYPE worksheet><worksheet><sheetData/></worksheet>'
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'must not contain a DOCTYPE'
    );
  });

  it('rejects an XML tag above the scanner memory bound', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: `<worksheet data-value="${'x'.repeat(64 * 1024)}"></worksheet>`
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'XML tag exceeds the maximum length'
    );
  });

  it('rejects an unterminated XML tag', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: '<worksheet><sheetData'
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'contains an unterminated tag'
    );
  });

  it.each([
    {
      name: 'multiple dimensions',
      xml: '<worksheet><dimension ref="A1"/><dimension ref="A1"/></worksheet>',
      error: 'contains multiple dimensions'
    },
    {
      name: 'invalid row reference',
      xml: '<worksheet><sheetData><row r="0"/></sheetData></worksheet>',
      error: 'invalid row reference'
    },
    {
      name: 'cell without row context',
      xml: '<worksheet><sheetData><c/></sheetData></worksheet>',
      error: 'cell without a row reference'
    },
    {
      name: 'invalid cell reference',
      xml: '<worksheet><sheetData><row r="1"><c r="invalid"/></row></sheetData></worksheet>',
      error: 'invalid cell reference'
    },
    {
      name: 'invalid merge range',
      xml: '<worksheet><dimension ref="A1"/><mergeCells><mergeCell/></mergeCells></worksheet>',
      error: 'invalid merge range'
    },
    {
      name: 'merge without worksheet bounds',
      xml: '<worksheet><mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>',
      error: 'merge range outside worksheet bounds'
    }
  ])('rejects $name', async ({ xml, error }) => {
    const buffer = await createZip([{ path: 'xl/worksheets/sheet1.xml', content: xml }]);
    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(error);
  });

  it('rejects an actual cell above the column limit', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({ rows: '<row r="1"><c r="D1"/></row>' })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'maximum column limit of 3'
    );
  });

  it('rejects repeated row elements that exceed the row budget', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({
          rows: '<row r="1"/><row r="1"/><row r="1"/><row r="1"/>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'maximum row limit of 3'
    );
  });

  it('rejects repeated cell elements that exceed the cell budget', async () => {
    const cells = Array.from({ length: defaultLimits.maxCells + 1 }, () => '<c r="A1"/>').join('');
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({
          dimension: 'A1',
          rows: `<row r="1">${cells}</row>`
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'maximum cell limit of 6'
    );
  });

  it('accepts merged-cell fills exactly at the configured limit', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({
          dimension: 'A1:B2',
          rows: '<row r="1"><c r="A1"/></row>',
          merges: '<mergeCell ref="A1:B2"/>'
        })
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).resolves.toMatchObject({
      workbookMergedCellCount: 4
    });
  });

  it('rejects a forged ZIP entry count before reading entries', async () => {
    const buffer = await createZip([
      {
        path: 'xl/worksheets/sheet1.xml',
        content: worksheetXml({ dimension: 'A1' })
      }
    ]);
    const forgedBuffer = Buffer.from(buffer);
    const endRecordOffset = findZipRecord(forgedBuffer, 0x06054b50, true);
    forgedBuffer.writeUInt16LE(10001, endRecordOffset + 8);
    forgedBuffer.writeUInt16LE(10001, endRecordOffset + 10);

    await expect(preflightXlsx({ buffer: forgedBuffer, limits: defaultLimits })).rejects.toThrow(
      'maximum ZIP entry limit'
    );
  });

  it('rejects a damaged ZIP archive', async () => {
    await expect(
      preflightXlsx({ buffer: Buffer.from('not-a-zip'), limits: defaultLimits })
    ).rejects.toThrow();
  });

  it('rejects archives without worksheets', async () => {
    const buffer = await createZip([
      {
        path: 'xl/sharedStrings.xml',
        content: '<sst><si><t>value</t></si></sst>'
      }
    ]);

    await expect(preflightXlsx({ buffer, limits: defaultLimits })).rejects.toThrow(
      'does not contain a worksheet'
    );
  });
});
