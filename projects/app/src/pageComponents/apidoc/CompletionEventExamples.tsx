import {
  getChatCompletionResponseExamples,
  type CompletionExampleVersion
} from '@fastgpt/global/openapi/core/chat/completion/examples';
import React, { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './CompletionEventExamples.module.scss';

type EventExampleTarget = {
  host: HTMLDivElement;
  id: string;
  version: CompletionExampleVersion;
};

/** 一个 event 对应一个 tab，保留可复制的 SSE 原文，并支持方向键、Home/End 切换。 */
const EventExampleTabs = ({ version }: { version: CompletionExampleVersion }) => {
  const events = useMemo(() => getChatCompletionResponseExamples(version).events, [version]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copyMessage, setCopyMessage] = useState('');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const selected = events[selectedIndex];
  const panelId = `${id}-panel`;

  const selectEvent = (index: number) => {
    setSelectedIndex(index);
    setCopyMessage('');
  };
  const copyExample = async () => {
    try {
      await navigator.clipboard.writeText(selected.value);
      setCopyMessage('已复制');
    } catch {
      setCopyMessage('复制失败，请手动选择代码');
    }
  };

  return (
    <section className={styles.panel} aria-label={`${version} event 示例`}>
      <h4 className={styles.heading}>event 示例</h4>
      <div className={styles.tabs} role="tablist" aria-label="event 取值">
        {events.map((event, index) => (
          <button
            key={event.name}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            className={styles.tab}
            type="button"
            role="tab"
            id={`${id}-${event.name}`}
            aria-controls={panelId}
            aria-selected={index === selectedIndex}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => selectEvent(index)}
            onKeyDown={(event) => {
              const nextIndex = (() => {
                if (event.key === 'ArrowRight') return (index + 1) % events.length;
                if (event.key === 'ArrowLeft') return (index + events.length - 1) % events.length;
                if (event.key === 'Home') return 0;
                if (event.key === 'End') return events.length - 1;
              })();
              if (nextIndex === undefined) return;
              event.preventDefault();
              selectEvent(nextIndex);
              tabRefs.current[nextIndex]?.focus();
            }}
          >
            {event.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={`${id}-${selected.name}`} tabIndex={0}>
        <p className={styles.description}>
          <strong>{selected.label}</strong>
          {selected.description}
        </p>
        <div className={styles.codeBlock}>
          <div className={styles.codeHeader}>
            <span>text/event-stream</span>
            <button type="button" onClick={copyExample} aria-label="复制 event 示例">
              {copyMessage === '已复制' ? '已复制' : '复制示例'}
            </button>
          </div>
          <pre className={styles.code}>
            <code>
              {selected.value.split('\n').map((line, index, lines) => (
                <span
                  key={index}
                  className={line.startsWith('event:') ? styles.eventLine : undefined}
                >
                  {line}
                  {index < lines.length - 1 ? '\n' : ''}
                </span>
              ))}
            </code>
          </pre>
        </div>
        <span className={styles.copyStatus} role="status">
          {copyMessage}
        </span>
      </div>
    </section>
  );
};

/**
 * 在 completions 的 text/event-stream 响应说明下挂载 event tabs。
 * Scalar 延迟渲染或切换为 JSON/收起响应时，按当前 SSE 说明节点挂载和回收，不改动原生响应内容。
 */
export const CompletionEventExamples = ({ rootRef }: { rootRef: RefObject<HTMLDivElement> }) => {
  const [targets, setTargets] = useState<EventExampleTarget[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mounted = new Map<HTMLElement, EventExampleTarget>();
    const selector =
      'section[id$="/POST/v1/chat/completions"], section[id$="/POST/v2/chat/completions"]';
    const syncTargets = () => {
      const active = new Set<HTMLElement>();
      for (const operation of root.querySelectorAll<HTMLElement>(selector)) {
        const description = [
          ...operation.querySelectorAll<HTMLElement>(
            '.operation-details .parameter-item-container > .property > .property-description'
          )
        ].find((element) => element.textContent?.trim().startsWith('工作流 SSE 事件流'));
        if (!description) continue;
        active.add(description);
        const existing = mounted.get(description);
        if (existing && description.nextElementSibling === existing.host) continue;
        existing?.host.remove();
        const host = document.createElement('div');
        host.className = styles.host;
        description.after(host);
        mounted.set(description, {
          host,
          id: operation.id,
          version: operation.id.endsWith('/POST/v1/chat/completions') ? 'v1' : 'v2'
        });
      }
      for (const [description, target] of mounted) {
        if (active.has(description)) continue;
        target.host.remove();
        mounted.delete(description);
      }
      const next = [...mounted.values()];
      setTargets((previous) =>
        previous.length === next.length && previous.every((target, index) => target === next[index])
          ? previous
          : next
      );
    };
    const observer = new MutationObserver(syncTargets);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    syncTargets();
    return () => {
      observer.disconnect();
      mounted.forEach(({ host }) => host.remove());
    };
  }, [rootRef]);

  return (
    <>
      {targets.map(({ host, id, version }) =>
        createPortal(<EventExampleTabs version={version} />, host, id)
      )}
    </>
  );
};
