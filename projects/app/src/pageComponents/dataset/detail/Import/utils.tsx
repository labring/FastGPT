import { type ImportSourceItemType } from '@/web/core/dataset/type';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';

export const getPreviewSourceReadType = (previewSource: ImportSourceItemType) => {
  if (previewSource.dbFileId) {
    return DatasetSourceReadTypeEnum.fileLocal;
  }
  if (previewSource.link) {
    return DatasetSourceReadTypeEnum.link;
  }
  if (previewSource.apiFileId) {
    return DatasetSourceReadTypeEnum.apiFile;
  }
  if (previewSource.externalFileId) {
    return DatasetSourceReadTypeEnum.externalFile;
  }

  return DatasetSourceReadTypeEnum.fileLocal;
};

export default function Dom() {
  return <></>;
}

export const databaseAddrValidator = (val: string) => {
  // 如果为空，返回错误
  if (!val || val.trim() === '') {
    return i18nT('dataset:database_address_required');
  }

  const trimmedVal = val.trim();

  // 禁止的地址模式 - 更精确的匹配
  const forbiddenPatterns = [
    /^127\.(\d{1,3}\.){2}\d{1,3}$/, // 127.x.x.x 格式的IP
    /^localhost$/i, // localhost
    /^0\.0\.0\.0$/, // 0.0.0.0
    /^::1$/, // IPv6 localhost
    /^::$/ // IPv6 任意地址
  ];

  if (forbiddenPatterns.some((pattern) => pattern.test(trimmedVal))) {
    return i18nT('dataset:validate_ip_tip');
  }

  // IPv4 地址格式校验（宽松）
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = trimmedVal.match(ipv4Pattern);

  if (ipv4Pattern.test(trimmedVal)) {
    if (ipv4Match) {
      // 检查每个段是否在0-255范围内
      const segments = ipv4Match.slice(1, 5).map(Number);
      if (segments.some((segment) => segment > 255)) {
        return i18nT('dataset:ip_format_invalid_range');
      }

      // 再次检查是否是127开头的IP
      if (segments[0] === 127) {
        return i18nT('dataset:validate_ip_tip');
      }

      return true;
    }
  }

  // IPv6 地址格式校验（宽松）
  const ipv6Pattern =
    /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  if (ipv6Pattern.test(trimmedVal)) {
    return true;
  }

  // 域名格式校验（宽松）- 排除看起来像IP但格式不对的字符串
  if (/^\d+\.\d+\.\d+\.\d+/.test(trimmedVal)) {
    return i18nT('dataset:ip_format_invalid_range');
  }

  const domainPattern =
    /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
  if (domainPattern.test(trimmedVal)) {
    return true;
  }

  // 如果都不匹配，返回格式错误
  return i18nT('dataset:database_address_format_invalid');
};
