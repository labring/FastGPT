import { describe, expect, it } from 'vitest';
import { parseVolumeManagerEnv } from '../../src/env';

describe('parseVolumeManagerEnv', () => {
  it('defaults VM_RUNTIME to docker with built-in RustFS defaults and trims values', () => {
    expect(
      parseVolumeManagerEnv({
        VM_AUTH_TOKEN: 'secret-token',
        VM_JUICEFS_META_URL: '  postgres://postgres:password@fastgpt-sandbox-pg:5432/juicefs  ',
        VM_JUICEFS_ACCESS_KEY: '  rustfsadmin  ',
        VM_JUICEFS_SECRET_KEY: '  rustfssecret  '
      })
    ).toEqual({
      PORT: 3000,
      VM_AUTH_TOKEN: 'secret-token',
      VM_RUNTIME: 'docker',
      VM_JUICEFS_META_URL: 'postgres://postgres:password@fastgpt-sandbox-pg:5432/juicefs',
      VM_JUICEFS_STORAGE: 'minio',
      VM_JUICEFS_BUCKET: 'http://fastgpt-sandbox-rustfs:9000/fastgpt-sandbox',
      VM_JUICEFS_ACCESS_KEY: 'rustfsadmin',
      VM_JUICEFS_SECRET_KEY: 'rustfssecret',
      VM_K8S_NAMESPACE: '',
      VM_K8S_PVC_STORAGE_CLASS: ''
    });

    expect(() =>
      parseVolumeManagerEnv({
        VM_AUTH_TOKEN: 'secret-token',
        VM_RUNTIME: 'docker',
        VM_JUICEFS_META_URL: '   ',
        VM_JUICEFS_ACCESS_KEY: '',
        VM_JUICEFS_SECRET_KEY: '  '
      })
    ).toThrow(/VM_JUICEFS_META_URL: .*VM_JUICEFS_ACCESS_KEY: .*VM_JUICEFS_SECRET_KEY:/);
  });

  it('requires both VM_K8S_NAMESPACE and VM_K8S_PVC_STORAGE_CLASS in kubernetes runtime', () => {
    expect(() =>
      parseVolumeManagerEnv({
        VM_AUTH_TOKEN: 'secret-token',
        VM_RUNTIME: 'kubernetes',
        VM_K8S_NAMESPACE: '   ',
        VM_K8S_PVC_STORAGE_CLASS: '   '
      })
    ).toThrow(/VM_K8S_NAMESPACE: .*VM_K8S_PVC_STORAGE_CLASS: .*JuiceFS StorageClass/);

    const parsed = parseVolumeManagerEnv({
      VM_AUTH_TOKEN: 'secret-token',
      VM_RUNTIME: 'kubernetes',
      VM_K8S_NAMESPACE: '  fgc  ',
      VM_K8S_PVC_STORAGE_CLASS: '  juicefs-sc  '
    });
    expect(parsed.VM_K8S_NAMESPACE).toBe('fgc');
    expect(parsed.VM_K8S_PVC_STORAGE_CLASS).toBe('juicefs-sc');
  });

  it('allows omitting static AK/SK for external cloud object storage IAM roles while rejecting partial credentials', () => {
    expect(
      parseVolumeManagerEnv({
        VM_AUTH_TOKEN: 'secret-token',
        VM_RUNTIME: 'docker',
        VM_JUICEFS_META_URL:
          'postgres://postgres:password@rds.internal:5432/juicefs?sslmode=disable',
        VM_JUICEFS_STORAGE: 's3',
        VM_JUICEFS_BUCKET: 'https://my-sandbox-bucket.s3.us-east-1.amazonaws.com'
      }).VM_JUICEFS_ACCESS_KEY
    ).toBe('');

    expect(() =>
      parseVolumeManagerEnv({
        VM_AUTH_TOKEN: 'secret-token',
        VM_RUNTIME: 'docker',
        VM_JUICEFS_META_URL:
          'postgres://postgres:password@rds.internal:5432/juicefs?sslmode=disable',
        VM_JUICEFS_STORAGE: 'oss',
        VM_JUICEFS_BUCKET: 'https://my-sandbox-bucket.oss-cn-hangzhou-internal.aliyuncs.com',
        VM_JUICEFS_ACCESS_KEY: 'LTAI-only-ak',
        VM_JUICEFS_SECRET_KEY: ''
      })
    ).toThrow('VM_JUICEFS_SECRET_KEY: VM_JUICEFS_SECRET_KEY must be set together');

    expect(() =>
      parseVolumeManagerEnv({
        VM_AUTH_TOKEN: 'secret-token',
        VM_RUNTIME: 'docker',
        VM_JUICEFS_META_URL: 'postgres://postgres:password@fastgpt-sandbox-pg:5432/juicefs',
        VM_JUICEFS_STORAGE: 's3'
      })
    ).toThrow(/VM_JUICEFS_ACCESS_KEY: .*VM_JUICEFS_SECRET_KEY:/);
  });
});
