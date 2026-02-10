import { nanoid } from 'nanoid';
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

const trackData = { current: null as WorkflowDemoTrackData | null };
const demoStartInfo = { current: null as { startTime: number; nodeCount: number } | null };

function saveToStorage() {
  if (trackData.current) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trackData.current));
  }
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

async function recoverFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as WorkflowDemoTrackData;
      if (data.appId && data.sessionId) {
        await webPushTrack.workflowDemoMode(data);
      }
      clearStorage();
    }
  } catch {
    clearStorage();
  }
}

async function init(appId: string, nodeCount: number) {
  await recoverFromStorage();
  trackData.current = {
    appId,
    sessionId: nanoid(),
    initNodeCount: nodeCount,
    demoSessions: []
  };
  saveToStorage();
}

function onDemoChange(isOpen: boolean, nodeCount: number) {
  if (!trackData.current) return;

  if (isOpen) {
    demoStartInfo.current = { startTime: Date.now(), nodeCount };
  } else if (demoStartInfo.current) {
    const duration = Date.now() - demoStartInfo.current.startTime;
    trackData.current.demoSessions.push({
      nodeCount: demoStartInfo.current.nodeCount,
      duration
    });
    demoStartInfo.current = null;
  }
  saveToStorage();
}

function report() {
  if (!trackData.current) return;
  if (demoStartInfo.current) {
    onDemoChange(false, 0);
  }
  saveToStorage();
  webPushTrack
    .workflowDemoMode(trackData.current)
    ?.then(() => {
      clearStorage();
    })
    .catch(() => {});
  trackData.current = null;
}

export const workflowDemoTrack = {
  init,
  onDemoChange,
  report
};
