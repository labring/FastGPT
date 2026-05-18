import { useCallback, useRef, useEffect } from 'react';
import type { OpenedFile } from '../components/FileTabs';
import { writeSkillPackageFile } from '../api';

const AUTO_SAVE_DEBOUNCE_MS = 800;

type UseAutoSaveParams = {
  skillId: string;
};

export const useAutoSave = ({ skillId }: UseAutoSaveParams) => {
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const openedFilesRef = useRef<OpenedFile[]>([]);

  const setOpenedFilesRef = useCallback((files: OpenedFile[]) => {
    openedFilesRef.current = files;
  }, []);

  const writeFile = useCallback(
    async (path: string, content: string) => {
      await writeSkillPackageFile({ skillId, path, content });
    },
    [skillId]
  );

  const scheduleAutoSave = useCallback(
    (path: string, content: string) => {
      const existing = pendingTimersRef.current.get(path);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        pendingTimersRef.current.delete(path);
        const file = openedFilesRef.current?.find((f: OpenedFile) => f.path === path);
        const latest = file?.content ?? content;
        void writeFile(path, latest);
      }, AUTO_SAVE_DEBOUNCE_MS);
      pendingTimersRef.current.set(path, timer);
    },
    [writeFile]
  );

  const flushPendingForPath = useCallback(
    async (prefix: string) => {
      const paths: string[] = [];
      pendingTimersRef.current.forEach((timer, p) => {
        if (p === prefix || p.startsWith(prefix + '/')) {
          clearTimeout(timer);
          paths.push(p);
        }
      });
      paths.forEach((p) => pendingTimersRef.current.delete(p));
      await Promise.all(
        paths.map((p) => {
          const file = openedFilesRef.current?.find((f) => f.path === p);
          if (!file || file.isBinary || file.isUnknown) return Promise.resolve();
          return writeFile(p, file.content);
        })
      );
    },
    [writeFile]
  );

  const cancelPendingForPath = useCallback((prefix: string) => {
    pendingTimersRef.current.forEach((timer, p) => {
      if (p === prefix || p.startsWith(prefix + '/')) {
        clearTimeout(timer);
        pendingTimersRef.current.delete(p);
      }
    });
  }, []);

  const closeFile = useCallback(
    (filePath: string) => {
      const timer = pendingTimersRef.current.get(filePath);
      if (timer) {
        clearTimeout(timer);
        pendingTimersRef.current.delete(filePath);
        const file = openedFilesRef.current?.find((f) => f.path === filePath);
        if (file && !file.isBinary && !file.isUnknown) {
          void writeFile(filePath, file.content);
        }
      }
    },
    [writeFile]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pendingTimersRef.current.forEach((timer, p) => {
        clearTimeout(timer);
        const file = openedFilesRef.current?.find((f) => f.path === p);
        if (file && !file.isBinary && !file.isUnknown) {
          void writeSkillPackageFile({ skillId, path: p, content: file.content }).catch(() => {});
        }
      });
      pendingTimersRef.current.clear();

      openedFilesRef.current?.forEach((file) => {
        if (file.isBinary && file.content.startsWith('blob:')) {
          URL.revokeObjectURL(file.content);
        }
      });
    };
  }, [skillId]);

  return {
    scheduleAutoSave,
    flushPendingForPath,
    cancelPendingForPath,
    closeFile,
    setOpenedFilesRef
  };
};
