import os
import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from office2txt import office_to_txt
from typing import List
from fastapi import HTTPException
from fetch import get_summary
import aiofiles
import queue
import uuid


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 请求模型
class SummaryRequest(BaseModel):
    url: str
    level: int

# 响应模型
class SummaryResponse(BaseModel):
    url: str
    title: str
    summary: str

class ExtractedText(BaseModel):
    text: str

q = queue.Queue()
# 文件转文本
async def process_file(file: UploadFile):
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ['.docx', '.pdf', '.doc', '.txt']:
        return JSONResponse(content={"error": "Unsupported file format"}, status_code=400)

    # 生成唯一的文件名
    unique_filename = f"{uuid.uuid4()}{file_ext}"

    try:
        # 读取文件内容并保存到唯一命名的文件中
        async with aiofiles.open(unique_filename, "wb") as out_file:
            while True:
                contents = await file.read(1024)  # 以块的方式读取文件
                if not contents:
                    break
                await out_file.write(contents)

        # 文件处理逻辑，注意传入新的唯一文件名
        extracted_text = office_to_txt(unique_filename)
        print(extracted_text)
        return {"text": extracted_text}
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
    finally:
        # 清理：删除临时保存的唯一命名文件
        if os.path.exists(unique_filename):
            os.remove(unique_filename)

# 定义一个接口，接收文件并将其放入队列中
@app.post("/extract_text/", response_model=ExtractedText)
async def extract_text(file: UploadFile = File(...)):
    # 将文件对象放入队列中，先进先出
    q.put(file)
    # 从队列中取出文件对象，并调用处理函数
    file = q.get()
    result = await process_file(file)
    # 标记队列中的任务已完成
    q.task_done()
    # 返回处理结果
    return result

# 定义一个处理网页摘要的函数
async def process_summary(request):
    if request.level < 0:
        raise HTTPException(status_code=400, detail="Level must be non-negative.")
    try:
        # 使用定义的函数来获取网页摘要
        summaries = get_summary(request.url, request.level)
        # 将结果转换为响应模型列表
        print(summaries)
        return [SummaryResponse(url=url, title=title, summary=summary) for url, title, summary in summaries]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 定义一个接口，接收请求并将其放入队列中
@app.post("/generate_summary/", response_model=List[SummaryResponse])
async def generate_summary(request: SummaryRequest):
    # 将请求对象放入队列中，先进先出
    q.put(request)
    # 从队列中取出请求对象，并调用处理函数
    request = q.get()
    result = await process_summary(request)
    # 标记队列中的任务已完成
    q.task_done()
    # 返回处理结果
    return result

if __name__ == "__main__":
    
    uvicorn.run(app, host="0.0.0.0", port=6010)