import React, { useId } from 'react';

type LoopEndLinearLinearProps = React.SVGProps<SVGSVGElement>;

const LoopEndLinearLinear: React.FC<LoopEndLinearLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M6.00001 34V22M6.00001 22H18M6.00001 22L12 27.4C15.2977 30.3577 19.5702 31.9955 24 32C28.7739 32 33.3523 30.1036 36.7279 26.7279C40.1036 23.3523 42 18.7739 42 14"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="34"
          x2="24"
          y2="14"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFB1FE" />
          <stop offset="1" stopColor="#7B93FF" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default LoopEndLinearLinear;
