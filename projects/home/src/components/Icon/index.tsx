import React, { useEffect, useState } from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Icon } from '@chakra-ui/react';

const iconPaths = {
  closeLight: () => import('./closeLight.svg'),
  menu: () => import('./menu.svg'),
  git: () => import('./git.svg'),
  playFill: () => import('./playFill.svg')
};

export type IconName = keyof typeof iconPaths;

const MyIcon = ({ name, w = 'auto', h = 'auto', ...props }: { name: IconName } & IconProps) => {
  const [IconComponent, setIconComponent] = useState<any>(null);

  useEffect(() => {
    iconPaths[name]?.()
      .then((icon) => {
        setIconComponent({ as: icon.default });
      })
      .catch((error) => console.log(error));
  }, [name]);

  return !!name && !!iconPaths[name] ? (
    <Icon
      {...IconComponent}
      w={w}
      h={h}
      boxSizing={'content-box'}
      verticalAlign={'top'}
      fill={'currentcolor'}
      {...props}
    />
  ) : null;
};

export default MyIcon;
