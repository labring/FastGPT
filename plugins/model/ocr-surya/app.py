#!/usr/bin/env python
# -*- coding: utf-8 -*-
import base64
import io
import json
import logging
import os
from typing import List, Optional

import torch
import uvicorn
from fastapi import FastAPI, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from PIL import Image, ImageFile
from pydantic import BaseModel
from surya.model.detection.model import load_model as load_det_model
from surya.model.detection.model import load_processor as load_det_processor
from surya.model.recognition.model import load_model as load_rec_model
from surya.model.recognition.processor import load_processor as load_rec_processor
from surya.ocr import run_ocr
from surya.schema import OCRResult
import warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="transformers")
app = FastAPI()
security = HTTPBearer()
env_bearer_token = None


# GPU显存回收
def torch_gc():
    if torch.cuda.is_available():  # 检查是否可用CUDA
        torch.cuda.empty_cache()  # 清空CUDA缓存
        torch.cuda.ipc_collect()  # 收集CUDA内存碎片


class ImageReq(BaseModel):
    images: List[str]
    sorted: Optional[bool] = False


class Singleton(type):

    def __call__(cls, *args, **kwargs):
        if not hasattr(cls, '_instance'):
            cls._instance = super().__call__(*args, **kwargs)
        return cls._instance


class Surya(metaclass=Singleton):

    def __init__(self):
        self.langs = json.loads(os.getenv("LANGS", '["zh", "en"]'))
        self.batch_size = os.getenv("BATCH_SIZE")
        if self.batch_size is not None:
            self.batch_size = int(self.batch_size)
        self.det_processor, self.det_model = load_det_processor(
        ), load_det_model()
        self.rec_model, self.rec_processor = load_rec_model(
        ), load_rec_processor()

    def run(self, image: ImageFile.ImageFile) -> List[OCRResult]:
        predictions = run_ocr([image], [self.langs], self.det_model,
                              self.det_processor, self.rec_model,
                              self.rec_processor, self.batch_size)
        return predictions


class Chat(object):

    def __init__(self):
        self.surya = Surya()

    def base64_to_image(base64_string: str) -> ImageFile.ImageFile:
        image_data = base64.b64decode(base64_string)
        image_stream = io.BytesIO(image_data)
        image = Image.open(image_stream)
        return image

    def sort_text_by_bbox(original_data: List[dict]) -> str:
        # 根据bbox进行排序，从左到右，从上到下。返回排序后的按行的字符串。
        # 排序
        lines, line = [], []
        original_data.sort(key=lambda item: item["bbox"][1])
        for item in original_data:
            mid_h = (item["bbox"][1] + item["bbox"][3]) / 2
            if len(line) == 0 or (mid_h >= line[0]["bbox"][1]
                                  and mid_h <= line[0]["bbox"][3]):
                line.append(item)
            else:
                lines.append(line)
                line = [item]
        lines.append(line)
        for line in lines:
            line.sort(key=lambda item: item["bbox"][0])
        # 构建行字符串
        string_result = ""
        for line in lines:
            for item in line:
                string_result += item["text"] + " "
            string_result += "\n"
        return string_result

    def query_ocr(self, image_base64: str,
                  sorted: bool) -> str:
        if image_base64 is None or len(image_base64) == 0:
            return ""
        try:
            image = Chat.base64_to_image(image_base64)
            ocr_result = self.surya.run(image)
            result = []

            for text_line in ocr_result[0].text_lines:
                result.append(text_line.text)

            if sorted:
                result = self.sort_text_lines(result)

            # 将所有文本行合并成一个字符串，用换行符分隔
            final_result = "\n".join(result)

            torch_gc()
            return final_result
        except Exception as e:
            logging.error(f"OCR 处理失败: {e}")
            raise HTTPException(status_code=400, detail=f"OCR 处理失败: {str(e)}")

    @staticmethod
    def sort_text_lines(text_lines: List[str]) -> List[str]:
        # 这里可以实现自定义的排序逻辑
        # 目前只是简单地返回原始列表，因为我们没有位置信息来进行排序
        return text_lines

@app.post('/v1/ocr/text')
async def handle_post_request(
    image_req: ImageReq,
    credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    if env_bearer_token is not None and token != env_bearer_token:
        raise HTTPException(status_code=401, detail="无效的令牌")
    chat = Chat()
    try:
        results = []
        for image_base64 in image_req.images:
            results.append(chat.query_ocr(image_base64, image_req.sorted))
        return {"error": None, "results": results}
    except HTTPException as he:
        raise he
    except Exception as e:
        logging.error(f"识别报错：{e}")
        raise HTTPException(status_code=500, detail=f"识别出错: {str(e)}")

if __name__ == "__main__":
    env_bearer_token = os.getenv("ACCESS_TOKEN")
    try:
        uvicorn.run(app, host='0.0.0.0', port=7230)
    except Exception as e:
        logging.error(f"API启动失败！报错：{e}")
