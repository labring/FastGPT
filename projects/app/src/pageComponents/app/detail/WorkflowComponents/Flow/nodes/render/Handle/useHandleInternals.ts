import { useCallback, useLayoutEffect, useRef } from 'react';
import { useUpdateNodeInternals } from 'reactflow';

type NodeHandleSubscription = {
  retain: () => () => void;
  setConnecting: (isConnecting: boolean) => void;
};

// 按真实节点 DOM 隔离，多个画布使用相同 nodeId 时也不会共享监听或刷新回调。
const nodeHandleSubscriptions = new WeakMap<HTMLElement, NodeHandleSubscription>();

/**
 * 在公共 Handle 层同步动态端口，覆盖增删、换 ID、排序及节点尺寸不变的内部重排。
 * 同一节点共享一个 DOM 监听器，每帧最多刷新一次；普通内容更新且端口布局未变时跳过。
 * 端口样式变化参与测量；连线期间暂缓并在结束后合并刷新，避免高亮尺寸影响已有边。
 */
export const useHandleInternals = (nodeId: string, isConnecting = false) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const isConnectingRef = useRef(isConnecting);
  const releaseRef = useRef<(() => void) | undefined>();
  const subscriptionRef = useRef<NodeHandleSubscription | undefined>();

  useLayoutEffect(() => {
    isConnectingRef.current = isConnecting;
    subscriptionRef.current?.setConnecting(isConnecting);
  }, [isConnecting]);

  return useCallback(
    (handle: HTMLDivElement | null) => {
      subscriptionRef.current?.setConnecting(isConnectingRef.current);
      releaseRef.current?.();
      releaseRef.current = undefined;
      if (!handle) return;
      subscriptionRef.current = undefined;

      const nodeElement = handle.closest<HTMLElement>('.react-flow__node');
      const view = nodeElement?.ownerDocument.defaultView;
      if (!nodeElement || !view) return;

      let subscription = nodeHandleSubscriptions.get(nodeElement);
      if (!subscription) {
        let subscribers = 0;
        let frame: number | undefined;
        let previousLayout: string | undefined;
        let connecting = false;

        /** 在 DOM 提交后读取最终端口顺序和相对坐标，平移节点不会被当作内部布局变化。 */
        const scheduleRefresh = () => {
          if (connecting || frame !== undefined) return;
          frame = view.requestAnimationFrame(() => {
            frame = undefined;
            if (connecting) return;
            if (nodeElement.isConnected) {
              const nodeRect = nodeElement.getBoundingClientRect();
              const layout = JSON.stringify(
                Array.from(nodeElement.querySelectorAll<HTMLElement>('.react-flow__handle')).map(
                  (element) => {
                    const rect = element.getBoundingClientRect();
                    return [
                      element.getAttribute('data-id'),
                      element.getAttribute('data-handlepos'),
                      rect.left - nodeRect.left,
                      rect.top - nodeRect.top,
                      rect.width,
                      rect.height
                    ];
                  }
                )
              );
              if (layout !== previousLayout) {
                previousLayout = layout;
                updateNodeInternals(nodeId);
              }
            }

            // 最后一个端口卸载也要同步空端口；整个节点已卸载时只清理，不刷新旧画布。
            if (subscribers === 0) {
              nodeHandleSubscriptions.delete(nodeElement);
            }
          });
        };

        const observer = new view.MutationObserver((records) => {
          // 只处理结构变动和端口自身的属性，节点拖动或普通输入框样式不触发测量。
          if (
            records.some(
              (record) =>
                record.type === 'childList' ||
                (record.target instanceof view.Element &&
                  record.target.classList.contains('react-flow__handle'))
            )
          ) {
            scheduleRefresh();
          }
        });
        subscription = {
          setConnecting: (isConnecting) => {
            const wasConnecting = connecting;
            connecting = isConnecting;
            if (wasConnecting && !isConnecting) {
              // 排队测量或节点尺寸监听可能覆盖端口缓存，结束后即使布局未变也要重新同步。
              previousLayout = undefined;
              scheduleRefresh();
            }
          },
          retain: () => {
            if (subscribers === 0) {
              observer.observe(nodeElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-id', 'data-handleid', 'data-handlepos', 'style', 'class']
              });
            }
            subscribers += 1;
            scheduleRefresh();
            return () => {
              subscribers -= 1;
              if (subscribers === 0) observer.disconnect();
              scheduleRefresh();
            };
          }
        };
        nodeHandleSubscriptions.set(nodeElement, subscription);
      }

      subscriptionRef.current = subscription;
      subscription.setConnecting(isConnectingRef.current);
      releaseRef.current = subscription.retain();
    },
    [nodeId, updateNodeInternals]
  );
};
