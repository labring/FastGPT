import React, { FC, useEffect, useState, useRef } from 'react';
import mermaid from 'mermaid';
import { Spinner } from '@chakra-ui/react';

interface MermaidCodeBlockProps {
  code: string;
}

const MermaidCodeBlock: FC<MermaidCodeBlockProps> = ({ code }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const codeTimeoutIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (codeTimeoutIdRef.current) {
      clearTimeout(codeTimeoutIdRef.current);
    }

    codeTimeoutIdRef.current = window.setTimeout(() => {
      setLoading(true);

      const mermaidAPI = (mermaid as any).mermaidAPI as any;
      mermaidAPI.initialize({ startOnLoad: false, theme: 'forest' });

      try {
        mermaidAPI.parse(code);
        mermaidAPI.render('mermaid-svg', code, (svgCode: string) => {
          setSvg(svgCode);
          setLoading(false);
        });
      } catch (error) {
        console.error('Error parsing Mermaid code:', '\n', error, '\n', 'Code:', code);
        setLoading(false);
        return;
      }
    }, 1000);
  }, [code]);

  useEffect(() => {
    return () => {
      if (codeTimeoutIdRef.current) {
        clearTimeout(codeTimeoutIdRef.current);
      }
    };
  }, []);

  return (
    <>
      {loading ? (
        <div className="loading">
          <img src="/imgs/loading.gif" alt="Loading..." />
        </div>
      ) : (
        <div
          className="mermaid-wrapper"
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
      )}
    </>
  );
};

export default MermaidCodeBlock;
