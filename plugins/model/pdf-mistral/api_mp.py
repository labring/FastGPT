import time
import base64
import fitz
import re
import json
from contextlib import asynccontextmanager
from loguru import logger
from fastapi import HTTPException, FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from mistralai import Mistral
import os
import shutil
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI()
temp_dir = "./temp"

# Initialize Mistral client with API key from environment variable
mistral_api_key = os.environ.get("MISTRAL_API_KEY", "")
if not mistral_api_key:
    logger.warning("MISTRAL_API_KEY environment variable not set. PDF processing will fail.")
    
mistral_client = Mistral(api_key=mistral_api_key) if mistral_api_key else None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create temp directory if it doesn't exist
    global temp_dir
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)
    print("Application startup, creating temp directory...")
    yield
    if temp_dir and os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    print("Application shutdown, cleaning up...")

app.router.lifespan_context = lifespan

@app.post("/v1/parse/file")
async def read_file(
        file: UploadFile = File(...)):
    temp_file_path = None
    try:
        start_time = time.time()
        global temp_dir
        os.makedirs(temp_dir, exist_ok=True)
        temp_file_path = os.path.join(temp_dir, file.filename)
        with open(temp_file_path, "wb") as temp_file:
            file_content = await file.read()
            temp_file.write(file_content)
        
        # Get page count using PyMuPDF
        try:
            pdf_document = fitz.open(temp_file_path)
            total_pages = pdf_document.page_count
            pdf_document.close()
        except Exception as e:
            logger.error(f"Failed to open PDF file: {str(e)}")
            return {
                "pages": 0,
                "markdown": "",
                "error": f"Failed to process PDF file: {str(e)}"
            }
        
        if mistral_client is None:
            return {
                "pages": 0,
                "markdown": "",
                "error": "MISTRAL_API_KEY environment variable not set."
            }
        
        # Step 1: Upload the file to Mistral's servers
        logger.info(f"Uploading file {file.filename} to Mistral servers")
        with open(temp_file_path, "rb") as f:
            try:
                uploaded_file = mistral_client.files.upload(
                    file={
                        "file_name": file.filename,
                        "content": f,
                    },
                    purpose="ocr"
                )
            except Exception as e:
                error_msg = str(e)
                # Try to parse Mistral API error format
                try:
                    error_data = json.loads(error_msg)
                    if error_data.get("object") == "error":
                        error_msg = error_data.get("message", error_msg)
                except:
                    pass
                
                return {
                    "pages": 0,
                    "markdown": "",
                    "error": f"Mistral API upload error: {error_msg}"
                }
        
        # Step 2: Get a signed URL for the uploaded file
        logger.info(f"Getting signed URL for file ID: {uploaded_file.id}")
        try:
            signed_url = mistral_client.files.get_signed_url(file_id=uploaded_file.id)
        except Exception as e:
            error_msg = str(e)
            # Try to parse Mistral API error format
            try:
                error_data = json.loads(error_msg)
                if error_data.get("object") == "error":
                    error_msg = error_data.get("message", error_msg)
            except:
                pass
            
            return {
                "pages": 0,
                "markdown": "",
                "error": f"Mistral API signed URL error: {error_msg}"
            }
        
        # Step 3: Process the file using the signed URL
        logger.info("Processing file with OCR API")
        try:
            ocr_response = mistral_client.ocr.process(
                model="mistral-ocr-latest",
                document={
                    "type": "document_url",
                    "document_url": signed_url.url,
                },
                include_image_base64=True
            )
        except Exception as e:
            error_msg = str(e)
            # Try to parse Mistral API error format
            try:
                error_data = json.loads(error_msg)
                if error_data.get("object") == "error":
                    error_msg = error_data.get("message", error_msg)
            except:
                pass
            
            return {
                "pages": 0,
                "markdown": "",
                "error": f"Mistral OCR processing error: {error_msg}"
            }
        
        # Combine all pages' markdown content
        markdown_content = "\n".join(page.markdown for page in ocr_response.pages)
        
        # Create a dictionary to map image filenames to their base64 data
        image_map = {}
        for page in ocr_response.pages:
            for img in page.images:
                # Extract the image filename from the image id
                img_id = img.id
                img_base64 = img.image_base64
                
                # Print a sample of the first image base64 data for debugging
                if len(image_map) == 0 and img_base64:
                    print("Sample image base64 prefix:", img_base64[:50] if len(img_base64) > 50 else img_base64)
                    print("Does base64 already include prefix?", img_base64.startswith("data:image/"))
                
                # Ensure the base64 data is in the correct format for the upstream system
                # If it doesn't already have the prefix, add it
                if not img_base64.startswith("data:image/"):
                    # Assume it's a PNG if we can't determine the type
                    img_base64 = f"data:image/png;base64,{img_base64}"
                
                # Add both potential formats to the map
                image_map[f"{img_id}.jpeg"] = img_base64
                image_map[f"{img_id}.png"] = img_base64
                image_map[img_id] = img_base64
        
        # Use regex to find all image references in the markdown content
        # This will match patterns like ![any-text](any-filename.extension)
        image_pattern = r'!\[(.*?)\]\((.*?)\)'
        
        def replace_image_with_base64(match):
            alt_text = match.group(1)
            img_filename = match.group(2)
            
            # Extract just the filename without path
            img_filename_only = os.path.basename(img_filename)
            
            # Check if we have base64 data for this image
            if img_filename_only in image_map:
                return f"![]({image_map[img_filename_only]})"
            else:
                # If we don't have base64 data, keep the original reference
                logger.warning(f"No base64 data found for image: {img_filename_only}")
                return match.group(0)
        
        # Replace all image references with base64 data
        markdown_content = re.sub(image_pattern, replace_image_with_base64, markdown_content)
        
        # Clean up the uploaded file from Mistral's servers
        try:
            logger.info(f"Deleting uploaded file from Mistral servers: {uploaded_file.id}")
            mistral_client.files.delete(file_id=uploaded_file.id)
        except Exception as e:
            logger.warning(f"Failed to delete uploaded file: {e}")
        
        end_time = time.time()
        duration = end_time - start_time
        print(file.filename + " Total time:", duration)
        
        # Return with format matching client expectations
        return {
            "pages": total_pages,
            "markdown": markdown_content,
            "duration": duration  # Keep this for logging purposes
        }

    except Exception as e:
        logger.exception(e)
        return {
            "pages": 0,
            "markdown": "",
            "error": f"Internal server error: {str(e)}"
        }

    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7231)
