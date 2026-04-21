import React, { useId } from 'react';

type LoopRunBreakLinearProps = React.SVGProps<SVGSVGElement>;

const LoopRunBreakLinear: React.FC<LoopRunBreakLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M30 18H18V30H30V18Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="44"
          x2="24"
          y2="4"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6EE7B7" />
          <stop offset="1" stopColor="#2DD4BF" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default LoopRunBreakLinear;
