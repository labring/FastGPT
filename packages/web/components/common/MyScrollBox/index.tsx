import React, { forwardRef } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import MyBox from '../MyBox';

type Props = BoxProps & {
  isLoading?: boolean;
  /** 外壳承接尺寸及 flex 布局，其余属性和 ref 传给实际滚动层。 */
  containerProps?: BoxProps;
};

/**
 * 将局部加载遮罩与滚动内容分层，遮罩始终覆盖外壳的可视区域。
 * ref、滚动事件和内容样式属于内部滚动层；外壳通过 containerProps 参与父级布局。
 * 两层 DOM 始终保留，加载切换不会重建内容或重置滚动位置。
 */
const MyScrollBox = forwardRef<HTMLDivElement, Props>(function MyScrollBox(
  { children, isLoading, containerProps, ...props },
  ref
) {
  return (
    <MyBox
      h={'100%'}
      minH={0}
      minW={0}
      {...containerProps}
      position={'relative'}
      overflow={'hidden'}
      isLoading={isLoading}
    >
      <Box ref={ref} h={'100%'} overflow={'auto'} {...props}>
        {children}
      </Box>
    </MyBox>
  );
});

export default React.memo(MyScrollBox);
