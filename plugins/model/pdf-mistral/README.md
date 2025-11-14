# PDF-Mistral 插件

此插件使用 Mistral 的 OCR API 将 PDF 文件转换为 Markdown 文本。它可以从 PDF 文档中提取文本内容和图像，并将它们作为带有嵌入式 base64 图像的 Markdown 返回。

## 功能特点

- 使用 Mistral OCR API 提取 PDF 文本
- Markdown 中的 base64 图像嵌入
- 完善的错误处理
- 支持多页 PDF

## 设置

### 前提条件

- Python 3.8+
- Mistral API 密钥（[在此获取](https://mistral.ai/)）

### 安装

1. 安装所需的软件包：

```bash
pip install -r requirements.txt
```

2. 通过创建/编辑 `.env` 文件设置环境变量：

```bash
# 在 .env 文件中
MISTRAL_API_KEY=你的-mistral-api-密钥
```

## 使用方法

### 启动服务器

使用以下命令运行服务器：

```bash
python api_mp.py
```

或者直接使用 uvicorn：

```bash
uvicorn api_mp:app --host 0.0.0.0 --port 7231
```

然后配置到FastGPT配置文件即可
```json
{
  xxx
  "systemEnv": {
    xxx
    "customPdfParse": {
      "url": "http://localhost:7231/v1/parse/file", // 自定义 PDF 解析服务地址
    }
  }
}
```

### API 端点

#### 解析 PDF 文件

**端点**：`POST /v1/parse/file`

**请求**：
- 包含文件字段的多部分表单数据

**响应**：
```json
{
  "pages": 5,                // PDF 中的页数
  "markdown": "...",         // 带有嵌入式 base64 图像的 Markdown 内容
  "duration": 10.5           // 处理时间（秒）
}
```

**错误响应**：
```json
{
  "pages": 0,
  "markdown": "",
  "error": "错误信息"
}
```

### 使用示例

使用 curl：

```bash
curl -X POST -F "file=@path/to/your/document.pdf" http://localhost:7231/v1/parse/file
```

使用 JavaScript/Axios：

```javascript
const formData = new FormData();
formData.append('file', pdfFile);

const response = await axios.post('http://localhost:7231/v1/parse/file', formData, {
  headers: {
    'Content-Type': 'multipart/form-data'
  }
});

if (response.data.error) {
  console.error('错误:', response.data.error);
} else {
  console.log('页数:', response.data.pages);
  console.log('Markdown:', response.data.markdown);
}
```

## 限制

- PDF 文件必须可读且没有密码保护
- 最大文件大小取决于 Mistral API 限制（目前最大52.4M）
- Mistral API 有页面限制（最多最大1000页）

## 故障排除

### 常见错误

1. **"MISTRAL_API_KEY environment variable not set"（未设置 MISTRAL_API_KEY 环境变量）**
   - 确保您已将 Mistral API 密钥添加到 `.env` 文件中
   - 确保 `.env` 文件与脚本在同一目录中

2. **"Failed to process PDF file"（无法处理 PDF 文件）**
   - PDF 可能已损坏或受密码保护
   - 尝试使用其他 PDF 文件

3. **Mistral API 错误**
   - 检查您的 Mistral API 密钥是否有效
   - 确保您在 Mistral API 速率限制范围内
   - 验证 PDF 是否在大小/页数限制范围内

## 许可证

MIT 许可证