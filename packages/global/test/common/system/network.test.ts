import { describe, expect, it } from 'vitest';
import {
  createInternalAddressChecker,
  PRIVATE_URL_TEXT
} from '../../../common/system/network';

/**
 * SSRF 边界回归（MCP OAuth 真实 AS E2E 依赖）。
 *
 * 真实 AS 位于 172.17.0.0/16 私有网段。FastGPT 生产路径对私网段的态度由既有
 * `CHECK_INTERNAL_IP`（默认 false）决定；loopback / 云元数据地址始终拒绝。
 * 这组用例锁定该边界，防止 E2E 通过放宽生产默认值来“跑通”。
 */
const production = (checkInternalIp: boolean) =>
  createInternalAddressChecker({
    checkInternalIp: () => checkInternalIp,
    nodeEnv: 'production',
    hostname: 'fastgpt-test',
    port: 3000
  });

describe('internal address checker (production defaults)', () => {
  it('default (CHECK_INTERNAL_IP=false) allows RFC1918 egress but always blocks loopback', async () => {
    const { isInternalAddress } = production(false);

    await expect(isInternalAddress('http://172.17.0.22:18200/mcp')).resolves.toBe(false);
    await expect(isInternalAddress('http://10.0.0.1/mcp')).resolves.toBe(false);
    await expect(isInternalAddress('http://192.168.1.10/mcp')).resolves.toBe(false);

    await expect(isInternalAddress('http://127.0.0.1:18200/mcp')).resolves.toBe(true);
    await expect(isInternalAddress('http://localhost:18200/mcp')).resolves.toBe(true);
    await expect(isInternalAddress('http://[::1]:18200/mcp')).resolves.toBe(true);
    await expect(isInternalAddress('http://0.0.0.0:18200/mcp')).resolves.toBe(true);
  });

  it('default still blocks cloud metadata endpoints', async () => {
    const { isInternalAddress } = production(false);

    await expect(isInternalAddress('http://169.254.169.254/latest/meta-data')).resolves.toBe(true);
    await expect(isInternalAddress('http://metadata.google.internal/computeMetadata')).resolves.toBe(
      true
    );
    await expect(isInternalAddress('http://100.100.100.200/latest/meta-data')).resolves.toBe(true);
  });

  it('CHECK_INTERNAL_IP=true additionally blocks RFC1918 (opt-in hardening unchanged)', async () => {
    const { isInternalAddress } = production(true);

    await expect(isInternalAddress('http://172.17.0.22:18200/mcp')).resolves.toBe(true);
    await expect(isInternalAddress('http://10.0.0.1/mcp')).resolves.toBe(true);
    await expect(isInternalAddress('http://192.168.1.10/mcp')).resolves.toBe(true);
    await expect(isInternalAddress('https://example.com/mcp')).resolves.toBe(false);
  });

  it('resolved-IP recheck follows the same policy (DNS pin path)', () => {
    const permissive = production(false);
    expect(permissive.isInternalResolvedIP('172.17.0.22')).toBe(false);
    expect(permissive.isInternalResolvedIP('127.0.0.1')).toBe(true);
    expect(permissive.isInternalResolvedIP('169.254.169.254')).toBe(true);

    const strict = production(true);
    expect(strict.isInternalResolvedIP('172.17.0.22')).toBe(true);
    expect(strict.isInternalResolvedIP('8.8.8.8')).toBe(false);
  });

  it('development mode bypass is unchanged', async () => {
    const dev = createInternalAddressChecker({
      checkInternalIp: () => true,
      nodeEnv: 'development'
    });
    await expect(dev.isInternalAddress('http://127.0.0.1:18200/mcp')).resolves.toBe(false);
  });

  it('exports a stable rejection message', () => {
    expect(PRIVATE_URL_TEXT).toBe('Request to private network not allowed');
  });
});
