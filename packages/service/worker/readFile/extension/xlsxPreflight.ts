import { type Entry, fromBuffer, type ZipFile } from 'yauzl';

const maxXlsxEntries = 10_000;
const maxXmlTagBytes = 64 * 1024;

type Coordinate = {
  r: number;
  c: number;
};

type Range = {
  s: Coordinate;
  e: Coordinate;
};

export type XlsxPreflightLimits = {
  maxRows: number;
  maxColumns: number;
  maxCells: number;
  maxMergedCells: number;
  maxUncompressedBytes: number;
};

type XlsxPreflightResult = {
  worksheetCount: number;
  workbookCellCount: number;
  workbookCellElementCount: number;
  workbookMergedCellCount: number;
  uncompressedBytes: number;
};

const getLocalName = (name: string) => name.split(':').at(-1)?.toLowerCase() ?? '';

const getStartTagName = (tag: string) => {
  if (/^<\s*[!?/]/.test(tag)) return;
  return tag.match(/^<\s*([^\s/>]+)/)?.[1];
};

const getTagAttribute = ({ tag, name }: { tag: string; name: string }) => {
  const attributeRegex = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return tag.match(attributeRegex)?.[2];
};

/**
 * 增量切分 XML 开始 tag。只缓存当前 tag，并识别引号内的 `>`、comment、CDATA 和 PI，
 * 避免为了 worksheet 坐标预检拼接完整 XML entry。
 */
const createXmlTagScanner = ({ onStartTag }: { onStartTag: (tag: string) => void }) => {
  const tagBuffer = Buffer.allocUnsafe(maxXmlTagBytes);
  let tagLength = 0;
  let insideTag = false;
  let quote = 0;
  let disabled = false;

  const hasPrefix = (prefix: string) => {
    if (tagLength < prefix.length) return false;
    return tagBuffer.subarray(0, prefix.length).toString('ascii').toLowerCase() === prefix;
  };

  const appendByte = (byte: number) => {
    if (tagLength >= maxXmlTagBytes) {
      throw new Error(`XLSX XML tag exceeds the maximum length of ${maxXmlTagBytes} bytes`);
    }
    tagBuffer[tagLength] = byte;
    tagLength += 1;
  };

  const isSpecialTagEnd = () => {
    if (hasPrefix('<!--')) {
      return (
        tagLength >= 3 &&
        tagBuffer[tagLength - 3] === 0x2d &&
        tagBuffer[tagLength - 2] === 0x2d &&
        tagBuffer[tagLength - 1] === 0x3e
      );
    }
    if (hasPrefix('<![cdata[')) {
      return (
        tagLength >= 3 &&
        tagBuffer[tagLength - 3] === 0x5d &&
        tagBuffer[tagLength - 2] === 0x5d &&
        tagBuffer[tagLength - 1] === 0x3e
      );
    }
    if (hasPrefix('<?')) {
      return (
        tagLength >= 2 && tagBuffer[tagLength - 2] === 0x3f && tagBuffer[tagLength - 1] === 0x3e
      );
    }
    return false;
  };

  const finishTag = () => {
    const isIgnoredTag = hasPrefix('<!--') || hasPrefix('<![cdata[') || hasPrefix('<?');
    const tag = isIgnoredTag ? undefined : tagBuffer.subarray(0, tagLength).toString('utf8');
    tagLength = 0;
    insideTag = false;
    quote = 0;
    if (tag) onStartTag(tag);
  };

  return {
    write(chunk: Buffer) {
      if (disabled) return;

      for (let index = 0; index < chunk.length; index++) {
        // onStartTag 可能禁用非 worksheet 扫描，不能继续消费当前 chunk 污染状态。
        if (disabled) return;

        const byte = chunk[index];
        if (!insideTag) {
          if (byte !== 0x3c) continue;
          insideTag = true;
          appendByte(byte);
          continue;
        }

        appendByte(byte);

        if (hasPrefix('<!doctype')) {
          throw new Error('XLSX XML must not contain a DOCTYPE declaration');
        }
        if (isSpecialTagEnd()) {
          finishTag();
          continue;
        }
        if (hasPrefix('<!--') || hasPrefix('<![cdata[') || hasPrefix('<?')) continue;

        if (quote !== 0) {
          if (byte === quote) quote = 0;
          continue;
        }
        if (byte === 0x22 || byte === 0x27) {
          quote = byte;
          continue;
        }
        if (byte === 0x3e) finishTag();
      }
    },
    finish() {
      if (insideTag) throw new Error('XLSX XML contains an unterminated tag');
    },
    disable() {
      disabled = true;
      tagLength = 0;
      insideTag = false;
      quote = 0;
    }
  };
};

const decodeCoordinate = ({ reference, path }: { reference: string; path: string }): Coordinate => {
  const match = reference.match(/^\$?([A-Za-z]+)\$?([1-9]\d*)$/);
  if (!match) throw new Error(`XLSX worksheet "${path}" has an invalid cell reference`);

  const rowNumber = Number(match[2]);
  let columnNumber = 0;
  for (const character of match[1].toUpperCase()) {
    columnNumber = columnNumber * 26 + character.charCodeAt(0) - 64;
    if (!Number.isSafeInteger(columnNumber)) {
      throw new Error(`XLSX worksheet "${path}" has an invalid cell reference`);
    }
  }

  if (!Number.isSafeInteger(rowNumber)) {
    throw new Error(`XLSX worksheet "${path}" has an invalid cell reference`);
  }

  return {
    r: rowNumber - 1,
    c: columnNumber - 1
  };
};

const decodeRange = ({ reference, path }: { reference: string; path: string }): Range => {
  const references = reference.split(':');
  if (references.length > 2 || references.some((item) => item.length === 0)) {
    throw new Error(`XLSX worksheet "${path}" has an invalid range`);
  }

  const start = decodeCoordinate({ reference: references[0], path });
  const end = decodeCoordinate({ reference: references[1] ?? references[0], path });
  if (start.r > end.r || start.c > end.c) {
    throw new Error(`XLSX worksheet "${path}" has an invalid range`);
  }
  return { s: start, e: end };
};

const extendRange = ({ range, coordinate }: { range?: Range; coordinate: Coordinate }): Range => {
  if (!range) {
    return {
      s: { ...coordinate },
      e: { ...coordinate }
    };
  }

  return {
    s: {
      r: Math.min(range.s.r, coordinate.r),
      c: Math.min(range.s.c, coordinate.c)
    },
    e: {
      r: Math.max(range.e.r, coordinate.r),
      c: Math.max(range.e.c, coordinate.c)
    }
  };
};

const extendRangeByRange = ({ range, extension }: { range?: Range; extension: Range }) =>
  extendRange({
    range: extendRange({ range, coordinate: extension.s }),
    coordinate: extension.e
  });

const containsRange = ({ outer, inner }: { outer: Range; inner: Range }) =>
  inner.s.r >= outer.s.r &&
  inner.s.c >= outer.s.c &&
  inner.e.r <= outer.e.r &&
  inner.e.c <= outer.e.c;

const getRangeCellCount = ({ range, maxCells }: { range: Range; maxCells: number }) => {
  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  if (rowCount > Math.floor(maxCells / columnCount)) return maxCells + 1;
  return rowCount * columnCount;
};

const validateRangeCoordinates = ({
  range,
  path,
  limits
}: {
  range: Range;
  path: string;
  limits: XlsxPreflightLimits;
}) => {
  if (range.e.r + 1 > limits.maxRows) {
    throw new Error(`XLSX worksheet "${path}" exceeds the maximum row limit of ${limits.maxRows}`);
  }
  if (range.e.c + 1 > limits.maxColumns) {
    throw new Error(
      `XLSX worksheet "${path}" exceeds the maximum column limit of ${limits.maxColumns}`
    );
  }
};

/**
 * 扫描单个归档 entry。只有内容为 XML 且根元素为 worksheet 时才解析坐标；其他内容仅参与解压预算。
 */
const createWorksheetInspector = ({
  path,
  limits,
  getRemainingCellElements,
  getRemainingMergedCells
}: {
  path: string;
  limits: XlsxPreflightLimits;
  getRemainingCellElements: () => number;
  getRemainingMergedCells: () => number;
}) => {
  let rootName: string | undefined;
  let declaredRange: Range | undefined;
  let actualCellRange: Range | undefined;
  let mergeRange: Range | undefined;
  let rowElementCount = 0;
  let cellElementCount = 0;
  let mergedCellCount = 0;
  let currentRow = -1;
  let currentColumn = -1;
  let contentKind: 'unknown' | 'xml' | 'binary' = 'unknown';
  let bomOffset = 0;

  const scanner = createXmlTagScanner({
    onStartTag: (tag) => {
      const qualifiedName = getStartTagName(tag);
      if (!qualifiedName) return;
      const name = getLocalName(qualifiedName);

      if (!rootName) {
        rootName = name;
        if (rootName !== 'worksheet') scanner.disable();
        return;
      }
      if (rootName !== 'worksheet') return;

      if (name === 'dimension') {
        if (declaredRange) {
          throw new Error(`XLSX worksheet "${path}" contains multiple dimensions`);
        }
        const reference = getTagAttribute({ tag, name: 'ref' });
        if (!reference) throw new Error(`XLSX worksheet "${path}" has an invalid range`);
        declaredRange = decodeRange({ reference, path });
        validateRangeCoordinates({ range: declaredRange, path, limits });
        return;
      }

      if (name === 'row') {
        rowElementCount += 1;
        if (rowElementCount > limits.maxRows) {
          throw new Error(
            `XLSX worksheet "${path}" exceeds the maximum row limit of ${limits.maxRows}`
          );
        }
        const rowReference = getTagAttribute({ tag, name: 'r' });
        const rowNumber = rowReference ? Number(rowReference) : currentRow + 2;
        if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) {
          throw new Error(`XLSX worksheet "${path}" has an invalid row reference`);
        }
        currentRow = rowNumber - 1;
        currentColumn = -1;
        if (currentRow + 1 > limits.maxRows) {
          throw new Error(
            `XLSX worksheet "${path}" exceeds the maximum row limit of ${limits.maxRows}`
          );
        }
        return;
      }

      if (name === 'c') {
        cellElementCount += 1;
        if (cellElementCount > getRemainingCellElements()) {
          throw new Error(`XLSX workbook exceeds the maximum cell limit of ${limits.maxCells}`);
        }
        const cellReference = getTagAttribute({ tag, name: 'r' });
        const coordinate = (() => {
          if (cellReference) return decodeCoordinate({ reference: cellReference, path });
          if (currentRow < 0) {
            throw new Error(`XLSX worksheet "${path}" has a cell without a row reference`);
          }
          return {
            r: currentRow,
            c: currentColumn + 1
          };
        })();
        currentRow = coordinate.r;
        currentColumn = coordinate.c;
        validateRangeCoordinates({ range: { s: coordinate, e: coordinate }, path, limits });
        actualCellRange = extendRange({ range: actualCellRange, coordinate });
        return;
      }

      if (name === 'mergecell') {
        const reference = getTagAttribute({ tag, name: 'ref' });
        if (!reference) {
          throw new Error(`XLSX worksheet "${path}" has an invalid merge range`);
        }
        const range = decodeRange({ reference, path });
        const knownWorksheetRange = declaredRange ?? actualCellRange;
        if (knownWorksheetRange && !containsRange({ outer: knownWorksheetRange, inner: range })) {
          throw new Error(`XLSX worksheet "${path}" has a merge range outside worksheet bounds`);
        }
        validateRangeCoordinates({ range, path, limits });
        const remainingMergedCells = getRemainingMergedCells() - mergedCellCount;
        const rangeCellCount = getRangeCellCount({ range, maxCells: remainingMergedCells });
        if (rangeCellCount > remainingMergedCells) {
          throw new Error(
            `XLSX workbook exceeds the maximum merged-cell fill limit of ${limits.maxMergedCells}`
          );
        }
        mergedCellCount += rangeCellCount;
        mergeRange = extendRangeByRange({ range: mergeRange, extension: range });
      }
    }
  });

  return {
    write(chunk: Buffer) {
      if (contentKind === 'binary') return;
      if (contentKind === 'xml') {
        scanner.write(chunk);
        return;
      }

      for (let index = 0; index < chunk.length; index++) {
        const byte = chunk[index];
        if (bomOffset < 3) {
          const utf8Bom = [0xef, 0xbb, 0xbf];
          if (byte === utf8Bom[bomOffset]) {
            bomOffset += 1;
            continue;
          }
          if (bomOffset > 0) {
            contentKind = 'binary';
            return;
          }
          bomOffset = 3;
        }

        if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
        if (byte !== 0x3c) {
          contentKind = 'binary';
          return;
        }

        contentKind = 'xml';
        scanner.write(chunk.subarray(index));
        return;
      }
    },
    finish() {
      if (contentKind === 'xml') scanner.finish();
      if (rootName !== 'worksheet') return;

      if (
        declaredRange &&
        actualCellRange &&
        !containsRange({ outer: declaredRange, inner: actualCellRange })
      ) {
        throw new Error(`XLSX worksheet "${path}" contains cells outside its declared range`);
      }

      const worksheetRange = declaredRange ?? actualCellRange;
      if (
        mergeRange &&
        (!worksheetRange || !containsRange({ outer: worksheetRange, inner: mergeRange }))
      ) {
        throw new Error(`XLSX worksheet "${path}" has a merge range outside worksheet bounds`);
      }

      return {
        cellCount: worksheetRange
          ? getRangeCellCount({ range: worksheetRange, maxCells: limits.maxCells })
          : 0,
        cellElementCount,
        mergedCellCount
      };
    }
  };
};

const openZip = (buffer: Buffer) =>
  new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(
      buffer,
      {
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true
      },
      (error, zip) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(zip);
      }
    );
  });

/**
 * 在 SheetJS 解析前流式检查 XLSX 归档解压量和真实 worksheet 坐标预算。
 * `dimension` 只参与输出范围计算，实际 cell/merge 坐标始终独立校验。
 */
export const preflightXlsx = async ({
  buffer,
  limits
}: {
  buffer: Buffer;
  limits: XlsxPreflightLimits;
}): Promise<XlsxPreflightResult> => {
  const zip = await openZip(buffer);

  return new Promise<XlsxPreflightResult>((resolve, reject) => {
    let entriesRead = 0;
    let worksheetCount = 0;
    let workbookCellCount = 0;
    let workbookCellElementCount = 0;
    let workbookMergedCellCount = 0;
    let uncompressedBytes = 0;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(error);
    };

    const readArchiveEntry = (entry: Entry) => {
      zip.openReadStream(entry, (error, stream) => {
        if (error) {
          fail(error);
          return;
        }

        const inspector = createWorksheetInspector({
          path: entry.fileName,
          limits,
          getRemainingCellElements: () => limits.maxCells - workbookCellElementCount,
          getRemainingMergedCells: () => limits.maxMergedCells - workbookMergedCellCount
        });

        stream.on('data', (chunk: Buffer) => {
          if (chunk.length > limits.maxUncompressedBytes - uncompressedBytes) {
            stream.destroy(
              new Error(
                `XLSX exceeds the maximum uncompressed data limit of ${limits.maxUncompressedBytes} bytes`
              )
            );
            return;
          }
          uncompressedBytes += chunk.length;
          try {
            inspector.write(chunk);
          } catch (error) {
            stream.destroy(error as Error);
          }
        });
        stream.once('error', fail);
        stream.once('end', () => {
          if (settled) return;
          try {
            const worksheet = inspector.finish();
            if (worksheet) {
              worksheetCount += 1;
              if (worksheet.cellCount > limits.maxCells - workbookCellCount) {
                throw new Error(
                  `XLSX workbook exceeds the maximum cell limit of ${limits.maxCells}`
                );
              }
              workbookCellCount += worksheet.cellCount;
              workbookCellElementCount += worksheet.cellElementCount;
              workbookMergedCellCount += worksheet.mergedCellCount;
            }
            zip.readEntry();
          } catch (error) {
            fail(error);
          }
        });
      });
    };

    zip.once('error', fail);
    zip.on('entry', (entry: Entry) => {
      entriesRead += 1;
      if (entriesRead > maxXlsxEntries) {
        fail(new Error(`XLSX exceeds the maximum ZIP entry limit of ${maxXlsxEntries}`));
        return;
      }

      const createdOnUnix = entry.versionMadeBy >>> 8 === 3;
      const unixMode = entry.externalFileAttributes >>> 16;
      const unixFileType = unixMode & 0xf000;
      const isRegularFile =
        !entry.fileName.endsWith('/') &&
        (!createdOnUnix || unixFileType === 0 || unixFileType === 0x8000);
      if (!isRegularFile) {
        zip.readEntry();
        return;
      }

      if (entry.uncompressedSize > limits.maxUncompressedBytes - uncompressedBytes) {
        fail(
          new Error(
            `XLSX exceeds the maximum uncompressed data limit of ${limits.maxUncompressedBytes} bytes`
          )
        );
        return;
      }
      readArchiveEntry(entry);
    });
    zip.once('end', () => {
      if (settled) return;
      settled = true;
      if (worksheetCount === 0) {
        reject(new Error('XLSX does not contain a worksheet'));
        return;
      }
      resolve({
        worksheetCount,
        workbookCellCount,
        workbookCellElementCount,
        workbookMergedCellCount,
        uncompressedBytes
      });
    });

    if (zip.entryCount > maxXlsxEntries) {
      fail(new Error(`XLSX exceeds the maximum ZIP entry limit of ${maxXlsxEntries}`));
      return;
    }
    zip.readEntry();
  });
};
