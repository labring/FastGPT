export type PaymentRenderData = {
  qrCode?: string;
  iframeCode?: string;
  markdown?: string;
};

/**
 * 按支付内容的展示优先级返回稳定的渲染类型。
 *
 * 该类型同时用作 React key，确保 canvas 二维码与 iframe 支付页切换时重新挂载容器，
 * 避免 React 复用含有手动 appendChild 内容的 DOM 节点。
 */
export const getPaymentRenderType = ({ qrCode, iframeCode, markdown }: PaymentRenderData) => {
  if (qrCode) return 'qrCode';
  if (iframeCode) return 'iframeCode';
  if (markdown) return 'markdown';
  return 'empty';
};
