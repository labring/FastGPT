import React from 'react';
import { Flex } from '@chakra-ui/react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

type AdminReadonlyInputProps = {
  value?: string;
  placeholder?: string;
  /** 单行截断并显示省略号；默认按内容换行完整展示 */
  isTruncate?: boolean;
};

/**
 * 只读展示控件：视觉与 Input 一致，但使用非表单元素渲染。
 * 不使用 disabled/readOnly input，避免点击时出现焦点描边（蓝色 outline）等交互反馈。
 * 文本保持可选中复制，便于管理员取用地址或密钥状态。
 */
const AdminReadonlyInput = ({
  value,
  placeholder,
  isTruncate = false
}: AdminReadonlyInputProps) => {
  const { t } = useSafeTranslation();
  const resolvedPlaceholder = placeholder ?? t('admin:not_configured');
  const hasValue = Boolean(value);

  return (
    <Flex
      alignItems={'center'}
      minH={'40px'}
      px={3}
      py={2}
      borderRadius={'md'}
      borderWidth={'1px'}
      borderColor={'myGray.200'}
      bg={'myGray.50'}
      fontSize={'sm'}
      color={hasValue ? 'myGray.800' : 'myGray.400'}
      cursor={'default'}
      userSelect={'text'}
      {...(isTruncate
        ? { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'block' }
        : { wordBreak: 'break-all' })}
    >
      {hasValue ? value : resolvedPlaceholder}
    </Flex>
  );
};

export default React.memo(AdminReadonlyInput);
