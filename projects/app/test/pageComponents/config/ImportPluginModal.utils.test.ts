import { describe, expect, it } from 'vitest';
import { removeUploadedPluginFileByRow } from '@/pageComponents/config/ImportPluginModal.utils';

describe('ImportPluginModal utils', () => {
  it('should remove only the selected plugin row from a zip upload result', () => {
    const files = [
      { rowId: 'zip-row-a', name: 'tools.zip / A', sourceName: 'tools.zip' },
      { rowId: 'zip-row-b', name: 'tools.zip / B', sourceName: 'tools.zip' },
      { rowId: 'single-row', name: 'single.pkg' }
    ];

    const result = removeUploadedPluginFileByRow(files, files[0]);

    expect(result.nextUploadedFiles.map((file) => file.rowId)).toEqual(['zip-row-b', 'single-row']);
    expect(result.sourceNameToRemove).toBeUndefined();
  });

  it('should release the source zip after deleting the last plugin row from it', () => {
    const files = [
      { rowId: 'zip-row-b', name: 'tools.zip / B', sourceName: 'tools.zip' },
      { rowId: 'single-row', name: 'single.pkg' }
    ];

    const result = removeUploadedPluginFileByRow(files, files[0]);

    expect(result.nextUploadedFiles.map((file) => file.rowId)).toEqual(['single-row']);
    expect(result.sourceNameToRemove).toBe('tools.zip');
  });

  it('should release a standalone pkg after deleting it', () => {
    const files = [
      { rowId: 'zip-row-b', name: 'tools.zip / B', sourceName: 'tools.zip' },
      { rowId: 'single-row', name: 'single.pkg' }
    ];

    const result = removeUploadedPluginFileByRow(files, files[1]);

    expect(result.nextUploadedFiles.map((file) => file.rowId)).toEqual(['zip-row-b']);
    expect(result.sourceNameToRemove).toBe('single.pkg');
  });
});
