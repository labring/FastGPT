import { useCallback, useRef } from 'react';
import { useUpdateNodeInternals } from 'reactflow';

type NodeHandleSubscription = {
  retain: () => () => void;
};

// 按真实节点 DOM 隔离，多个画布使用相同 nodeId 时也不会共享监听或刷新回调。
const nodeHandleSubscriptions = new WeakMap<HTMLElement, NodeHandleSubscription>();

/**
 * 在公共 Handle 层同步动态端口，覆盖增删、换 ID、排序及节点尺寸不变的内部重排。
 * 同一节点共享一个 DOM 监听器，每帧最多刷新一次；普通内容更新且端口布局未变时跳过。
 * 端口自身的样式变化参与测量；节点整体尺寸沿用 ReactFlow 的 ResizeObserver，忽略画布平移。
 */
export const useHandleInternals = (nodeId: string) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const releaseRef = useRef<(() => void) | undefined>();

  return useCallback(
    (handle: HTMLDivElement | null) => {
      releaseRef.current?.();
      releaseRef.current = undefined;

      const nodeElement = handle?.closest<HTMLElement>('.react-flow__node');
      const view = nodeElement?.ownerDocument.defaultView;
      if (!nodeElement || !view) return;

      let subscription = nodeHandleSubscriptions.get(nodeElement);
      if (!subscription) {
        let subscribers = 0;
        let frame: number | undefined;
        let previousLayout: string | undefined;

        /** 在 DOM 提交后读取最终端口顺序和相对坐标，平移节点不会被当作内部布局变化。 */
        const scheduleRefresh = () => {
          if (frame !== undefined) return;
          frame = view.requestAnimationFrame(() => {
            frame = undefined;
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

      releaseRef.current = subscription.retain();
    },
    [nodeId, updateNodeInternals]
  );
};
