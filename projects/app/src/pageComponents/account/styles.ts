import type { BoxProps, TextProps } from '@chakra-ui/react';

/** 账号页面标题与内容分组标题共用的文字视觉样式，不包含容器布局。 */
export const accountTitleTextStyles = {
  color: 'myGray.900',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  letterSpacing: '0.15px'
} satisfies TextProps;

/** 账号页在移动端由内容撑开，桌面端占满主内容区高度。 */
export const accountPageRootStyles = {
  h: ['auto', '100%'],
  minH: 0
} satisfies BoxProps;

/** 账号页内部滚动区仅在桌面端接管纵向滚动，移动端跟随主内容区整体滚动。 */
export const accountContentScrollStyles = {
  flex: ['0 0 auto', '1 0 0'],
  h: ['auto', 0],
  minH: 0,
  overflowY: ['visible', 'auto']
} satisfies BoxProps;
