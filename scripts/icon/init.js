const path = require('path');
const fs = require('fs');

// 递归读取 packages/web/components/common/Icon/icons 下所有的 svg
function findSvgFiles(dir, relativePath = '') {
  let svgFiles = [];

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relativeItemPath = path.join(relativePath, item.name);

    if (item.isDirectory()) {
      const nestedSvgs = findSvgFiles(fullPath, relativeItemPath);
      svgFiles = svgFiles.concat(nestedSvgs);
    } else if (item.isFile() && item.name.endsWith('.svg')) {
      svgFiles.push(relativeItemPath);
    }
  }

  return svgFiles;
}

const svgPaths = findSvgFiles(`${__dirname}/../../packages/web/components/common/Icon/icons`);

let result = ``;

svgPaths.forEach((path) => {
  const name = path.split('.')[0];
  result += ` '${name}': () => import('./icons/${path}'),\n`;
});

// 把 result 结果写入  '../../packages/web/components/common/Icon/constants'
fs.writeFileSync(
  `${__dirname}/../../packages/web/components/common/Icon/constants.ts`,
  `// @ts-nocheck

  export const iconPaths = {
    ${result}
  };`
);
