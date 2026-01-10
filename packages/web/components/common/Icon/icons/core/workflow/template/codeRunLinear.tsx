import React, { useId } from 'react';

type CodeRunLinearLinearProps = React.SVGProps<SVGSVGElement>;

const CodeRunLinearLinear: React.FC<CodeRunLinearLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M36 32L44 24L36 16M12 16L4 24L12 32M29 8L19 40"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="8"
          x2="24"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5AD8C8" />
          <stop offset="1" stopColor="#1CCC9A" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default CodeRunLinearLinear;
