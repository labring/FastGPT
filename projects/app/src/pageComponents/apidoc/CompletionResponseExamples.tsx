import {
  getChatCompletionResponseExamples,
  type CompletionExampleVersion
} from '@fastgpt/global/openapi/core/chat/completion/examples';
import React, { useEffect, useMemo, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './CompletionResponseExamples.module.scss';

type ExampleTarget = {
  host: HTMLDivElement;
  id: string;
  version: CompletionExampleVersion;
};
type Scenario = 'default' | 'interactiveUserSelect' | 'interactiveUserInput';

/** 只切换文档示例，不改动请求参数；切换返回形式时重置场景和 event，避免展示不适用的数据。 */
const ResponseExamplePanel = ({ version }: { version: CompletionExampleVersion }) => {
  const examples = useMemo(() => getChatCompletionResponseExamples(version), [version]);
  const [stream, setStream] = useState(false);
  const [detail, setDetail] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('default');
  const [eventName, setEventName] = useState('all');
  const [copyMessage, setCopyMessage] = useState('');
  const scenarios = useMemo(() => {
    const source = stream ? examples.sse : examples.json;
    const basic = stream
      ? detail
        ? examples.sse.detailTrueStreamTrue
        : examples.sse.detailFalseStreamTrue
      : detail
        ? examples.json.detailTrueStreamFalse
        : examples.json.detailFalseStreamFalse;
    return [
      { id: 'default', ...basic },
      ...(detail
        ? [
            { id: 'interactiveUserSelect', ...source.interactiveUserSelect },
            { id: 'interactiveUserInput', ...source.interactiveUserInput }
          ]
        : [])
    ];
  }, [examples, stream, detail]);
  const sample = scenarios.find((item) => item.id === scenario) ?? scenarios[0];
  const selectedEvent =
    stream && detail ? examples.events.find((event) => event.name === eventName) : undefined;
  const content = (() => {
    if (selectedEvent) {
      if (selectedEvent.name === 'interactive' && scenario === 'interactiveUserInput') {
        return examples.sse.interactiveUserInput.value.split('\n\n')[0] + '\n\n';
      }
      return selectedEvent.value;
    }
    return typeof sample.value === 'string' ? sample.value : JSON.stringify(sample.value, null, 2);
  })();
  const lines = content.split('\n');

  const resetSelection = () => {
    setScenario('default');
    setEventName('all');
    setCopyMessage('');
  };
  const copyExample = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyMessage('已复制');
    } catch {
      setCopyMessage('复制失败，请手动选择示例内容');
    }
  };

  return (
    <section className={styles.panel} aria-label={`${version} 响应示例选择`}>
      <div className={styles.controls}>
        <label className={styles.control}>
          <span>stream</span>
          <select
            aria-label="stream"
            value={String(stream)}
            onChange={(event) => {
              setStream(event.target.value === 'true');
              resetSelection();
            }}
          >
            <option value="false">false · JSON</option>
            <option value="true">true · SSE</option>
          </select>
        </label>
        <label className={styles.control}>
          <span>detail</span>
          <select
            aria-label="detail"
            value={String(detail)}
            onChange={(event) => {
              setDetail(event.target.value === 'true');
              resetSelection();
            }}
          >
            <option value="false">false · 精简</option>
            <option value="true">true · 详细</option>
          </select>
        </label>
      </div>
      <div className={styles.filters}>
        <label className={styles.control}>
          <span>场景</span>
          <select
            aria-label="响应示例场景"
            value={sample.id}
            onChange={(event) => {
              setScenario(event.target.value as Scenario);
              setEventName('all');
              setCopyMessage('');
            }}
          >
            {scenarios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.summary}
              </option>
            ))}
          </select>
        </label>
        {stream && detail && (
          <label className={styles.control}>
            <span>event</span>
            <select
              aria-label="SSE event"
              value={eventName}
              onChange={(event) => {
                setEventName(event.target.value);
                setCopyMessage('');
              }}
            >
              <option value="all">全部 event · 场景示例</option>
              {examples.events.map((event) => (
                <option key={event.name} value={event.name}>
                  {event.name} · {event.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className={styles.description}>{selectedEvent?.description ?? sample.description}</p>
      <div className={styles.codeHeader}>
        <span>{stream ? 'text/event-stream' : 'application/json'}</span>
        <button type="button" onClick={copyExample} aria-label="复制响应示例">
          {copyMessage === '已复制' ? '已复制' : '复制示例'}
        </button>
      </div>
      <pre className={styles.code} tabIndex={0} aria-label="响应示例内容">
        <code>
          {lines.map((line, index) => (
            <span key={index} className={line.startsWith('event:') ? styles.eventLine : undefined}>
              {line}
              {index < lines.length - 1 ? '\n' : ''}
            </span>
          ))}
        </code>
      </pre>
      <div className={styles.note}>
        <span>仅切换示例，不修改请求参数。流片段省略 id / object / created / model 占位字段。</span>
        <span role="status">{copyMessage}</span>
      </div>
    </section>
  );
};

/**
 * 将 React 示例面板挂到 Scalar 延迟创建的响应卡片内，保留原生 Schema 开关。
 * 只匹配 completions 的 operation；卡片移除时回收 portal，页面销毁时断开监听。
 */
export const CompletionResponseExamples = ({ rootRef }: { rootRef: RefObject<HTMLDivElement> }) => {
  const [targets, setTargets] = useState<ExampleTarget[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mounted = new Map<HTMLElement, ExampleTarget>();
    const selector =
      'section[id$="/POST/v1/chat/completions"], section[id$="/POST/v2/chat/completions"]';
    const syncTargets = () => {
      const active = new Set<HTMLElement>();
      for (const operation of root.querySelectorAll<HTMLElement>(selector)) {
        const card = operation.querySelector<HTMLElement>('.examples .response-card');
        if (!card) continue;
        active.add(card);
        const existing = mounted.get(card);
        if (existing && card.contains(existing.host)) continue;
        const host = document.createElement('div');
        host.className = styles.host;
        card.append(host);
        mounted.set(card, {
          host,
          id: operation.id,
          version: operation.id.endsWith('/POST/v1/chat/completions') ? 'v1' : 'v2'
        });
      }
      for (const [card, target] of mounted) {
        if (active.has(card)) continue;
        target.host.remove();
        mounted.delete(card);
      }
      const next = [...mounted.values()];
      setTargets((previous) =>
        previous.length === next.length && previous.every((target, index) => target === next[index])
          ? previous
          : next
      );
    };
    const observer = new MutationObserver(syncTargets);
    observer.observe(root, { childList: true, subtree: true });
    syncTargets();
    return () => {
      observer.disconnect();
      mounted.forEach(({ host }) => host.remove());
    };
  }, [rootRef]);

  return (
    <>
      {targets.map(({ host, id, version }) =>
        createPortal(<ResponseExamplePanel version={version} />, host, id)
      )}
    </>
  );
};
