import React from 'react';
import { useNavigate } from 'react-router-dom';
import UploadDropzone from '../components/UploadDropzone';
import { useUpload } from '../context/UploadContext';

const Upload = () => {
  const navigate = useNavigate();
  const {
    selectedFiles,
    previewUrls,
    uploadStatus,
    currentUploadIndex,
    uploadProgress,
    handleFileSelect,
    handleClear,
    handleUpload
  } = useUpload();

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);

  return (
    <div className="flex-grow max-w-4xl w-full mx-auto p-6 md:p-12 space-y-8 select-none flex flex-col justify-center">
      {/* Header */}
      <section className="space-y-1">
        <span className="font-mono text-xs uppercase tracking-widest text-[#c8501a] font-bold">
          Ingestion System
        </span>
        <h1 className="text-3xl font-serif text-[#0f0e0c]">
          Upload Photos
        </h1>
        <p className="text-sm text-[#6b6760] leading-relaxed">
          Add new images to your repository. APES will automatically validate format configurations.
        </p>
      </section>

      {/* Main Container */}
      <div className="bg-white border border-[#e8e4dc] rounded-2xl p-6 md:p-10 shadow-sm space-y-8">
        {uploadStatus === 'success' ? (
          /* Success Screen */
          <div className="flex flex-col items-center justify-center text-center space-y-6 py-8 animate-in fade-in duration-200">
            <div className="p-4 bg-[#e8f5f1] rounded-full text-[#0f6e56] border border-[#0f6e56]/20">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-serif text-[#0f0e0c]">Upload Completed</h3>
              <p className="text-xs font-mono uppercase tracking-widest text-[#6b6760] font-bold">
                Files successfully ingested into repository
              </p>
            </div>

            <div className="flex items-center space-x-4 pt-2">
              <button
                onClick={handleClear}
                className="px-5 py-2.5 border border-[#e8e4dc] hover:bg-[#f2f0eb] text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer bg-white text-[#3a3834]"
              >
                Upload more
              </button>
              <button
                onClick={() => navigate('/gallery')}
                className="px-5 py-2.5 bg-[#0f0e0c] hover:bg-[#c8501a] text-white text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer font-semibold"
              >
                Open Gallery
              </button>
            </div>
          </div>
        ) : (
          /* Dropzone or Preview Section */
          <div className="space-y-6">
            {!selectedFiles.length ? (
              <UploadDropzone onFileSelect={handleFileSelect} disabled={uploadStatus === 'uploading'} />
            ) : (
              /* Preview Panel */
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 border border-[#e8e4dc] rounded-xl p-4 bg-[#faf9f6]">
                  {/* Left Column: Image Previews Grid */}
                  <div className="md:col-span-8 border border-[#e8e4dc] rounded-lg p-4 bg-[#f2f0eb]/20 max-h-[350px] overflow-y-auto">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {previewUrls.map((urlObj, idx) => (
                        <div key={idx} className="relative aspect-square bg-[#f2f0eb] border border-[#e8e4dc] rounded-lg overflow-hidden group shadow-xs">
                          <img src={urlObj.url} alt={urlObj.name} className="w-full h-full object-cover" />
                          {uploadStatus === 'uploading' && idx === currentUploadIndex && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-mono text-[10px] font-bold">
                              {uploadProgress}%
                            </div>
                          )}
                          {uploadStatus === 'uploading' && idx < currentUploadIndex && (
                            <div className="absolute inset-0 bg-[#0f6e56]/70 flex items-center justify-center text-white">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-end p-2">
                            <span className="text-[9px] text-white truncate font-mono w-full block">{urlObj.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Column: Metadata Details & Operations */}
                  <div className="md:col-span-4 flex flex-col justify-between py-2 gap-4">
                    <div className="space-y-4">
                      <h4 className="font-mono text-[10px] uppercase tracking-widest text-[#9c9890] font-bold">
                        File Configuration
                      </h4>
                      <div className="space-y-2">
                        <div>
                          <span className="block text-[10px] text-[#6b6760] font-mono uppercase">Total Selected</span>
                          <span className="text-sm font-semibold text-[#0f0e0c] block">{selectedFiles.length} photo(s)</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-[#6b6760] font-mono uppercase">Total Size</span>
                          <span className="text-sm font-semibold text-[#0f0e0c] block font-mono">
                            {formatSize(totalSize)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Combined Progress Bar while uploading */}
                    {uploadStatus === 'uploading' && (
                      <div className="space-y-2 pt-4">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="text-[#6b6760] truncate max-w-[150px]">
                            {selectedFiles[currentUploadIndex]?.name}
                          </span>
                          <span className="text-[#c8501a] font-bold">
                            {currentUploadIndex + 1}/{selectedFiles.length}
                          </span>
                        </div>
                        <div className="w-full bg-[#e8e4dc] h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#c8501a] h-full rounded-full transition-all duration-300"
                            style={{ width: `${((currentUploadIndex + (uploadProgress / 100)) / selectedFiles.length) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {uploadStatus !== 'uploading' && (
                      <div className="flex items-center space-x-3 pt-4 border-t border-[#e8e4dc]/50">
                        <button
                          onClick={handleClear}
                          className="px-4 py-2 border border-[#e8e4dc] hover:bg-[#f2f0eb] text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer bg-white text-[#3a3834]"
                        >
                          Clear All
                        </button>
                        <button
                          onClick={handleUpload}
                          disabled={uploadStatus === 'uploading'}
                          className="px-5 py-2 bg-[#0f0e0c] hover:bg-[#c8501a] text-white text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer font-semibold flex items-center justify-center space-x-2"
                        >
                          <span>Ingest Photos</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Upload;
