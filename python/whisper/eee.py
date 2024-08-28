import requests
import json

# 音频文件路径
audio_file_path = 'loushiming.mp3'

# 目标URL
url = 'http://192.168.0.105:8000/v1/audio/transcriptions'

# 构建请求参数
files = {'file': open(audio_file_path, 'rb')}

# 发送POST请求
response = requests.post(url, files=files)

# 打印响应内容
print(response.text)

