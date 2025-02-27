from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from tempfile import NamedTemporaryFile
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess
import os

# 加载模型
model_dir = "./iic/SenseVoiceSmall"

model = AutoModel(
    model=model_dir,
    trust_remote_code=True,
    remote_code="./model.py",  
    vad_model="fsmn-vad",
    vad_kwargs={"max_single_segment_time": 30000},
    device="cuda:0",
)

app = FastAPI()

@app.post("/v1/audio/transcriptions")
async def handler(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file was provided")

    # 使用NamedTemporaryFile创建临时文件
    with NamedTemporaryFile(delete=False) as temp_file:
        # 将用户上传的文件写入临时文件
        content = await file.read()
        temp_file.write(content)
        temp_file_path = temp_file.name

    try:
        # 开始运行模型
        result = model.generate(
            input=temp_file_path,
            cache={},
            language="auto", 
            use_itn=True,
            batch_size_s=60,
            merge_vad=True,
            merge_length_s=15,
        )
        text = rich_transcription_postprocess(result[0]["text"])

        # 返回包含结果的JSON响应
        return JSONResponse(content={'text': text})
    finally:
        # 删除临时文件
        os.unlink(temp_file_path)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
