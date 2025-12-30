import React, { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Box, Icon } from '@chakra-ui/react';
import { iconPaths } from './constants';
import type { IconNameType } from './type.d';

const iconCache: Record<string, any> = {};

/**
 * 修复 SVG 内部 ID 冲突（主要针对 linearGradient）
 */
const fixSvgIds = (svg: SVGSVGElement, prefix: string) => {
  const idMap: Record<string, string> = {};

  // 替换 linearGradient 的 id
  svg.querySelectorAll('linearGradient[id]').forEach((el) => {
    const oldId = el.id;
    const newId = `${prefix}-${oldId}`;
    idMap[oldId] = newId;
    el.id = newId;
  });

  // 替换 stroke/fill 中的 url(#xxx) 引用
  svg.querySelectorAll('[stroke^="url(#"], [fill^="url(#"]').forEach((el) => {
    ['stroke', 'fill'].forEach((attr) => {
      const val = el.getAttribute(attr);
      if (val) {
        el.setAttribute(
          attr,
          val.replace(/url\(#([^)]+)\)/, (_, id) => `url(#${idMap[id] || id})`)
        );
      }
    });
  });
};

const MyIcon = ({ name, w = 'auto', h = 'auto', ...props }: { name: IconNameType } & IconProps) => {
  const [, setUpdate] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgId = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  useEffect(() => {
    if (iconCache[name]) return;
    iconPaths[name]?.()
      .then((icon) => {
        iconCache[name] = { as: icon.default };
        setUpdate((p) => p + 1);
      })
      .catch(console.log);
  }, [name]);

  useLayoutEffect(() => {
    if (!name.includes('Linear')) return;
    const svg = wrapperRef.current?.querySelector('svg');
    if (svg) fixSvgIds(svg, svgId);
  });

  const IconComponent = iconCache[name];

  return IconComponent ? (
    <Box ref={wrapperRef} display={'contents'}>
      <Icon
        {...IconComponent}
        w={w}
        h={h}
        boxSizing={'content-box'}
        verticalAlign={'top'}
        fill={'currentcolor'}
        {...props}
      />
    </Box>
  ) : (
    <Box w={w} h={'1px'} />
  );
};

export default React.memo(MyIcon);
