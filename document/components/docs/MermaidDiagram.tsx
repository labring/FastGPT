'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { MermaidConfig } from 'mermaid';

const mermaidConfig: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'default'
};

type MermaidDiagramProps = {
  chart: string;
};

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const reactId = useId();
  const renderId = useMemo(
    () => `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [reactId]
  );
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function renderMermaid() {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize(mermaidConfig);

        const { svg } = await mermaid.render(renderId, chart);
        if (!ignore) {
          setSvg(svg);
          setError('');
        }
      } catch (err) {
        if (!ignore) {
          setSvg('');
          setError(err instanceof Error ? err.message : 'Mermaid render failed');
        }
      }
    }

    void renderMermaid();

    return () => {
      ignore = true;
    };
  }, [chart, renderId]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-fd-destructive/30 bg-fd-muted p-4 text-sm">
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <div className="not-prose my-4 overflow-x-auto rounded-lg border bg-fd-card p-4">
      {svg ? (
        <div
          className="min-w-max [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-none"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <pre className="text-sm text-fd-muted-foreground">
          <code>{chart}</code>
        </pre>
      )}
    </div>
  );
}
