# -*- coding: utf-8 -*-
import os
import io
import time
import zipfile
import base64
import tempfile
from pathlib import Path
from typing import List

import httpx
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from loguru import logger

# --------------------------------------------------------------
# 配置（全部走环境变量，Docker 里通过 -e 注入）
# --------------------------------------------------------------
MINERU_TOKEN = os.getenv("MINERU_TOKEN")          # 必须
MINERU_BASE   = os.getenv("MINERU_BASE", "https://mineru.net")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "3"))   # 秒
POLL_TIMEOUT  = int(os.getenv("POLL_TIMEOUT", "600"))  # 秒
# --------------------------------------------------------------

app = FastAPI(title="MinerU SaaS Wrapper", version="1.0.0")

# ---------- 工具 ----------
def img_to_base64(img_bytes: bytes) -> str:
    return base64.b64encode(img_bytes).decode("utf-8")

def embed_images(md: str, img_dir: Path) -> str:
    """把 markdown 中 ![xxx](relative_path) 替换为 data-uri"""
    lines = md.splitlines()
    out: List[str] = []
    for line in lines:
        if line.startswith("![") and "](" in line and ")" in line:
            start = line.index("](") + 2
            end = line.index(")", start)
            rel = line[start:end]
            img_path = img_dir / rel
            if img_path.is_file():
                b64 = img_to_base64(img_path.read_bytes())
                new_line = f'![](data:image/png;base64,{b64})'
                out.append(new_line)
                continue
        out.append(line)
    return "\n".join(out)

# ---------- SaaS 调用 ----------
async def create_task(file_bytes: bytes, filename: str) -> str:
    url = f"{MINERU_BASE}/api/v4/extract/task"
    headers = {
        "Authorization": f"Bearer {MINERU_TOKEN}",
        "Content-Type": "application/json",
    }
    # 这里使用 VLM（默认），如需 pipeline 可改 model_version
    payload = {
        "url": "",                     # 必填但我们用 upload 方式，留空
        "model_version": "vlm",
    }
    # SaaS 目前只接受 URL，我们先把文件上传到临时公开位置不可行 → 改用 **批量上传** 方式
    # 下面改成 **批量文件上传**（一次只传一个文件），返回 task_id 列表
    raise NotImplementedError("请看下方完整实现")

# --------------------------------------------------------------
# 下面是 **完整实现**（一次只处理一个文件，使用批量上传接口）
# --------------------------------------------------------------
async def _upload_and_create(file_bytes: bytes, filename: str) -> str:
    """
    1. 调用 /api/v4/file-urls/batch 获取上传 URL（一次一个文件）
    2. PUT 上传文件
    3. 系统自动提交解析任务，返回 batch_id
    4. 轮询 /api/v4/extract-results/batch/{batch_id} 取结果
    """
    client = httpx.AsyncClient(timeout=60.0)

    # ---- 1. 申请上传 URL ----
    batch_url = f"{MINERU_BASE}/api/v4/file-urls/batch"
    headers = {"Authorization": f"Bearer {MINERU_TOKEN}", "Content-Type": "application/json"}
    batch_payload = {
        "files": [{"name": filename}],
        "model_version": "vlm"
    }
    r = await client.post(batch_url, headers=headers, json=batch_payload)
    r.raise_for_status()
    batch_resp = r.json()
    if batch_resp.get("code") != 0:
        raise HTTPException(status_code=500, detail=f"MinerU batch create fail: {batch_resp.get('msg')}")
    batch_id = batch_resp["data"]["batch_id"]
    upload_url = batch_resp["data"]["file_urls"][0]
    logger.info(f"Got upload url for {filename}, batch_id={batch_id}")

    # ---- 2. 上传文件 ----
    put_r = await client.put(upload_url, content=file_bytes)
    put_r.raise_for_status()
    logger.info(f"File uploaded, status={put_r.status_code}")

    # ---- 3. 轮询结果 ----
    result_url = f"{MINERU_BASE}/api/v4/extract-results/batch/{batch_id}"
    start = time.time()
    while True:
        if time.time() - start > POLL_TIMEOUT:
            raise HTTPException(status_code=504, detail="MinerU SaaS timeout")
        poll = await client.get(result_url, headers=headers)
        poll.raise_for_status()
        data = poll.json()
        if data.get("code") != 0:
            raise HTTPException(status_code=500, detail=data.get("msg"))

        results = data["data"]["extract_result"]
        # 只有一个文件
        task = results[0]
        state = task["state"]
        logger.debug(f"Polling {batch_id} -> {state}")

        if state == "done":
            zip_url = task["full_zip_url"]
            await client.aclose()
            return zip_url
        if state in ("failed",):
            raise HTTPException(status_code=500, detail=task.get("err_msg", "MinerU parse failed"))
        # pending / running / converting / waiting-file
        await asyncio.sleep(POLL_INTERVAL)

# ---------- 主入口 ----------
import asyncio

@app.post("/v2/parse/file")
async def parse_file(file: UploadFile = File(...)):
    """
    FastGPT 调用的统一入口
    """
    if not MINERU_TOKEN:
        raise HTTPException(status_code=500, detail="MINERU_TOKEN not set")

    allowed = {".pdf", ".png", ".jpeg", ".jpg"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400,
                            detail=f"Unsupported file type {ext}. Allowed: {allowed}")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = Path(file.filename).name
    start = time.time()

    try:
        # 1. 上传 + 提交任务 → 得到 zip_url
        zip_url = await _upload_and_create(file_bytes, filename)

        # 2. 下载 zip
        async with httpx.AsyncClient() as client:
            resp = await client.get(zip_url)
            resp.raise_for_status()
            zip_bytes = resp.content

        # 3. 解压到临时目录
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
                z.extractall(tmp_path)

            # 4. 找 markdown（默认是和文件名同名的 .md）
            md_files = list(tmp_path.rglob("*.md"))
            if not md_files:
                raise HTTPException(status_code=500, detail="No markdown in result zip")
            md_path = md_files[0]
            markdown = md_path.read_text(encoding="utf-8")

            # 5. 嵌入图片（图片在同一级目录或子目录）
            img_dir = md_path.parent
            markdown_b64 = embed_images(markdown, img_dir)

            # 6. 计算页数（zip 中通常有 page_*.png）
            page_imgs = list(tmp_path.rglob("page_*.png")) + list(tmp_path.rglob("page_*.jpg"))
            pages = len(page_imgs)

        logger.info(f"Parse finished, {pages} pages, {time.time()-start:.1f}s")
        return JSONResponse({
            "success": True,
            "message": "",
            "markdown": markdown_b64,
            "pages": pages
        })

    except Exception as e:
        logger.exception(f"Parse error for {filename}")
        raise HTTPException(status_code=500, detail=str(e))

# ---------- 健康检查 ----------
@app.get("/health")
async def health():
    return {"status": "healthy"}

# --------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "1234"))
    host = os.getenv("HOST", "0.0.0.0")
    logger.info(f"Starting MinerU SaaS wrapper on {host}:{port}")
    uvicorn.run("mineru_saas_api:app", host=host, port=port, reload=False)
