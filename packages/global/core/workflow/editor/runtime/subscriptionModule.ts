import type {
  WorkflowChange,
  WorkflowFieldIdentity,
  WorkflowFieldQuery,
  WorkflowIssueUpdate
} from '../types';

type Listener = () => void;
type ChangeListener = (change: WorkflowChange) => void;
type IssueListener = (update: WorkflowIssueUpdate) => void;
type ListenerRegistry = Map<string, Set<Listener>>;

const getFieldIdentityKey = ({ nodeId, key, kind }: WorkflowFieldIdentity) =>
  `${nodeId}\0${kind}\0${key}`;

const getFieldQueryKey = ({ nodeId, fieldKey, kind }: WorkflowFieldQuery) =>
  `${nodeId}\0${kind ?? '*'}\0${fieldKey}`;

const notify = (listeners: Iterable<Listener>) => {
  [...listeners].forEach((listener) => {
    try {
      listener();
    } catch {
      // 一个 scoped listener 失败不能阻止其他消费者观察同一事务。
    }
  });
};

const subscribeSet = <T>(listeners: Set<T>, listener: T) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const subscribeRegistry = (registry: ListenerRegistry, key: string, listener: Listener) => {
  const listeners = registry.get(key) ?? new Set<Listener>();
  listeners.add(listener);
  registry.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) registry.delete(key);
  };
};

const collectRegistryListeners = (registry: ListenerRegistry, keys: readonly string[]) => {
  const listeners = new Set<Listener>();
  keys.forEach((key) => registry.get(key)?.forEach((listener) => listeners.add(listener)));
  return listeners;
};

const collectFieldListeners = (
  registry: ListenerRegistry,
  identities: readonly WorkflowFieldIdentity[]
) => {
  const listeners = new Set<Listener>();
  identities.forEach((identity) => {
    [
      getFieldIdentityKey(identity),
      getFieldQueryKey({ nodeId: identity.nodeId, fieldKey: identity.key })
    ].forEach((key) => registry.get(key)?.forEach((listener) => listeners.add(listener)));
  });
  return listeners;
};

/** Runtime 唯一通知路由；Adapter 只转发这些按领域拆分的订阅入口。 */
export const createSubscriptionModule = () => {
  let disposed = false;
  const listeners = new Set<ChangeListener>();
  const issueListeners = new Set<IssueListener>();
  const workflowListeners = new Set<Listener>();
  const nodeListeners: ListenerRegistry = new Map();
  const nodeViewListeners: ListenerRegistry = new Map();
  const fieldListeners: ListenerRegistry = new Map();
  const referenceListeners = new Set<Listener>();

  const publish = (change: WorkflowChange) => {
    listeners.forEach((listener) => {
      try {
        listener(change);
      } catch {
        // 一个全局 listener 失败不能破坏事务后的其他观察者。
      }
    });

    const structureChanged = change.kind === 'replace' || change.affectedRecords.structure;
    if (change.kind === 'geometry') {
      notify(collectRegistryListeners(nodeListeners, change.changedRecords.nodeViewIds));
      notify(collectRegistryListeners(nodeViewListeners, change.changedRecords.nodeViewIds));
      return;
    }

    const nodeDataIds =
      change.kind === 'replace'
        ? [...nodeListeners.keys()]
        : [
            ...new Set([
              ...change.changedRecords.nodeIds,
              ...change.affectedRecords.nodeIds,
              ...change.changedRecords.fieldIds.map((field) => field.nodeId),
              ...change.affectedRecords.fieldIds.map((field) => field.nodeId),
              ...change.changedRecords.nodeViewIds
            ])
          ];
    const nodeData =
      change.kind === 'replace'
        ? new Set([...nodeListeners.values()].flatMap((listeners) => [...listeners]))
        : collectRegistryListeners(nodeListeners, nodeDataIds);
    const nodeViews =
      change.kind === 'replace'
        ? new Set([...nodeViewListeners.values()].flatMap((listeners) => [...listeners]))
        : collectRegistryListeners(nodeViewListeners, change.changedRecords.nodeViewIds);
    const fields =
      change.kind === 'replace'
        ? new Set([...fieldListeners.values()].flatMap((listeners) => [...listeners]))
        : collectFieldListeners(fieldListeners, [
            ...change.changedRecords.fieldIds,
            ...change.affectedRecords.fieldIds
          ]);

    notify(nodeData);
    notify(nodeViews);
    notify(fields);

    if (
      change.kind === 'replace' ||
      change.affectedRecords.structure ||
      change.changedRecords.edgeIds.length > 0
    ) {
      notify(referenceListeners);
    }
    if (structureChanged) notify(workflowListeners);
  };

  const publishIssues = (update: WorkflowIssueUpdate) => {
    notify(collectRegistryListeners(nodeListeners, update.nodeIds));
    notify([...fieldListeners.values()].flatMap((listeners) => [...listeners]));
    notify(referenceListeners);
    issueListeners.forEach((listener) => {
      try {
        listener(update);
      } catch {
        // 一个 issue listener 失败不能阻止其他消费者观察本次刷新。
      }
    });
  };

  const subscribe = (listener: ChangeListener) =>
    disposed ? () => undefined : subscribeSet(listeners, listener);
  const subscribeIssues = (listener: IssueListener) => {
    if (disposed) return () => undefined;
    issueListeners.add(listener);
    return () => issueListeners.delete(listener);
  };
  const subscribeWorkflow = (listener: Listener) =>
    disposed ? () => undefined : subscribeSet(workflowListeners, listener);
  const subscribeNode = (nodeId: string, listener: Listener) =>
    disposed ? () => undefined : subscribeRegistry(nodeListeners, nodeId, listener);
  const subscribeNodeView = (nodeId: string, listener: Listener) =>
    disposed ? () => undefined : subscribeRegistry(nodeViewListeners, nodeId, listener);
  const subscribeField = (query: WorkflowFieldQuery, listener: Listener) =>
    disposed
      ? () => undefined
      : subscribeRegistry(fieldListeners, getFieldQueryKey(query), listener);
  const subscribeReferenceOptions = (listener: Listener) =>
    disposed ? () => undefined : subscribeSet(referenceListeners, listener);

  const clear = () => {
    disposed = true;
    listeners.clear();
    issueListeners.clear();
    workflowListeners.clear();
    nodeListeners.clear();
    nodeViewListeners.clear();
    fieldListeners.clear();
    referenceListeners.clear();
  };

  return {
    publish,
    publishIssues,
    subscribe,
    subscribeIssues,
    subscribeWorkflow,
    subscribeNode,
    subscribeNodeView,
    subscribeField,
    subscribeReferenceOptions,
    clear
  };
};
