import {
  DatasetSynonymLimits,
  type DatasetSynonymInputMappingType,
  type DatasetSynonymMappingMetadataType,
  type NormalizedSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const supportedExtensions = new Set(['csv', 'xls', 'xlsx']);
const standardizedTermHeaders = new Set(['标准词', '标准术语', 'standard', 'standardizedterm']);
const synonymHeaderReg = /^(同义词\d*|synonym(?:terms?)?\d*)$/i;
const controlCharacterReg = /[\u0000-\u001f\u007f]/u;
const latinNumberOrUnderscoreReg = /[\p{Script=Latin}\p{N}_]/u;

export type ParsedSynonymRow = {
  rowNumber: number;
  standardizedTerm: string;
  synonymTerms: string[];
};

export type DatasetSynonymMatcherMapping = {
  logicalMappingId: string;
  datasetId: string;
  fileVersion: number;
  standardizedTerm: string;
  normalizedStandardizedTerm: string;
  synonymTerms: string[];
  normalizedSynonymTerms: string[];
};

type MatcherTerminal = {
  mapping: DatasetSynonymMatcherMapping;
  normalizedTerm: string;
  isSynonym: boolean;
};

type MatcherNode = {
  children: Map<string, MatcherNode>;
  terminals: MatcherTerminal[];
};

export type DatasetSynonymMatcher = {
  transform(text: string): {
    transformedText: string;
    usedMappings: DatasetSynonymMappingMetadataType[];
  };
};

export class DatasetSynonymValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unsupported_extension'
      | 'file_too_large'
      | 'invalid_file'
      | 'invalid_term'
      | 'too_many_mappings'
      | 'too_many_terms'
      | 'term_too_long'
      | 'mapping_conflict',
    readonly rowNumber?: number
  ) {
    super(message);
    this.name = 'DatasetSynonymValidationError';
  }
}

/**
 * 生成同义词匹配键。首版只统一 ASCII 英文字母大小写，保留内部空白和其他
 * Unicode 字符，确保 Mongo 粗筛与 worker 精确匹配使用相同语义。
 */
export const normalizeSynonymTerm = (term: string) =>
  term.trim().replace(/[A-Z]/g, (char) => char.toLowerCase());

const validateTerm = ({ term, rowNumber }: { term: string; rowNumber: number }) => {
  if (!term.trim()) {
    throw new DatasetSynonymValidationError(
      `第 ${rowNumber} 行包含空白词条`,
      'invalid_term',
      rowNumber
    );
  }
  if (controlCharacterReg.test(term)) {
    throw new DatasetSynonymValidationError(
      `第 ${rowNumber} 行包含不支持的控制字符`,
      'invalid_term',
      rowNumber
    );
  }
  if (Array.from(term).length > DatasetSynonymLimits.maxTermLength) {
    throw new DatasetSynonymValidationError(
      `第 ${rowNumber} 行的词条超过 ${DatasetSynonymLimits.maxTermLength} 个字符`,
      'term_too_long',
      rowNumber
    );
  }
};

const parseCsvRows = (buffer: Buffer): unknown[][] => {
  const text = (() => {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new DatasetSynonymValidationError('CSV 文件必须使用 UTF-8 编码', 'invalid_file');
    }
  })();
  const result = Papa.parse<unknown[]>(text.replace(/^\uFEFF/, ''), {
    delimiter: ',',
    skipEmptyLines: false
  });
  const firstError = result.errors[0];
  if (firstError) {
    throw new DatasetSynonymValidationError(
      `CSV 解析失败: ${firstError.message}`,
      'invalid_file',
      firstError.row === undefined ? undefined : firstError.row + 1
    );
  }
  return result.data;
};

const parseExcelRows = ({
  buffer,
  extension
}: {
  buffer: Buffer;
  extension: string;
}): unknown[][] => {
  const isXlsx = extension === 'xlsx' && buffer.subarray(0, 2).equals(Buffer.from('PK'));
  const isXls =
    extension === 'xls' &&
    buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!isXlsx && !isXls) {
    throw new DatasetSynonymValidationError('Excel 文件签名无效', 'invalid_file');
  }

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
    if (!worksheet) return [];

    return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: true,
      raw: false
    });
  } catch {
    throw new DatasetSynonymValidationError('Excel 文件解析失败', 'invalid_file');
  }
};

/** 解析同义词文件的首个工作表，并转换为带源行号的统一行结构。 */
export const parseSynonymFileRows = ({
  buffer,
  extension
}: {
  buffer: Buffer;
  extension: string;
}): ParsedSynonymRow[] => {
  const normalizedExtension = extension.replace(/^\./, '').toLowerCase();
  if (!supportedExtensions.has(normalizedExtension)) {
    throw new DatasetSynonymValidationError(
      `不支持的同义词文件格式: ${extension}`,
      'unsupported_extension'
    );
  }
  if (buffer.byteLength > DatasetSynonymLimits.maxFileSize) {
    throw new DatasetSynonymValidationError(
      `同义词文件不能超过 ${DatasetSynonymLimits.maxFileSize} bytes`,
      'file_too_large'
    );
  }

  const rows =
    normalizedExtension === 'csv'
      ? parseCsvRows(buffer)
      : parseExcelRows({ buffer, extension: normalizedExtension });

  const headerCells = Array.isArray(rows[0])
    ? rows[0].map((cell) => String(cell ?? '').trim())
    : [];
  const standardizedTermHeader = headerCells[0]?.toLowerCase();
  const synonymHeaders = headerCells.slice(1).filter(Boolean);
  if (
    !standardizedTermHeader ||
    !standardizedTermHeaders.has(standardizedTermHeader) ||
    synonymHeaders.length === 0 ||
    synonymHeaders.some((header) => !synonymHeaderReg.test(header))
  ) {
    throw new DatasetSynonymValidationError(
      '第 1 行必须是“标准词/标准术语 + 同义词”表头',
      'invalid_file',
      1
    );
  }

  return rows.slice(1).flatMap((row, index) => {
    const rowNumber = index + 2;
    const cells = Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : [];
    const standardizedTerm = cells[0] ?? '';
    const synonymTerms = cells.slice(1).filter(Boolean);

    if (cells.every((cell) => !cell)) return [];
    if (!standardizedTerm || synonymTerms.length === 0) {
      throw new DatasetSynonymValidationError(
        `第 ${rowNumber} 行必须同时包含标准词和至少一个同义词`,
        'invalid_file',
        rowNumber
      );
    }
    return [{ rowNumber, standardizedTerm, synonymTerms }];
  });
};

/**
 * 合并重复标准词并执行强映射校验。任意规范化 term 只能归属一个标准词组，
 * 从数据源头阻止级联、闭环和一个同义词映射到多个标准词。
 */
export const normalizeSynonymMappings = (
  rows: ParsedSynonymRow[]
): NormalizedSynonymMappingType[] => {
  type PendingMapping = {
    standardizedTerm: string;
    normalizedStandardizedTerm: string;
    synonymTermMap: Map<string, string>;
    sourceRows: number[];
  };

  const mappingMap = new Map<string, PendingMapping>();

  for (const row of rows) {
    const standardizedTerm = row.standardizedTerm.trim();
    const normalizedStandardizedTerm = normalizeSynonymTerm(standardizedTerm);
    validateTerm({ term: standardizedTerm, rowNumber: row.rowNumber });

    const mapping = (() => {
      const existing = mappingMap.get(normalizedStandardizedTerm);
      if (existing) {
        existing.sourceRows.push(row.rowNumber);
        return existing;
      }
      const created: PendingMapping = {
        standardizedTerm,
        normalizedStandardizedTerm,
        synonymTermMap: new Map(),
        sourceRows: [row.rowNumber]
      };
      mappingMap.set(normalizedStandardizedTerm, created);
      return created;
    })();

    for (const synonymTerm of row.synonymTerms) {
      const normalizedSynonymTerm = normalizeSynonymTerm(synonymTerm);
      validateTerm({ term: synonymTerm, rowNumber: row.rowNumber });
      if (normalizedSynonymTerm === normalizedStandardizedTerm) {
        throw new DatasetSynonymValidationError(
          `第 ${row.rowNumber} 行的标准词不能同时作为本组同义词: ${synonymTerm}`,
          'mapping_conflict',
          row.rowNumber
        );
      }
      if (!mapping.synonymTermMap.has(normalizedSynonymTerm)) {
        mapping.synonymTermMap.set(normalizedSynonymTerm, synonymTerm.trim());
      }
    }
  }

  if (mappingMap.size > DatasetSynonymLimits.maxMappings) {
    throw new DatasetSynonymValidationError(
      `同义词映射不能超过 ${DatasetSynonymLimits.maxMappings} 组`,
      'too_many_mappings'
    );
  }

  const termOwnerMap = new Map<string, { standardizedTerm: string; rowNumber: number }>();
  let termCount = 0;
  let totalTermCodePoints = 0;

  for (const mapping of mappingMap.values()) {
    const terms = [mapping.normalizedStandardizedTerm, ...mapping.synonymTermMap.keys()];
    termCount += terms.length;
    totalTermCodePoints += terms.reduce((sum, term) => sum + Array.from(term).length, 0);

    for (const term of terms) {
      const owner = termOwnerMap.get(term);
      if (owner && owner.standardizedTerm !== mapping.normalizedStandardizedTerm) {
        const currentRow = mapping.sourceRows[0]!;
        throw new DatasetSynonymValidationError(
          `第 ${currentRow} 行的词条与第 ${owner.rowNumber} 行冲突: ${term}`,
          'mapping_conflict',
          currentRow
        );
      }
      termOwnerMap.set(term, {
        standardizedTerm: mapping.normalizedStandardizedTerm,
        rowNumber: mapping.sourceRows[0]!
      });
    }
  }

  if (termCount > DatasetSynonymLimits.maxTerms) {
    throw new DatasetSynonymValidationError(
      `标准词和同义词总数不能超过 ${DatasetSynonymLimits.maxTerms}`,
      'too_many_terms'
    );
  }
  if (totalTermCodePoints > DatasetSynonymLimits.maxTotalTermCodePoints) {
    throw new DatasetSynonymValidationError(
      `标准词和同义词总长度不能超过 ${DatasetSynonymLimits.maxTotalTermCodePoints} 个字符`,
      'term_too_long'
    );
  }

  return [...mappingMap.values()].map((mapping) => {
    const normalizedSynonymTerms = [...mapping.synonymTermMap.keys()].sort();
    const synonymTerms = normalizedSynonymTerms.map((term) => mapping.synonymTermMap.get(term)!);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([mapping.standardizedTerm, normalizedSynonymTerms]))
      .digest('hex');

    return {
      standardizedTerm: mapping.standardizedTerm,
      normalizedStandardizedTerm: mapping.normalizedStandardizedTerm,
      synonymTerms,
      normalizedSynonymTerms,
      allTerms: [mapping.standardizedTerm, ...synonymTerms].join(' '),
      fingerprint,
      sourceRows: mapping.sourceRows
    };
  });
};

/** 将 API mappings 输入转换为与文件解析完全一致的规范化快照。 */
export const normalizeSynonymInputMappings = (mappings: DatasetSynonymInputMappingType[]) => {
  const normalized = normalizeSynonymMappings(
    mappings.map((mapping, index) => ({
      rowNumber: index + 1,
      standardizedTerm: mapping.standardizedTerm,
      synonymTerms: mapping.synonymTerms
    }))
  );
  if (normalized.length === 0) {
    throw new DatasetSynonymValidationError('同义词列表没有有效映射', 'invalid_file');
  }
  return normalized;
};

const escapeCsvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** 从 Mongo mapping 快照生成带 UTF-8 BOM 的规范 CSV，不保留原始表格格式。 */
export const serializeSynonymMappingsToCsv = (
  mappings: Array<Pick<NormalizedSynonymMappingType, 'standardizedTerm' | 'synonymTerms'>>
) => {
  const maxSynonymCount = Math.max(1, ...mappings.map((mapping) => mapping.synonymTerms.length));
  const header = ['标准术语', ...Array.from({ length: maxSynonymCount }, () => '同义词')];
  const rows = mappings.map((mapping) => [mapping.standardizedTerm, ...mapping.synonymTerms]);
  return `\uFEFF${[header, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\r\n')}\r\n`;
};

/** 解析并规范化 CSV、XLS 或 XLSX 同义词文件。 */
export const parseSynonymFile = (params: {
  buffer: Buffer;
  extension: string;
}): NormalizedSynonymMappingType[] => {
  const mappings = normalizeSynonymMappings(parseSynonymFileRows(params));
  if (mappings.length === 0) {
    throw new DatasetSynonymValidationError('同义词文件没有有效映射', 'invalid_file');
  }
  return mappings;
};

const normalizeMatchCharacter = (character: string) =>
  /^[A-Z]$/.test(character) ? character.toLowerCase() : character;

const hasValidBoundary = ({
  characters,
  start,
  end,
  normalizedTerm
}: {
  characters: string[];
  start: number;
  end: number;
  normalizedTerm: string;
}) => {
  const termCharacters = Array.from(normalizedTerm);
  const firstCharacter = termCharacters[0];
  const lastCharacter = termCharacters.at(-1);
  const previousCharacter = characters[start - 1];
  const nextCharacter = characters[end];

  if (
    firstCharacter &&
    latinNumberOrUnderscoreReg.test(firstCharacter) &&
    previousCharacter &&
    latinNumberOrUnderscoreReg.test(previousCharacter)
  ) {
    return false;
  }
  if (
    lastCharacter &&
    latinNumberOrUnderscoreReg.test(lastCharacter) &&
    nextCharacter &&
    latinNumberOrUnderscoreReg.test(nextCharacter)
  ) {
    return false;
  }
  return true;
};

/**
 * 构建知识库版本隔离的 trie matcher。标准词同样进入 trie 但作为 no-op terminal，
 * 防止较短同义词错误改写较长标准词的一部分。
 */
export const buildSynonymMatcher = (
  mappings: DatasetSynonymMatcherMapping[]
): DatasetSynonymMatcher => {
  const root: MatcherNode = { children: new Map(), terminals: [] };

  const insertTerm = ({
    term,
    mapping,
    isSynonym
  }: {
    term: string;
    mapping: DatasetSynonymMatcherMapping;
    isSynonym: boolean;
  }) => {
    let current = root;
    for (const character of Array.from(term)) {
      const normalizedCharacter = normalizeMatchCharacter(character);
      const next = current.children.get(normalizedCharacter) ?? {
        children: new Map(),
        terminals: []
      };
      current.children.set(normalizedCharacter, next);
      current = next;
    }
    current.terminals.push({ mapping, normalizedTerm: term, isSynonym });
    current.terminals.sort((a, b) => a.normalizedTerm.localeCompare(b.normalizedTerm));
  };

  for (const mapping of mappings) {
    insertTerm({
      term: mapping.normalizedStandardizedTerm,
      mapping,
      isSynonym: false
    });
    mapping.normalizedSynonymTerms.forEach((term) => {
      insertTerm({ term, mapping, isSynonym: true });
    });
  }

  return {
    transform(text) {
      const characters = Array.from(text);
      const normalizedCharacters = characters.map(normalizeMatchCharacter);
      const output: string[] = [];
      const usedMappings = new Map<string, DatasetSynonymMappingMetadataType>();

      for (let start = 0; start < characters.length; ) {
        let current = root;
        let cursor = start;
        let matched: { terminal: MatcherTerminal; end: number; matchedTerm: string } | undefined;

        while (cursor < normalizedCharacters.length) {
          const next = current.children.get(normalizedCharacters[cursor]!);
          if (!next) break;
          current = next;
          cursor += 1;

          for (const terminal of current.terminals) {
            if (
              hasValidBoundary({
                characters,
                start,
                end: cursor,
                normalizedTerm: terminal.normalizedTerm
              })
            ) {
              matched = {
                terminal,
                end: cursor,
                matchedTerm: characters.slice(start, cursor).join('')
              };
              break;
            }
          }
        }

        if (!matched) {
          output.push(characters[start]!);
          start += 1;
          continue;
        }

        if (!matched.terminal.isSynonym) {
          output.push(matched.matchedTerm);
        } else {
          const { mapping } = matched.terminal;
          output.push(mapping.standardizedTerm);
          const metadata: DatasetSynonymMappingMetadataType = {
            mappingId: mapping.logicalMappingId,
            datasetId: mapping.datasetId,
            fileVersion: mapping.fileVersion,
            matchedTerm: matched.matchedTerm,
            standardizedTerm: mapping.standardizedTerm
          };
          usedMappings.set(
            `${metadata.mappingId}:${normalizeSynonymTerm(metadata.matchedTerm)}`,
            metadata
          );
        }
        start = matched.end;
      }

      return {
        transformedText: output.join(''),
        usedMappings: [...usedMappings.values()]
      };
    }
  };
};
