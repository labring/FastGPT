from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, File, UploadFile
import queue
from typing import List
from api import SummaryRequest, SummaryResponse, ExtractedText,process_file,process_summary
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


q = queue.Queue()

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