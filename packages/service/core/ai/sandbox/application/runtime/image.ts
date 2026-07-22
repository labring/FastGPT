import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/sandbox/type';
import type { SandboxCreateSpec, SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import { getSandboxAdapterConfig } from '../../infrastructure/provider/config';

/**
 * 把 provider SDK 接受的字符串或对象镜像统一成 repository/tag。
 *
 * 镜像升级保持现有 Skill 语义，只比较 repository 和 tag；registry 端口后的最后一个冒号
 * 不会被误判为 tag 分隔符。
 */
export const normalizeSandboxImage = (
  image?: SandboxImageConfigType | string | null
): SandboxImageConfigType | undefined => {
  if (typeof image === 'string') {
    const lastColonIndex = image.lastIndexOf(':');
    if (lastColonIndex > 0 && !image.slice(lastColonIndex + 1).includes('/')) {
      return {
        repository: image.slice(0, lastColonIndex),
        tag: image.slice(lastColonIndex + 1)
      };
    }
    return {
      repository: image,
      tag: ''
    };
  }
  if (!image?.repository) return;

  const repository = image.repository;
  const tag = image.tag ?? '';
  if (!tag) {
    const lastColonIndex = repository.lastIndexOf(':');
    if (lastColonIndex > 0 && !repository.slice(lastColonIndex + 1).includes('/')) {
      return {
        repository: repository.slice(0, lastColonIndex),
        tag: repository.slice(lastColonIndex + 1)
      };
    }
  }

  return { repository, tag };
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
  provider,
  sandboxId,
  createConfig
}: {
  provider: SandboxProviderType;
  sandboxId: string;
  createConfig?: SandboxCreateSpec;
}) => {
  const { createConfig: runtimeCreateConfig } = getSandboxAdapterConfig({
    provider,
    runtime: true,
    sessionId: sandboxId,
    createConfig
  });

  return normalizeSandboxImage(runtimeCreateConfig?.image);
};
