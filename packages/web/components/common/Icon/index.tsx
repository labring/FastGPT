import React, { useEffect, useState } from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Box, Icon } from '@chakra-ui/react';
import { iconPaths } from './constants';
import type { IconNameType } from './type.d';

const iconCache: Record<string, any> = {};

const MyIcon = ({ name, w = 'auto', h = 'auto', ...props }: { name: IconNameType } & IconProps) => {
  const [IconComponent, setIconComponent] = useState<any>(null);

  useEffect(() => {
    if (iconCache[name]) {
      setIconComponent(iconCache[name]);
      return;
    }

    iconPaths[name]?.()
      .then((icon) => {
        const component = { as: icon.default };
        // Store in cache
        iconCache[name] = component;
        setIconComponent(component);
      })
      .catch((error) => console.log(error));
  }, [name]);

  return !!IconComponent ? (
    <Icon
      {...IconComponent}
      w={w}
      h={h}
      boxSizing={'content-box'}
      verticalAlign={'top'}
      fill={'currentcolor'}
      {...props}
    />
  ) : (
    <Box w={w} h={'1px'}></Box>
  );
};

export default MyIcon;
