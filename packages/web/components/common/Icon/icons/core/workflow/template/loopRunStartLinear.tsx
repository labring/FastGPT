import React, { useId } from 'react';

type LoopRunStartLinearProps = React.SVGProps<SVGSVGElement>;

const LoopRunStartLinear: React.FC<LoopRunStartLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M35.7 24.236C36.825 23.973 37.494 22.814 37.159 21.708L34.716 13.647C34.208 11.971 31.945 11.711 31.07 13.227L29.887 15.275C27.921 14.637 25.831 14.419 23.754 14.651C20.687 14.993 17.808 16.296 15.527 18.374C13.246 20.453 11.682 23.199 11.057 26.221C10.568 28.586 10.674 31.025 11.353 33.323C11.665 34.382 12.865 34.828 13.871 34.373L16.445 33.212C17.451 32.758 17.87 31.57 17.686 30.481C17.526 29.532 17.541 28.556 17.739 27.602C18.072 25.991 18.906 24.526 20.123 23.418C21.339 22.309 22.875 21.614 24.51 21.432C25.118 21.364 25.727 21.368 26.326 21.442L25.31 23.203C24.435 24.719 25.792 26.548 27.497 26.15L35.7 24.236Z"
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

export default LoopRunStartLinear;
