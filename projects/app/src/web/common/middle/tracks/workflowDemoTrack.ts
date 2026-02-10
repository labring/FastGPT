import { nanoid } from 'nanoid';
import { useEffect, useRef } from 'react';
import { webPushTrack } from './utils';

export type WorkflowDemoTrackData = {
  appId: string;
  sessionId: string;
  initNodeCount: number;
  demoSessions: {
    nodeCount: number;
    duration: number;
  }[];
};

const STORAGE_KEY = 'workflowDemoTrack';

let trackData: WorkflowDemoTrackData | null = null;
let demoStartTime: number | null = null;
let demoStartNodeCount = 0;

/**
 * 初始化埋点会话。先补报 localStorage 中上次残留的数据，再创建新会话。
 */
async function init(appId: string, nodeCount: number) {
  // 补报上次残留数据
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const prev = JSON.parse(raw) as WorkflowDemoTrackData;
      if (prev.appId && prev.sessionId) {
        await webPushTrack.workflowDemoMode(prev);
      }
    }
  } catch {}
  localStorage.removeItem(STORAGE_KEY);

  trackData = { appId, sessionId: nanoid(), initNodeCount: nodeCount, demoSessions: [] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trackData));
}

/**
 * 演示模式开关回调。打开时记录起始时间，关闭时结算时长。
 */
function onDemoChange(isOpen: boolean, nodeCount?: number) {
  if (!trackData) return;

  if (isOpen) {
    demoStartTime = Date.now();
    demoStartNodeCount = nodeCount ?? 0;
  } else if (demoStartTime !== null) {
    trackData.demoSessions.push({
      nodeCount: demoStartNodeCount,
      duration: Date.now() - demoStartTime
    });
    demoStartTime = null;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trackData));
}

/**
 * 上报埋点数据（组件卸载时调用）。未关闭的演示会自动结算。
 * 上报成功清理 localStorage，失败则保留等下次 init 补报。
 */
function report() {
  if (!trackData) return;
  if (demoStartTime !== null) onDemoChange(false);

  const data = trackData;
  trackData = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  webPushTrack
    .workflowDemoMode(data)
    ?.then(() => localStorage.removeItem(STORAGE_KEY))
    .catch(() => {});
}

export const workflowDemoTrack = { init, onDemoChange, report };

export function useWorkflowDemoTrack(appId: string, nodeAmount: number, presentationMode: boolean) {
  const nodeAmountRef = useRef(nodeAmount);
  nodeAmountRef.current = nodeAmount;

  // 埋点初始化：等 appId 和节点数据都就绪后，初始化一次埋点会话
  const trackInited = useRef(false);
  useEffect(() => {
    if (nodeAmount > 0 && appId && !trackInited.current) {
      trackInited.current = true;
      workflowDemoTrack.init(appId, nodeAmount);
    }
  }, [nodeAmount, appId]);

  // presentationMode 变化时记录事件，跳过首次渲染
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!trackInited.current) return;
    workflowDemoTrack.onDemoChange(presentationMode, nodeAmountRef.current);
  }, [presentationMode]);

  // 组件卸载时上报
  useEffect(() => {
    return () => {
      if (trackInited.current) {
        workflowDemoTrack.report();
      }
    };
  }, []);
}
