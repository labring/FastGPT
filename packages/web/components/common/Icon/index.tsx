import React, { useEffect, useId, useLayoutEffect, useState } from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Box, Icon } from '@chakra-ui/react';
import { iconPaths } from './constants';
import type { IconNameType } from './type';
import { scopeSvgElementIds } from './svgScope';

const iconCache: Record<string, any> = {};
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const MyIcon = ({ name, w = 'auto', h = 'auto', ...props }: { name: IconNameType } & IconProps) => {
  const [, setUpdate] = useState(0);
  const scopeId = useId().replace(/:/g, '');

  useEffect(() => {
    if (iconCache[name]) {
      return;
    }

    iconPaths[name]?.()
      .then((icon) => {
        const component = { as: icon.default };
        // Store in cache
        iconCache[name] = component;
        setUpdate((prev) => prev + 1); // force update
      })
      .catch((error) => console.log(error));
  }, [name]);

  const IconComponent = iconCache[name];

  useBrowserLayoutEffect(() => {
    const svg = document.querySelector<SVGSVGElement>(
      `svg[data-fastgpt-icon-instance="${scopeId}"]`
    );
    if (!svg) return;

    scopeSvgElementIds(svg, scopeId, `${scopeId}-${name}`);
  }, [IconComponent, name, scopeId]);

  return !!IconComponent ? (
    <Icon
      {...IconComponent}
      w={w}
      h={h}
      boxSizing={'content-box'}
      verticalAlign={'top'}
      fill={'currentcolor'}
      {...props}
      data-fastgpt-icon-instance={scopeId}
    />
  ) : (
    <Box w={w} h={'1px'} />
  );
};

export default React.memo(MyIcon);
