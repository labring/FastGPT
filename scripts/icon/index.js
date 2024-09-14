const path = require('path');
const fs = require('fs');
const express = require('express');

function findSvgFiles(dir, relativePath = '') {
  let svgFiles = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.resolve(dir, item.name);
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

const svgDir = path.resolve(__dirname, '../../packages/web/components/common/Icon/icons');
const svgPaths = findSvgFiles(svgDir);

const app = express();

app.use('/icons', express.static(svgDir));

app.get('/', (req, res) => {
  let iconHtml = ``;

  svgPaths.forEach((filePath) => {
    const name = filePath.split('.')[0];

    const icon = fs.readFileSync(`${svgDir}/${filePath}`, 'utf8');

    iconHtml += `<div class="item" id="${name}" onclick="onclickCopy('${name}')">
      ${icon}
      <div>${name}</div>
    </div>`;
  });

  const html = `
<html><head><title>SVG Icons</title></head>
  <style>
      * {
        box-sizing: border-box;
      }
      .grid {
        display: grid;
        grid-gap: 10px;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        padding: 10px;
        background-color: #F0F1F6;
      }
      .item {
        width: 100%;
        height: 100%;
        text-align: center;
        border: 1px solid #DFE2EA;
        padding: 10px 5px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      }
      .item:hover{
        background-color: rgba(17, 24, 36, 0.1);
      }
      svg {
        width: 30px;
        height: 30px;
        margin: auto;
        fill: #999;
      }
      
  </style>
  <body>
    <div class="grid">
    ${iconHtml}
    </div>
  </body>
  <script>
    const onclickCopy = (name) => {
      console.log(name)
      try {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(name);
        } else {
          throw new Error('');
        }
      } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = name;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body?.removeChild(textarea);
      }
    };
  </script>
</html>
  `;

  res.send(html);
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Preview icons server running at http://localhost:${PORT}`);
});
