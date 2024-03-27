import ImageTool from '@editorjs/image';

export const EDITOR_JS_TOOLS = {
  image: {
    class: ImageTool,
    config: {
      field: 'image',
      endpoints: {
        byFile: '/api/core/dataset/data/uploadImage', // Your backend file uploader endpoint
        byUrl: 'http://localhost:8008/fetchUrl' // Your endpoint that provides uploading by Url
      },
      uploader: {
        uploadByFile(file: string | Blob) {
          // 实现图片上传逻辑
          return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('image', file);

            fetch('/api/core/dataset/data/uploadImage', {
              method: 'POST',
              body: formData
            })
              .then((response) => response.json())
              .then((result) => {
                resolve({
                  success: 1,
                  file: { url: result.data.url }
                });
              })
              .catch((error) => {
                reject();
              });
          });
        }
      }
    }
  }
};
