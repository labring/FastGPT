import { useRouter } from 'next/router';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * CSR 业务子树只在路由首次就绪后挂载，统一保障 query 驱动的请求和表单初始化。
 * SSR 页面直接放行；首次就绪后不再关闭门禁，避免后续导航卸载页面、丢失编辑状态。
 */
const ClientRouteReadyGate = ({
  enabled,
  children
}: {
  enabled: boolean;
  children?: ReactNode;
}) => {
  const { isReady } = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // hydration 首次必须与服务端一样关闭门禁，提交后才能开放业务子树。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady) setReady(true);
  }, [isReady]);

  // 服务端和 hydration 首次渲染都关闭 CSR 门禁，由 effect 开放，保持两端输出一致。
  if (enabled && !ready) return null;
  return children;
};

export default ClientRouteReadyGate;
