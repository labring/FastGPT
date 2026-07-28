type WorkflowAutoLayoutHandler = () => void;

const handlers = new Set<WorkflowAutoLayoutHandler>();

/** 注册当前画布的布局能力，供画布外的 Builder 等入口复用。 */
export const registerWorkflowAutoLayout = (handler: WorkflowAutoLayoutHandler) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

/** 触发当前已挂载工作流画布的统一自动布局。 */
export const requestWorkflowAutoLayout = () => {
  handlers.forEach((handler) => handler());
  return handlers.size > 0;
};
