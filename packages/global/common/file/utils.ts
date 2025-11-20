import { ChatFileTypeEnum } from '../../core/chat/constants';

export const isChatFileObjectArray = (
  value: any
): value is { type: `${ChatFileTypeEnum}`; key: string; url: string }[] => {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        (item.type === ChatFileTypeEnum.file || item.type === ChatFileTypeEnum.image)
    )
  );
};
