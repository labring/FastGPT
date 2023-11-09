import os
import docx
from aip import AipOcr
from io import BytesIO
from PyPDF2 import PdfReader
from pdf2image import convert_from_path


# 百度OCR API设置
APP_ID = os.environ.get('APP_ID','xxx')
API_KEY = os.environ.get('API_KEY','xxx')
SECRET_KEY = os.environ.get('SECRET_KEY','xxx')



client = AipOcr(APP_ID, API_KEY, SECRET_KEY)

def ocr_image(image_data):
    result = client.basicGeneral(image_data)
    text = ''
    if 'words_result' in result:
        for item in result['words_result']:
            text += item['words'] + '\n'
    return text

def process_pdf(file_path):
    pdf = PdfReader(file_path)
    num_pages = len(pdf.pages)
    text = ''
    for page_num in range(num_pages):
        page = pdf.pages[page_num]
        text += f'--------------------------------------------\n'
        text += f'文档名：{os.path.basename(file_path)}\n'
        text += f'页数：{page_num + 1}\n'
        text += f'该页内容：\n'
        text += page.extract_text() + '\n'
        images = convert_from_path(file_path, first_page=page_num + 1, last_page=page_num + 1)
        for image in images:
            image_data = BytesIO()
            image.save(image_data, format='PNG')
            image_data = image_data.getvalue()
            ocr_text = ocr_image(image_data)
            if ocr_text:
                text += f'图片文字：\n'
                text += ocr_text + '\n'
        text += '--------------------------------------------\n'
    return text

def process_doc(file_path):
    doc = docx.Document(file_path)
    text = ''
    page_num = 1
    for paragraph in doc.paragraphs:
        if paragraph.text.strip() == '':  # 简单地将空行视为分页符
            page_num += 1
        else:
            text += f'--------------------------------------------\n'
            text += f'文档名：{os.path.basename(file_path)}\n'
            text += f'页数：{page_num}\n'
            text += f'该页内容：\n'
            text += paragraph.text + '\n'

        for shape in doc.inline_shapes:
            if shape.type == docx.enum.shape.WD_INLINE_SHAPE.PICTURE:
                blip_id = shape._inline.graphic.graphicData.pic.blipFill.blip.embed
                image_part = doc.part.related_parts[blip_id]
                image_data = image_part.blob
                ocr_text = ocr_image(image_data)
                if ocr_text:
                    text += f'图片文字：\n'
                    text += ocr_text + '\n'

    return text

def process_txt(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()
    return text

def office_to_txt(file_path):
    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext == '.docx':
        return process_doc(file_path)
    elif file_ext == '.pdf':
        return process_pdf(file_path)
    elif file_ext == '.doc':
        return process_doc(file_path)
    elif file_ext == '.txt':
        return process_txt(file_path)
    
    else:
        raise ValueError('Unsupported file format')
    
