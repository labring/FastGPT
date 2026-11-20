import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/sandbox/type';
import type { ImageSpec, SandboxCreateSpec } from '../../infrastructure/opensandbox/type';
import { getOpenSandboxRuntimeConfig } from '../../infrastructure/opensandbox/config';
import { parseImageSpec } from '../../infrastructure/opensandbox/utils';

/**
 * 把 provider SDK 接受的字符串或对象镜像统一成 repository/tag。
 *
 * 统一复用 `parseImageSpec` 处理 registry 端口与 `@sha256:` digest，避免把 digest 冒号误切分为 tag。
 */
export const normalizeSandboxImage = (
  image?: (SandboxImageConfigType & { digest?: string }) | ImageSpec | string | null
): SandboxImageConfigType | undefined => {
  if (typeof image === 'string') {
    const parsed = parseImageSpec(image);
    if (!parsed.repository) return;
    return {
      repository: parsed.repository,
      tag: parsed.tag ?? (parsed.digest ? `@${parsed.digest}` : '')
    };
  }
  if (!image?.repository) return;

  const parsedRepo = parseImageSpec(image.repository);
  const resolvedTag =
    image.tag ||
    parsedRepo.tag ||
    (image.digest ? `@${image.digest}` : parsedRepo.digest ? `@${parsedRepo.digest}` : '');

  return {
    repository: parsedRepo.repository,
    tag: resolvedTag
  };
};

/** 比较目标 runtime 与实例记录的 repository/tag。 */
export const isSandboxRuntimeImageMatched = (
  runtimeImage: SandboxImageConfigType | undefined,
  existingImage?: SandboxImageConfigType | string | null
) => {
  const normalizedExistingImage = normalizeSandboxImage(existingImage);
  return (
    !runtimeImage ||
    (!!normalizedExistingImage &&
      normalizedExistingImage.repository === runtimeImage.repository &&
      (normalizedExistingImage.tag ?? '') === (runtimeImage.tag ?? ''))
  );
};

/**
 * 从后端 provider runtime profile 解析本次创建或恢复真正使用的镜像。
 * 客户端不能传入目标镜像，避免把任意镜像伪装成当前版本绕过升级判断。
 */
export const resolveSandboxRuntimeImage = ({
  createConfig
}: {
  createConfig?: SandboxCreateSpec;
} = {}) => {
  const runtimeConfig = getOpenSandboxRuntimeConfig({
    createConfig
  });

  return normalizeSandboxImage(runtimeConfig.rawImage || runtimeConfig.image);
};
