import { describe, expect, it } from 'vitest';
import {
  getPkgFilename,
  getPkgObjectKey,
  getPluginAssetObjectKey,
  getPluginAssetPrefix,
  getToolManifestObjectKey
} from '../../../src/service/s3';

describe('marketplace s3 key helpers', () => {
  it('encodes package object keys by path segment', () => {
    expect(getPkgObjectKey({ pluginId: 'tool/name', version: '1.0.0 beta' })).toBe(
      'pkgs/tool%2Fname/1.0.0%20beta.pkg'
    );
  });

  it('builds a stable package download filename', () => {
    expect(getPkgFilename({ pluginId: 'tool-a', version: '1.0.0', etag: 'etag-1' })).toBe(
      'tool-a@1.0.0@etag-1.pkg'
    );
  });

  it('encodes manifest object keys', () => {
    expect(getToolManifestObjectKey({ pluginId: 'tool/name', version: '2.0.0' })).toBe(
      'marketplace/tools/tool%2Fname/2.0.0.json'
    );
  });

  it('builds asset prefix with plugin id, version and etag', () => {
    expect(getPluginAssetPrefix({ pluginId: 'tool/name', version: '1.0.0', etag: 'etag/1' })).toBe(
      'system/plugin/tools/tool%2Fname/1.0.0/etag%2F1'
    );
  });

  it('drops unsafe relative path segments and encodes asset filenames', () => {
    expect(
      getPluginAssetObjectKey({
        pluginId: 'tool-a',
        version: '1.0.0',
        etag: 'etag-1',
        filePath: ['.', '../README.md', 'assets/logo 1.svg']
      })
    ).toBe('system/plugin/tools/tool-a/1.0.0/etag-1/README.md/assets/logo%201.svg');
  });
});
