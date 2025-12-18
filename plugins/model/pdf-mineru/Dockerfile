# ---- 基础镜像 ----
FROM python:3.12-slim

# ---- 工作目录 ----
WORKDIR /app

# ---- 复制代码 ----
COPY mineru_saas_api.py .
COPY requirements.txt .

# ---- 安装依赖 ----
RUN pip install --no-cache-dir -r requirements.txt

# ---- 环境变量（运行时注入）----
ENV MINERU_TOKEN="YOUR_TOKEN_WILL_BE_INJECTED"

# ---- 暴露端口 ----
EXPOSE 1234

# ---- 启动命令 ----
CMD ["uvicorn", "mineru_saas_api:app", "--host", "0.0.0.0", "--port", "1234"]
