import argparse
import logging
import requests

def saveResponse(path, response):
    # 以二进制写入模式打开文件
    with open(path, 'wb') as file:
        # 将响应的二进制内容写入文件
        file.write(response.content)

def main():
    api = args.api_base
    if args.mode == 'sft':
        url = api + "/api/inference/sft"
        payload={
            'tts': args.tts_text,
            'role': args.spk_id
        }
        response = requests.request("POST", url, data=payload)
        saveResponse(args.tts_wav, response)
    elif args.mode == 'zero_shot':
        url = api + "/api/inference/zero-shot"
        payload={
            'tts': args.tts_text,
            'prompt': args.prompt_text
        }
        files=[('audio', ('prompt_audio.wav', open(args.prompt_wav,'rb'), 'application/octet-stream'))]
        response = requests.request("POST", url, data=payload, files=files)
        saveResponse(args.tts_wav, response)
    elif args.mode == 'cross_lingual':
        url = api + "/api/inference/cross-lingual"
        payload={
            'tts': args.tts_text,
        }
        files=[('audio', ('prompt_audio.wav', open(args.prompt_wav,'rb'), 'application/octet-stream'))]
        response = requests.request("POST", url, data=payload, files=files)
        saveResponse(args.tts_wav, response)
    else:
        url = api + "/api/inference/instruct"
        payload = {
            'tts': args.tts_text,
            'role': args.spk_id,
            'instruct': args.instruct_text
        }
        response = requests.request("POST", url, data=payload)
        saveResponse(args.tts_wav, response)
    logging.info("Response save to {}", args.tts_wav)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--api_base',
                        type=str,
                        default='http://127.0.0.1:50000')
    parser.add_argument('--mode',
                        default='sft',
                        choices=['sft', 'zero_shot', 'cross_lingual', 'instruct'],
                        help='request mode')
    parser.add_argument('--tts_text',
                        type=str,
                        default='你好，我是通义千问语音合成大模型，请问有什么可以帮您的吗？')
    parser.add_argument('--spk_id',
                        type=str,
                        default='中文男')
    parser.add_argument('--prompt_text',
                        type=str,
                        default='希望你以后能够做的比我还好呦。')
    parser.add_argument('--prompt_wav',
                        type=str,
                        default='../../../zero_shot_prompt.wav')
    parser.add_argument('--instruct_text',
                        type=str,
                        default='Theo \'Crimson\', is a fiery, passionate rebel leader. Fights with fervor for justice, but struggles with impulsiveness.')
    parser.add_argument('--tts_wav',
                        type=str,
                        default='loushiming.mp3')
    args = parser.parse_args()
    prompt_sr, target_sr = 16000, 22050
    main()
