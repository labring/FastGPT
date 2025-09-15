import { create } from 'jsondiffpatch';

const createWorkflowDiffPatcher = () =>
  create({
    objectHash: (obj: any) => obj.id || obj.nodeId || obj._id,
    propertyFilter: (name: string) => name !== 'selected'
  });

const diffPatcher = createWorkflowDiffPatcher();

export const getAppConfigByDiff = <T extends Record<string, unknown>>(
  initialState?: T,
  diff?: ReturnType<typeof diffPatcher.diff>
) => {
  return diffPatcher.patch(structuredClone(initialState), diff) as T;
};
