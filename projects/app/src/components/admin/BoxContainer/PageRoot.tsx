import type { BoxProps } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type React from 'react';

/**
 * 管理员页面根容器。
 *
 * 内容区已无内外边距与圆角（见 AdminContainer），根容器必须铺满整块内容区：
 * 保留 BoxCard 的白色底与内容内边距，但去掉圆角与阴影——否则卡片四角会在贴边处
 * 露出底色缺口。卡片式视觉只用于页面内部的嵌套分组（BoxCard）。
 */
const BoxPageRoot = ({
  children,
  ...props
}: BoxProps & {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  // 页面明确指定 padding 时，不能再叠加默认 px/py，否则 p={0} 仍会留下一圈空白。
  const defaultPx = props.p === undefined && props.px === undefined ? [4, 6] : undefined;
  const defaultPy = props.p === undefined && props.py === undefined ? [4, 6] : undefined;

  return (
    <MyBox px={defaultPx} py={defaultPy} bg={'white'} {...props}>
      {children}
    </MyBox>
  );
};

export default BoxPageRoot;
