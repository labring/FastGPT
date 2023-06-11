import React, { useEffect, useRef, memo, useCallback, useState } from 'react';
import { Box } from '@chakra-ui/react';
// @ts-ignore
import mermaid from 'mermaid';
import MyIcon from '../Icon';

import styles from './index.module.scss';

const mermaidAPI = mermaid.mermaidAPI;
mermaidAPI.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    fontSize: '14px',
    primaryColor: '#d6e8ff',
    primaryTextColor: '#485058',
    primaryBorderColor: '#fff',
    lineColor: '#5A646E',
    secondaryColor: '#B5E9E5',
    tertiaryColor: '#485058'
  }
});

const MermaidBlock = ({ code }: { code: string }) => {
  const dom = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    try {
      const formatCode = code.replace(/：/g, ':');

      mermaidAPI.render(`mermaid-${Date.now()}`, formatCode, (svgCode: string) => {
        setSvg(svgCode);
      });
    } catch (error) {
      console.log(error);
    }
  }, [code]);

  const onclickExport = useCallback(() => {
    const svg = dom.current?.children[0];
    if (!svg) return;

    const w = svg.clientWidth * 4;
    const h = svg.clientHeight * 4;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // 绘制白色背景
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dom.current.innerHTML)}`;

    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);

      const jpgDataUrl = canvas.toDataURL('image/jpeg', 1);
      const a = document.createElement('a');
      a.href = jpgDataUrl;
      a.download = 'mermaid.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.onerror = (e) => {
      console.log(e);
    };
  }, []);

  return (
    <Box position={'relative'}>
      <Box
        ref={dom}
        className={styles.mermaid}
        minH={'50px'}
        py={4}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <MyIcon
        name={'export'}
        w={'20px'}
        position={'absolute'}
        color={'myGray.600'}
        _hover={{
          color: 'myBlue.700'
        }}
        right={0}
        top={0}
        cursor={'pointer'}
        onClick={onclickExport}
      />
    </Box>
  );
};

export default memo(MermaidBlock);
