'use client';

import React, { useMemo } from 'react';

type FastGPTLinkProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

const defaultStyles: React.CSSProperties = {
  color: '#3370ff',
  textDecoration: 'none',
  transition: 'all 0.2s ease-in-out'
};

const hoverStyles: React.CSSProperties = {
  color: '#2152d9',
  textDecoration: 'underline'
};

const FastGPTLink = ({ children, className, style, onClick, ...props }: FastGPTLinkProps) => {
  const href = useMemo(() => {
    return process.env.FASTGPT_HOME_DOMAIN ?? 'https://fastgpt.io';
  }, []);

  const [isHovered, setIsHovered] = React.useState(false);

  const combinedStyles = {
    ...defaultStyles,
    ...(isHovered ? hoverStyles : {}),
    ...style
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={combinedStyles}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick(e);
        }
      }}
      {...props}
    >
      {children}
    </a>
  );
};

export default React.memo(FastGPTLink);
