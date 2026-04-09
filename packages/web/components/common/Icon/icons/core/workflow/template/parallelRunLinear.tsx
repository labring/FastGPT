import React, { useId } from 'react';

type ParallelRunLinearProps = React.SVGProps<SVGSVGElement>;

const ParallelRunLinear: React.FC<ParallelRunLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M10 8V40M18 8V40M26 8V40M34 8V40M42 8V40"
        stroke={`url(#${gradientId})`}
        strokeWidth="4"
        strokeLinecap="round"
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
          <stop stopColor="#36BFFA" />
          <stop offset="1" stopColor="#1570EF" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default ParallelRunLinear;
