import React, { useId } from 'react';

type LoopRunStartLinearProps = React.SVGProps<SVGSVGElement>;

const LoopRunStartLinear: React.FC<LoopRunStartLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      {...props}
    >
      <path
        d="M42 14V26M42 26H30M42 26L36 20.6C32.7023 17.6423 28.4298 16.0045 24 16C19.2261 16 14.6477 17.8964 11.2721 21.2721C7.89642 24.6477 6 29.2261 6 34"
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
          <stop stop-color="#6EE7B7" />
          <stop offset="1" stop-color="#2DD4BF" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default LoopRunStartLinear;
