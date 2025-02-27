# Copyright (c) 2024 Alibaba Inc (authors: Xiang Lyu)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import os
import sys
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append('{}/../../..'.format(ROOT_DIR))
sys.path.append('{}/../../../third_party/Matcha-TTS'.format(ROOT_DIR))
import logging
import argparse
import torchaudio
import cosyvoice_pb2
import cosyvoice_pb2_grpc
import grpc
import torch
import numpy as np
from cosyvoice.utils.file_utils import load_wav


def main():
    with grpc.insecure_channel("{}:{}".format(args.host, args.port)) as channel:
        stub = cosyvoice_pb2_grpc.CosyVoiceStub(channel)
        request = cosyvoice_pb2.Request()
        if args.mode == 'sft':
            logging.info('send sft request')
            sft_request = cosyvoice_pb2.sftRequest()
            sft_request.spk_id = args.spk_id
            sft_request.tts_text = args.tts_text
            request.sft_request.CopyFrom(sft_request)
        elif args.mode == 'zero_shot':
            logging.info('send zero_shot request')
            zero_shot_request = cosyvoice_pb2.zeroshotRequest()
            zero_shot_request.tts_text = args.tts_text
            zero_shot_request.prompt_text = args.prompt_text
            prompt_speech = load_wav(args.prompt_wav, 16000)
            zero_shot_request.prompt_audio = (prompt_speech.numpy() * (2**15)).astype(np.int16).tobytes()
            request.zero_shot_request.CopyFrom(zero_shot_request)
        elif args.mode == 'cross_lingual':
            logging.info('send cross_lingual request')
            cross_lingual_request = cosyvoice_pb2.crosslingualRequest()
            cross_lingual_request.tts_text = args.tts_text
            prompt_speech = load_wav(args.prompt_wav, 16000)
            cross_lingual_request.prompt_audio = (prompt_speech.numpy() * (2**15)).astype(np.int16).tobytes()
            request.cross_lingual_request.CopyFrom(cross_lingual_request)
        else:
            logging.info('send instruct request')
            instruct_request = cosyvoice_pb2.instructRequest()
            instruct_request.tts_text = args.tts_text
            instruct_request.spk_id = args.spk_id
            instruct_request.instruct_text = args.instruct_text
            request.instruct_request.CopyFrom(instruct_request)

        response = stub.Inference(request)
        logging.info('save response to {}'.format(args.tts_wav))
        tts_speech = torch.from_numpy(np.array(np.frombuffer(response.tts_audio, dtype=np.int16))).unsqueeze(dim=0)
        torchaudio.save(args.tts_wav, tts_speech, target_sr)
        logging.info('get response')


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--host',
                        type=str,
                        default='0.0.0.0')
    parser.add_argument('--port',
                        type=int,
                        default='50000')
    parser.add_argument('--mode',
                        default='sft',
                        choices=['sft', 'zero_shot', 'cross_lingual', 'instruct'],
                        help='request mode')
    parser.add_argument('--tts_text',
                        type=str,
                        default='你好，我是通义千问语音合成大模型，请问有什么可以帮您的吗？')
    parser.add_argument('--spk_id',
                        type=str,
                        default='中文女')
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
                        default='demo.wav')
    args = parser.parse_args()
    prompt_sr, target_sr = 16000, 22050
    main()
