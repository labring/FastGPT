import { describe, expect, it } from 'vitest';
import {
  reserveUniqueArchiveName,
  sanitizeArchivePathSegment
} from '@fastgpt/service/core/dataset/collection/archive/utils';

describe('sanitizeArchivePathSegment', () => {
  it('normalizes Unicode and removes path traversal characters', () => {
    expect(sanitizeArchivePathSegment('Cafe\u0301')).toBe('Café');
    expect(sanitizeArchivePathSegment('../folder\\name\u0000')).toBe('.._folder_name_');
    expect(sanitizeArchivePathSegment('..')).toBe('_');
  });

  it('protects Windows reserved names and trailing dots or spaces', () => {
    expect(sanitizeArchivePathSegment('CON.txt')).toBe('_CON.txt');
    expect(sanitizeArchivePathSegment('report.  ')).toBe('report');
  });

  it('replaces characters that Windows forbids in file and directory names', () => {
    expect(sanitizeArchivePathSegment('report<draft>:v1?.txt')).toBe('report_draft__v1_.txt');
    expect(sanitizeArchivePathSegment('a"b|c*.txt')).toBe('a_b_c_.txt');
  });

  it('protects device names before the first dot, including multiple extensions', () => {
    expect(sanitizeArchivePathSegment('CON.report.txt')).toBe('_CON.report.txt');
    expect(sanitizeArchivePathSegment('lpt9.backup.tar.gz')).toBe('_lpt9.backup.tar.gz');
  });

  it('bounds UTF-8 bytes even when the extension alone exceeds the segment limit', () => {
    const result = sanitizeArchivePathSegment(`report.${'文'.repeat(100)}`);
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(200);
    expect(result).toMatch(/-[a-f0-9]{8}\./);
    expect(result).not.toContain('\uFFFD');
  });

  it('limits a segment by UTF-8 bytes while preserving the extension and a stable hash', () => {
    const result = sanitizeArchivePathSegment(`${'文'.repeat(100)}.pdf`);

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(200);
    expect(result).toMatch(/-[a-f0-9]{8}\.pdf$/);
    expect(sanitizeArchivePathSegment(`${'文'.repeat(100)}.pdf`)).toBe(result);
  });
});

describe('reserveUniqueArchiveName', () => {
  it('resolves file and folder collisions in one case-insensitive Unicode namespace', () => {
    const usedNames = new Set<string>();

    expect(reserveUniqueArchiveName({ rawName: 'Report.pdf', usedNames })).toBe('Report.pdf');
    expect(reserveUniqueArchiveName({ rawName: 'report.PDF', usedNames })).toBe('report (2).PDF');
    expect(reserveUniqueArchiveName({ rawName: 'Cafe\u0301', usedNames })).toBe('Café');
    expect(reserveUniqueArchiveName({ rawName: 'CAFÉ', usedNames })).toBe('CAFÉ (2)');
  });
});
