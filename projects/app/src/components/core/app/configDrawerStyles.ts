import type { ButtonProps, InputProps, TextareaProps } from '@chakra-ui/react';

/** Chakra Drawer 默认 z-index，供抽屉容器显式声明 */
export const drawerZIndex = 1400;

/** 从系统配置抽屉内打开的弹窗需要高于 Drawer，否则会被挡住 */
export const drawerModalZIndex = 1500;

export const drawerActionButtonStyle: ButtonProps = {
  color: '#485264',
  fontFamily: 'PingFang SC',
  fontSize: '14px',
  fontStyle: 'normal',
  fontWeight: 500,
  lineHeight: '20px',
  letterSpacing: '0.1px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  height: '32px',
  minH: '32px',
  padding: '6px 8px'
};

const drawerInputTypography = {
  fontFamily: 'PingFang SC',
  fontSize: '14px',
  fontStyle: 'normal',
  fontWeight: 400,
  lineHeight: '20px',
  letterSpacing: '0.25px'
} as const;

/** 系统配置抽屉内输入类占位文本样式，对齐设计稿 body/medium 规格 */
export const drawerInputPlaceholderStyle = {
  color: '#667085',
  ...drawerInputTypography
} as const;

export const drawerTextareaStyle: TextareaProps = {
  ...drawerInputTypography,
  color: '#111824',
  _placeholder: drawerInputPlaceholderStyle
};

export const drawerInputStyle: InputProps = {
  ...drawerInputTypography,
  color: '#111824',
  _placeholder: drawerInputPlaceholderStyle
};
