import React, { useId } from 'react';

type HttpRequestLinearLinearProps = React.SVGProps<SVGSVGElement>;

const HttpRequestLinearLinear: React.FC<HttpRequestLinearLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M12 16H12.02M20 16H20.02M28 16H28.02M8 8H40C42.2091 8 44 9.79086 44 12V36C44 38.2091 42.2091 40 40 40H8C5.79086 40 4 38.2091 4 36V12C4 9.79086 5.79086 8 8 8Z"
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
          <stop stopColor="#7894FE" />
          <stop offset="1" stopColor="#7179FE" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default HttpRequestLinearLinear;
