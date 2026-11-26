/**
 * Copyright 2018 Apify Technologies s.r.o.
 * Licensed under Apache-2.0. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * OOXML templates adapted from apify/xlsx-stream at 3b7a0a12da1a7cf516da11350da693ab51c5ccff.
 *
 * Changes: TypeScript, ordered worksheet parts, inline text only, and lossless text escaping.
 */

const spreadsheetNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export const worksheetStart = xmlHeader + `<worksheet xmlns="${spreadsheetNamespace}"><sheetData>`;
export const worksheetEnd = '</sheetData></worksheet>';
export const XLSX_MAX_COLUMNS = 16_384;
const unpairedSurrogate = /[\uD800-\uDFFF]/u;

const documentRelationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
const spreadsheetContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

/** 为每张表分配稳定的 ID 和 ZIP 路径，工作簿、关系及内容类型共用同一份清单。 */
export function planWorkbook(names: readonly string[]) {
  if (names.length === 0 || names.length > 65_534) {
    throw new Error('工作簿须包含 1 至 65,534 张工作表');
  }

  const seen = new Set<string>();
  const worksheets = names.map((name, index) => {
    const key = name.toUpperCase();
    if (
      name.trim() === '' ||
      name.length > 31 ||
      unpairedSurrogate.test(name) ||
      /[\\/?*:[\]\u0000-\u001F\u007F]/u.test(name) ||
      name.startsWith("'") ||
      name.endsWith("'") ||
      key === 'HISTORY'
    ) {
      throw new Error(`无效工作表名称 ${JSON.stringify(name)}`);
    }
    if (seen.has(key)) {
      throw new Error(`工作表名称重复 ${JSON.stringify(name)}`);
    }
    seen.add(key);

    const id = index + 1;
    const target = `worksheets/sheet${id}.xml`;
    return { name, id, relationshipId: `rId${id}`, target, path: `xl/${target}` };
  });

  const overrides = worksheets
    .map(
      ({ path }) =>
        `<Override PartName="/${path}" ContentType="${spreadsheetContentType}.worksheet+xml"/>`
    )
    .join('');
  const declarations = worksheets
    .map(
      ({ name, id, relationshipId }) =>
        `<sheet name="${encodeText(name)}" sheetId="${id}" r:id="${relationshipId}"/>`
    )
    .join('');
  const links = worksheets
    .map(
      ({ relationshipId, target }) =>
        `<Relationship Id="${relationshipId}" Type="${documentRelationships}/worksheet" Target="${target}"/>`
    )
    .join('');

  const metadata = [
    {
      path: '[Content_Types].xml',
      xml: `${xmlHeader}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="${spreadsheetContentType}.sheet.main+xml"/>
  ${overrides}
</Types>`
    },
    {
      path: '_rels/.rels',
      xml: `${xmlHeader}
<Relationships xmlns="${packageRelationships}">
  <Relationship Id="rId1" Type="${documentRelationships}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      path: 'xl/workbook.xml',
      xml: `${xmlHeader}
<workbook xmlns="${spreadsheetNamespace}" xmlns:r="${documentRelationships}">
  <sheets>${declarations}</sheets>
</workbook>`
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      xml: xmlHeader + `<Relationships xmlns="${packageRelationships}">${links}</Relationships>`
    }
  ];

  return { worksheets, metadata };
}

/** 将业务文本序列化为一行，校验工作表的行列范围。 */
export function encodeWorksheetRow(
  { sheet, rowNumber }: { sheet: string; rowNumber: number },
  values: readonly string[]
) {
  if (rowNumber > 1_048_576) {
    throw new Error(`${sheet} 第 ${rowNumber} 行超过 Excel 工作表行数上限`);
  }
  if (values.length > XLSX_MAX_COLUMNS) {
    throw new Error(`${sheet} 第 ${rowNumber} 行超过 Excel 工作表列数上限`);
  }

  const cells: string[] = [];
  for (const [index, value] of values.entries()) {
    const address = `${columnName(index + 1)}${rowNumber}`;
    if (typeof value !== 'string' || unpairedSurrogate.test(value)) {
      throw new Error(`${sheet}!${address} 需要有效的 Unicode 文本`);
    }
    // Excel 客户端有单格 32,767 字符和 253 个换行的限制，OOXML 可承载更长文本，原文完整写入。
    cells.push(
      `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${encodeText(value)}</t></is></c>`
    );
  }
  return `<row r="${rowNumber}">${cells.join('')}</row>`;
}

const xmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
};

function encodeText(value: string): string {
  // 同一遍处理字面量转义标记和控制字符，避免重复转义这一遍新生成的标记。
  return value
    .replace(
      /_(?=x[0-9a-f]{4}_)|[\u0000-\u0008\u000B-\u001F\uFFFE\uFFFF]/gi,
      (character) => `_x${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`
    )
    .replace(/[&<>"']/g, (character) => xmlEntities[character]);
}

function columnName(number: number): string {
  let name = '';
  while (number > 0) {
    number -= 1;
    name = String.fromCharCode(65 + (number % 26)) + name;
    number = Math.floor(number / 26);
  }
  return name;
}
