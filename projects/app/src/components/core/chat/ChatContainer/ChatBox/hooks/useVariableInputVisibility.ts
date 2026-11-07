import { useEffect, type RefObject } from 'react';

/**
 * 监听聊天滚动容器，判断变量输入区是否处于可视区域。
 *
 * ChatBox 外层需要知道变量表单是否可见，用于同步其它入口的变量展示状态。
 * 这个 hook 只负责 DOM 可见性观测，不负责渲染变量表单，也不改变变量值。
 *
 * 输入约定：
 * - `ScrollContainerRef` 必须绑定聊天滚动容器。
 * - 变量表单使用当前滚动容器内的 data attribute 定位，不依赖页面唯一 DOM id。
 * - `setIsVariableVisible` 来自 ChatItemContext，负责把可见性同步给外层。
 *
 * 边界行为：
 * - 容器未挂载、变量表单不存在或变量表单高度为 0 时，不更新外层状态。
 * - 初次挂载时立即检查一次，之后只在滚动事件中重新计算。
 * - effect cleanup 会移除当前容器上的 listener，避免切换 chat 或卸载时残留监听。
 */
export const useVariableInputVisibility = ({
  ScrollContainerRef,
  setIsVariableVisible
}: {
  ScrollContainerRef: RefObject<HTMLDivElement>;
  setIsVariableVisible: (visible: boolean) => void;
}) => {
  useEffect(() => {
    const checkVariableVisibility = () => {
      if (!ScrollContainerRef.current) return;
      const container = ScrollContainerRef.current;
      // 查询严格限定在当前 ChatBox 的滚动容器内，双面板不会读取到另一侧变量表单。
      const variableInput = container.querySelector('[data-chat-variable-input]');
      if (!variableInput) return;

      const containerRect = container.getBoundingClientRect();
      const elementRect = variableInput.getBoundingClientRect();

      // 高度为 0 通常表示变量区域被折叠或尚未完成布局，此时不写 false，
      // 避免短暂布局状态把外层可见性误置为不可见。
      if (elementRect.height === 0) return;

      setIsVariableVisible(
        containerRect.top < elementRect.bottom && containerRect.bottom > elementRect.top
      );
    };

    const container = ScrollContainerRef.current;
    if (container) {
      checkVariableVisibility();
      container.addEventListener('scroll', checkVariableVisibility);

      return () => {
        container.removeEventListener('scroll', checkVariableVisibility);
      };
    }
  }, [ScrollContainerRef, setIsVariableVisible]);
};
