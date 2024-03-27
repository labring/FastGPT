import React from 'react';
import { Input } from '@chakra-ui/react';

const ImageUpload = (onSuccess: any) => {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('image', file);

      fetch('/api/core/dataset/data/uploadImage', {
        method: 'POST',
        body: formData
      })
        .then((response) => response.json())
        .then((result) => {
          debugger;
          onSuccess({
            success: 1,
            file: { url: result.data.url }
          });
        })
        .catch((error) => {});
    }
  };

  return (
    <div>
      <Input type="file" onChange={handleFileChange} />
    </div>
  );
};

export default ImageUpload;
