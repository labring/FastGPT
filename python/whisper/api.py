from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import whisper
import subprocess
import os
import uuid

app = FastAPI()

# 载入模型
model = whisper.load_model("medium")

# OpenCC 命令，用于将繁体中文转换为简体中文
OPENCC_COMMAND = "opencc -c t2s.json"

@app.post('/v1/audio/transcriptions')
async def transcribe_audio(file: UploadFile = File(...)):
    # 检查文件是否存在
    if not file:
        raise HTTPException(status_code=400, detail="No audio file provided")

    # 生成唯一文件名
    unique_filename = str(uuid.uuid4()) + ".mp3"

    # 保存上传的音频文件
    audio_file_path = os.path.join("/tmp", unique_filename)
    with open(audio_file_path, "wb") as audio_file:
        audio_file.write(await file.read())

    # 转录音频文件
    result = model.transcribe(audio_file_path)["text"]

    try:
        # 使用 OpenCC 将繁体中文转换为简体中文
        result_simplified = subprocess.check_output(
            f"echo '{result}' | {OPENCC_COMMAND}", shell=True, text=True
        ).strip()

        # 返回转录结果
        return JSONResponse(content={"text": result_simplified}, status_code=200)


    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # 无论发生什么情况，都要删除临时上传的音频文件
        os.remove(audio_file_path)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
