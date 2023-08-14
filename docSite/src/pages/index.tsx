import React, { useEffect } from 'react';

export default function Home(): JSX.Element {
  useEffect(() => {
    location.replace('https://fastgpt.run');
  }, []);
  return <></>;
}
