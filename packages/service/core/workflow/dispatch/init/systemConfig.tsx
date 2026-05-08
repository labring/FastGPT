export const dispatchSystemConfig = (props: Record<string, any>) => {
  return props.variableState.toRuntimeRecord();
};
