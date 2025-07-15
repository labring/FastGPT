import json
import os
from base64 import b64encode
from glob import glob
from io import StringIO
from typing import Tuple, Union
import re

import uvicorn
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from loguru import logger
from tempfile import TemporaryDirectory
from pathlib import Path
import fitz  # PyMuPDF
import asyncio
from concurrent.futures import ProcessPoolExecutor
import torch
import multiprocessing as mp
from contextlib import asynccontextmanager
import time

import magic_pdf.model as model_config
from magic_pdf.config.enums import SupportedPdfParseMethod
from magic_pdf.data.data_reader_writer import DataWriter, FileBasedDataWriter
from magic_pdf.data.dataset import PymuDocDataset
from magic_pdf.model.doc_analyze_by_custom_model import doc_analyze
from magic_pdf.operators.models import InferenceResult
from magic_pdf.operators.pipes import PipeResult

model_config.__use_inside_model__ = True

app = FastAPI()

process_variables = {}
my_pool = None

class MemoryDataWriter(DataWriter):
    def __init__(self):
        self.buffer = StringIO()

    def write(self, path: str, data: bytes) -> None:
        if isinstance(data, str):
            self.buffer.write(data)
        else:
            self.buffer.write(data.decode("utf-8"))

    def write_string(self, path: str, data: str) -> None:
        self.buffer.write(data)

    def get_value(self) -> str:
        return self.buffer.getvalue()  # 修复：使用 getvalue() 而不是 get_value()

    def close(self):
        self.buffer.close()

def enhance_table_processing(text: str) -> str:
    """增强表格处理功能"""
    # 1. 修复断行的表格
    processed_text = repair_broken_tables(text)
    
    # 2. 合并相邻的表格片段
    processed_text = merge_adjacent_table_fragments(processed_text)
    
    # 3. 标准化表格格式
    processed_text = normalize_table_format(processed_text)
    
    return processed_text

def repair_broken_tables(text: str) -> str:
    """修复断行的表格"""
    # 将被意外断行的表格行重新连接
    return re.sub(r'\|\s*\n\s*([^|\n]+)\s*\n\s*\|', r'| \1 |', text)

def is_likely_table_data(line: str, previous_line: str) -> bool:
    """判断是否可能是表格数据"""
    if not line or not previous_line:
        return False
    
    # 计算前一行的列数
    prev_cols = len(previous_line.split('|')) - 2
    if prev_cols <= 0:
        return False
    
    # 检查当前行是否可能是表格数据（通过分隔符推测）
    possible_delimiters = [',', '\t', '  ', ' - ', ' | ']
    for delimiter in possible_delimiters:
        parts = line.split(delimiter)
        if len(parts) == prev_cols and all(part.strip() for part in parts):
            return True
    
    return False

def convert_to_table_row(line: str, column_count: int) -> str:
    """将普通文本转换为表格行"""
    possible_delimiters = ['\t', '  ', ',', ' - ', '|']
    
    for delimiter in possible_delimiters:
        parts = [part.strip() for part in line.split(delimiter)]
        if len(parts) <= column_count and len(parts) > 1 and all(parts):
            while len(parts) < column_count:
                parts.append('')
            return f"| {' | '.join(parts[:column_count])} |"
    
    return None

def reconstruct_table(table_lines: list) -> str:
    """重构表格"""
    clean_lines = [line.strip() for line in table_lines if line.strip()]
    if not clean_lines:
        return ''

    # 找到第一个有效的表格行来确定列数
    column_count = 0
    header_line = ''
    
    for line in clean_lines:
        if '|' in line:
            cols = len(line.split('|')) - 2
            if cols > column_count:
                column_count = cols
                header_line = line

    if column_count == 0:
        return '\n'.join(table_lines)

    # 重构表格
    reconstructed_lines = []
    has_header = False

    for line in clean_lines:
        if '|' in line:
            # 标准表格行
            cells = line.split('|')[1:-1]
            while len(cells) < column_count:
                cells.append('')
            reconstructed_lines.append(f"| {' | '.join(cells[:column_count])} |")
            
            # 添加分隔行（如果这是第一行）
            if not has_header:
                reconstructed_lines.append(f"| {' | '.join(['---'] * column_count)} |")
                has_header = True
        elif line and not line.startswith('#'):
            # 可能的数据行，尝试转换为表格格式
            converted_row = convert_to_table_row(line, column_count)
            if converted_row:
                reconstructed_lines.append(converted_row)
                if not has_header:
                    # 插入分隔行
                    reconstructed_lines.insert(-1, f"| {' | '.join(['---'] * column_count)} |")
                    has_header = True

    return '\n'.join(reconstructed_lines)

def merge_adjacent_table_fragments(text: str) -> str:
    """合并相邻的表格片段"""
    lines = text.split('\n')
    processed_lines = []
    i = 0

    while i < len(lines):
        line = lines[i].strip()
        
        # 检测可能的表格开始
        if '|' in line and len(line.split('|')) >= 3:
            table_lines = [lines[i]]
            j = i + 1
            
            # 收集连续的表格相关行
            while j < len(lines):
                next_line = lines[j].strip()
                
                # 如果是表格行或者是可能的数据行
                if ('|' in next_line or 
                    (next_line and not next_line.startswith('#') and table_lines and 
                     is_likely_table_data(next_line, table_lines[-1]))):
                    table_lines.append(lines[j])
                    j += 1
                elif next_line == '':
                    # 空行，检查下一行是否还是表格
                    if j + 1 < len(lines) and '|' in lines[j + 1].strip():
                        table_lines.append(lines[j])  # 保留空行
                        j += 1
                    else:
                        break
                else:
                    break

            # 处理收集到的表格行
            if len(table_lines) >= 2:
                processed_table = reconstruct_table(table_lines)
                processed_lines.append(processed_table)
            else:
                processed_lines.append(lines[i])
            
            i = j
        else:
            processed_lines.append(lines[i])
            i += 1

    return '\n'.join(processed_lines)

def normalize_table_format(text: str) -> str:
    """标准化表格格式"""
    table_regex = r'(\|[^\n]*\|(?:\n\|[^\n]*\|)*)'
    
    def normalize_table_match(match):
        table_text = match.group(1)
        lines = [line for line in table_text.split('\n') if line.strip()]
        if len(lines) < 2:
            return table_text

        # 确保有分隔行
        has_separator_line = any(
            re.match(r'^\|\s*[-:]+\s*(\|\s*[-:]+\s*)*\|$', line.strip())
            for line in lines
        )

        if not has_separator_line and len(lines) >= 1:
            first_line = lines[0]
            column_count = len(first_line.split('|')) - 2
            if column_count > 0:
                separator = f"| {' | '.join(['---'] * column_count)} |"
                lines.insert(1, separator)

        return '\n'.join(lines)
    
    return re.sub(table_regex, normalize_table_match, text)

def worker_init(counter, lock):
    num_gpus = torch.cuda.device_count()
    processes_per_gpu = int(os.environ.get('PROCESSES_PER_GPU', 1))
    with lock:
        worker_id = counter.value
        counter.value += 1
    if num_gpus == 0:
        device = 'cpu'
    else:
        device_id = worker_id // processes_per_gpu
        if device_id >= num_gpus:
            raise ValueError(f"Worker ID {worker_id} exceeds available GPUs ({num_gpus}).")
        device = f'cuda:{device_id}'
    config = {
        "parse_method": "auto",
        "ADDITIONAL_KEY": "VALUE"
    }
    converter = init_converter(config, device_id)
    pid = os.getpid()
    process_variables[pid] = converter
    print(f"Worker {worker_id}: Models loaded successfully on {device}!")

def init_converter(config, device_id):
    os.environ["CUDA_VISIBLE_DEVICES"] = str(device_id)
    return config

def img_to_base64(img_path: str) -> str:
    with open(img_path, "rb") as img_file:
        return b64encode(img_file.read()).decode('utf-8')

def embed_images_as_base64(md_content: str, image_dir: str) -> str:
    lines = md_content.split('\n')
    new_lines = []
    for line in lines:
        if line.startswith("![") and "](" in line and ")" in line:
            start_idx = line.index("](") + 2
            end_idx = line.index(")", start_idx)
            img_rel_path = line[start_idx:end_idx]
            img_name = os.path.basename(img_rel_path)
            img_path = os.path.join(image_dir, img_name)
            logger.info(f"Checking image: {img_path}")
            if os.path.exists(img_path):
                img_base64 = img_to_base64(img_path)
                new_line = f"![](data:image/png;base64,{img_base64})"
                new_lines.append(new_line)
            else:
                logger.warning(f"Image not found: {img_path}")
                new_lines.append(line)
        else:
            new_lines.append(line)
    return '\n'.join(new_lines)

def process_pdf(pdf_path, output_dir):
    try:
        pid = os.getpid()
        config = process_variables.get(pid, "No variable")
        parse_method = config["parse_method"]
        
        with open(str(pdf_path), "rb") as f:
            pdf_bytes = f.read()
        
        output_path = Path(output_dir) / f"{Path(pdf_path).stem}_output"
        os.makedirs(str(output_path), exist_ok=True)
        image_dir = os.path.join(str(output_path), "images")
        os.makedirs(image_dir, exist_ok=True)
        image_writer = FileBasedDataWriter(str(output_path))
        
        # 处理 PDF
        infer_result, pipe_result = process_pdf_content(pdf_bytes, parse_method, image_writer)
        
        md_content_writer = MemoryDataWriter()
        pipe_result.dump_md(md_content_writer, "", "images")
        md_content = md_content_writer.get_value()
        md_content_writer.close()
        
        # 获取保存的图片路径
        image_paths = glob(os.path.join(image_dir, "*.jpg"))
        logger.info(f"Saved images by magic_pdf: {image_paths}")
        
        # 如果 magic_pdf 未保存足够图片，使用 fitz 提取
        if not image_paths or len(image_paths) < 3:  # 假设至少 3 张图片
            logger.warning("Insufficient images saved by magic_pdf, falling back to fitz extraction")
            image_map = {}
            original_names = []
            # 收集 Markdown 中的所有图片文件名
            for line in md_content.split('\n'):
                if line.startswith("![") and "](" in line and ")" in line:
                    start_idx = line.index("](") + 2
                    end_idx = line.index(")", start_idx)
                    img_rel_path = line[start_idx:end_idx]
                    original_names.append(os.path.basename(img_rel_path))
            
            # 提取图片并映射
            with fitz.open(pdf_path) as doc:
                img_counter = 0
                for page_num, page in enumerate(doc):
                    for img_index, img in enumerate(page.get_images(full=True)):
                        xref = img[0]
                        base = doc.extract_image(xref)
                        if img_counter < len(original_names):
                            img_name = original_names[img_counter]  # 使用 Markdown 中的原始文件名
                        else:
                            img_name = f"page_{page_num}_img_{img_index}.jpg"
                        img_path = os.path.join(image_dir, img_name)
                        with open(img_path, "wb") as f:
                            f.write(base["image"])
                        if img_counter < len(original_names):
                            image_map[original_names[img_counter]] = img_name
                        img_counter += 1
            
            image_paths = glob(os.path.join(image_dir, "*.jpg"))
            logger.info(f"Images extracted by fitz: {image_paths}")
            
            # 更新 Markdown（仅在必要时替换）
            for original_name, new_name in image_map.items():
                if original_name != new_name:
                    md_content = md_content.replace(f"images/{original_name}", f"images/{new_name}")
        
        return {
            "status": "success",
            "text": md_content,
            "output_path": str(output_path),
            "images": image_paths
        }
    except Exception as e:
        logger.error(f"Error processing PDF: {str(e)}")
        return {
            "status": "error",
            "message": str(e),
            "file": str(pdf_path)
        }

def process_pdf_content(pdf_bytes, parse_method, image_writer):
    ds = PymuDocDataset(pdf_bytes)
    infer_result: InferenceResult = None
    pipe_result: PipeResult = None

    if parse_method == "ocr":
        infer_result = ds.apply(doc_analyze, ocr=True)
        pipe_result = infer_result.pipe_ocr_mode(image_writer)
    elif parse_method == "txt":
        infer_result = ds.apply(doc_analyze, ocr=False)
        pipe_result = infer_result.pipe_txt_mode(image_writer)
    else:  # auto
        if ds.classify() == SupportedPdfParseMethod.OCR:
            infer_result = ds.apply(doc_analyze, ocr=True)
            pipe_result = infer_result.pipe_ocr_mode(image_writer)
        else:
            infer_result = ds.apply(doc_analyze, ocr=False)
            pipe_result = infer_result.pipe_txt_mode(image_writer)

    return infer_result, pipe_result

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        mp.set_start_method('spawn')
    except RuntimeError:
        raise RuntimeError("Set start method to spawn twice. This may be a temporary issue with the script. Please try running it again.")
    global my_pool
    manager = mp.Manager()
    worker_counter = manager.Value('i', 0)
    worker_lock = manager.Lock()
    gpu_count = torch.cuda.device_count()
    my_pool = ProcessPoolExecutor(max_workers=gpu_count * int(os.environ.get('PROCESSES_PER_GPU', 1)), 
                                  initializer=worker_init, initargs=(worker_counter, worker_lock))
    yield
    if my_pool:
        my_pool.shutdown(wait=True)
    print("Application shutdown, cleaning up...")

app.router.lifespan_context = lifespan

@app.post("/v2/parse/file")
async def process_pdfs(file: UploadFile = File(...)):
    s_time = time.time()
    with TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir) / file.filename
        with open(str(temp_path), "wb") as buffer:
            buffer.write(await file.read())
        
        # 验证 PDF 文件
        try:
            with fitz.open(str(temp_path)) as pdf_document:
                total_pages = pdf_document.page_count
        except fitz.fitz.FileDataError:
            return JSONResponse(content={"success": False, "message": "", "error": "Invalid PDF file"}, status_code=400)
        except Exception as e:
            logger.error(f"Error opening PDF: {str(e)}")
            return JSONResponse(content={"success": False, "message": "", "error": f"Internal server error: {str(e)}"}, status_code=500)
        
        try:
            loop = asyncio.get_running_loop()
            results = await loop.run_in_executor(
                my_pool,
                process_pdf,
                str(temp_path),
                str(temp_dir)
            )
            
            if results.get("status") == "error":
                return JSONResponse(content={
                    "success": False,
                    "message": "",
                    "error": results.get("message")
                }, status_code=500)
            
                    # 嵌入 Base64
        image_dir = os.path.join(results.get("output_path"), "images")
        md_content_with_base64 = embed_images_as_base64(results.get("text"), image_dir)
        
        # 新增：表格后处理优化
        enhanced_markdown = enhance_table_processing(md_content_with_base64)
        
        return {
            "success": True,
            "message": "",
            "markdown": enhanced_markdown,
            "pages": total_pages
        }
        except Exception as e:
            logger.error(f"Error in process_pdfs: {str(e)}")
            return JSONResponse(content={
                "success": False,
                "message": "",
                "error": f"Internal server error: {str(e)}"
            }, status_code=500)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7231)
