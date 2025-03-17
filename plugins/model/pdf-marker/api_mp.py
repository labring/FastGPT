import asyncio
import base64
import fitz
import torch.multiprocessing as mp
import shutil
import time
from contextlib import asynccontextmanager
from loguru import logger
from fastapi import HTTPException, FastAPI, UploadFile, File
import multiprocessing
from marker.output import save_markdown
from marker.convert import convert_single_pdf
from marker.models import load_all_models
import torch
from concurrent.futures import ProcessPoolExecutor
import os
app = FastAPI()
model_lst = None
model_refs = None
temp_dir = "./temp"
os.environ['PROCESSES_PER_GPU'] = str(2)

def worker_init(counter, lock):
    global model_lst
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
    model_lst = load_all_models(device=device, dtype=torch.float32)
    print(f"Worker {worker_id}: Models loaded successfully on {device}!")
    for model in model_lst:
        if model is None:
            continue
        model.share_memory()

def process_file_with_multiprocessing(temp_file_path):
    global model_lst
    full_text, images, out_meta = convert_single_pdf(temp_file_path, model_lst, batch_multiplier=1)
    fname = os.path.basename(temp_file_path)
    subfolder_path = save_markdown(r'./result', fname, full_text, images, out_meta)
    md_content_with_base64_images = embed_images_as_base64(full_text, subfolder_path)
    return md_content_with_base64_images, out_meta

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        mp.set_start_method('spawn')
    except RuntimeError:
        raise RuntimeError("Set start method to spawn twice. This may be a temporary issue with the script. Please try running it again.")
    manager = multiprocessing.Manager()
    worker_counter = manager.Value('i', 0)
    worker_lock = manager.Lock()
    global my_pool
    gpu_count = torch.cuda.device_count()
    my_pool = ProcessPoolExecutor(max_workers=gpu_count*int(os.environ.get('PROCESSES_PER_GPU', 1)), initializer=worker_init, initargs=(worker_counter, worker_lock))

    yield
    global temp_dir
    if temp_dir and os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    del model_lst
    del model_refs
    print("Application shutdown, cleaning up...")

app.router.lifespan_context = lifespan

@app.post("/v1/parse/file")
async def read_file(
        file: UploadFile = File(...)):
    try:
        start_time = time.time()
        global temp_dir
        os.makedirs(temp_dir, exist_ok=True)
        temp_file_path = os.path.join(temp_dir, file.filename)
        with open(temp_file_path, "wb") as temp_file:
            temp_file.write(await file.read())
        pdf_document = fitz.open(temp_file_path)
        total_pages = pdf_document.page_count
        pdf_document.close()
        global my_pool
        loop = asyncio.get_event_loop()
        md_content_with_base64_images, out_meta = await loop.run_in_executor(my_pool, process_file_with_multiprocessing, temp_file_path)

        end_time = time.time()
        duration = end_time - start_time
        print(file.filename+"Total time:", duration)
        return {
                "success": True,
                "message": "",
                "data": {
                    "markdown": md_content_with_base64_images,
                    "page": total_pages,
                    "duration": duration
                }
            }

    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail=f"错误信息: {str(e)}")

    finally:

        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
def img_to_base64(img_path):
    with open(img_path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode('utf-8')
def embed_images_as_base64(md_content, image_dir):
    lines = md_content.split('\n')
    new_lines = []
    for line in lines:
        if line.startswith("![") and "](" in line and ")" in line:
            start_idx = line.index("](") + 2
            end_idx = line.index(")", start_idx)
            img_rel_path = line[start_idx:end_idx]

            img_name = os.path.basename(img_rel_path)
            img_path = os.path.join(image_dir, img_name)

            if os.path.exists(img_path):
                img_base64 = img_to_base64(img_path)
                new_line = f'{line[:start_idx]}data:image/png;base64,{img_base64}{line[end_idx:]}'
                new_lines.append(new_line)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
    return '\n'.join(new_lines)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7231)

