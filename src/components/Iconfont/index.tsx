type TIconfont = {
  name: string;
  color?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
};

function Iconfont({ name, color = 'inherit', width = 16, height = 16, className = '' }: TIconfont) {
  const style = {
    fill: color,
    width,
    height
  };

  return (
    <svg className={`icon ${className}`} aria-hidden="true" style={style}>
      <use xlinkHref={`#${name}`}></use>
    </svg>
  );
}

export default Iconfont;
