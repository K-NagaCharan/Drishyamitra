import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

const UploadContext = createContext(null);

export const UploadProvider = ({ children }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle | uploading | success | error
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Revoke all preview URLs when the context provider itself unmounts (full page reload/unload)
      previewUrls.forEach(urlObj => URL.revokeObjectURL(urlObj.url));
    };
  }, [previewUrls]);

  const handleFileSelect = (files) => {
    // Revoke previous URLs to release memory
    previewUrls.forEach(urlObj => URL.revokeObjectURL(urlObj.url));

    setSelectedFiles(files);
    setUploadStatus('idle');
    setUploadProgress(0);
    setCurrentUploadIndex(0);

    const urls = files.map(file => ({
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size
    }));
    setPreviewUrls(urls);
  };

  const handleClear = () => {
    setSelectedFiles([]);
    previewUrls.forEach(urlObj => URL.revokeObjectURL(urlObj.url));
    setPreviewUrls([]);
    setUploadStatus('idle');
    setUploadProgress(0);
    setCurrentUploadIndex(0);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploadStatus('uploading');
    setUploadProgress(0);

    let successCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (!isMounted.current) break;
      setCurrentUploadIndex(i);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('file', file);

      try {
        await api.post('/photos/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total && isMounted.current) {
              const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percentage);
            }
          },
        });
        successCount++;
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message || `Upload failed for ${file.name}`;
        toast.error(errMsg);
      }
    }

    if (isMounted.current) {
      if (successCount > 0) {
        setUploadStatus('success');
        toast.success(`Successfully uploaded ${successCount} photo(s)!`);
      } else {
        setUploadStatus('error');
      }
    }
  };

  return (
    <UploadContext.Provider
      value={{
        selectedFiles,
        previewUrls,
        uploadStatus,
        currentUploadIndex,
        uploadProgress,
        handleFileSelect,
        handleClear,
        handleUpload
      }}
    >
      {children}
    </UploadContext.Provider>
  );
};

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};
