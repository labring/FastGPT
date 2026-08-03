// Kubernetes PVC 与 Docker named volume 统一使用 DNS label 子集。
const VOLUME_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/;

/** 校验调用方指定的最终 volume 名称，不在边界内改写已持久化标识。 */
export function validateVolumeName(name: string): string {
  if (!VOLUME_NAME_RE.test(name)) {
    throw new Error(`Invalid volume name: must be lowercase alphanumeric/hyphens, got "${name}"`);
  }
  return name;
}
