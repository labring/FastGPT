import os
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.office2txt import office_to_txt
from typing import List
from fastapi import HTTPException
from services.fetch import get_summary
import aiofiles
import queue
import uuid


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



