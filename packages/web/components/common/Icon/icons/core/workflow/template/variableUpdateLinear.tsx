import React, { useId } from 'react';

type VariableUpdateLinearLinearProps = React.SVGProps<SVGSVGElement>;

const VariableUpdateLinearLinear: React.FC<VariableUpdateLinearLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M16 42C16 42 8 36 8 24C8 12 16 6 16 6M32 6C32 6 40 12 40 24C40 36 32 42 32 42M30 18L18 30M18 18L30 30"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="6"
          x2="24"
          y2="42"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFBF8B" />
          <stop offset="1" stopColor="#FF7964" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default VariableUpdateLinearLinear;
