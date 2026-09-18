/**
 * 成员名表单的共用视觉规格。
 * 强制补齐成员名、账号页修改成员名和接受团队邀请三处入口保持一致的尺寸和描边，
 * 避免同一段 Chakra 样式在多个组件里重复维护。
 */
export const memberNameInputStyles = {
  h: '32px',
  minH: '32px',
  px: '12px',
  fontSize: '12px',
  lineHeight: '16px',
  letterSpacing: '0.048px',
  borderColor: '#E8EBF0',
  borderRadius: '6px'
} as const;

export const memberNameLabelStyles = {
  color: '#24282C',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '16px',
  letterSpacing: '0.5px'
} as const;

export const memberNameButtonStyles = {
  h: '32px',
  minH: '32px',
  px: '14px',
  fontSize: '12px',
  lineHeight: '16px',
  letterSpacing: '0.5px',
  borderRadius: '6px'
} as const;
