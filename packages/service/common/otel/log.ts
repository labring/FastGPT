export function getLogger(name?: string): any {
  return {
    ...console,
    emit: () => {}
  };
}
