import React from 'react';
import { useNavigate } from 'react-router-dom';

const EmptyState = () => {
  const navigate = useNavigate();

  return (
    <div className="border border-[#e8e4dc] border-dashed rounded-2xl p-12 bg-white flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-6">
      {/* Illustration */}
      <div className="p-5 bg-[#faf9f6] rounded-full text-[#9c9890] border border-[#e8e4dc]">
        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-serif text-[#0f0e0c]">
          No photos found.
        </h3>
        <p className="text-sm text-[#6b6760] leading-relaxed max-w-sm">
          Upload your first photo to start building your gallery. Let Drishyamitra scan faces and compile embeddings.
        </p>
      </div>

      <button
        onClick={() => navigate('/upload')}
        className="px-6 py-3 bg-[#0f0e0c] hover:bg-[#c8501a] text-[#faf9f6] font-mono text-xs uppercase tracking-widest rounded-lg font-semibold transition active:scale-95 cursor-pointer"
      >
        Upload Photos
      </button>
    </div>
  );
};

export default EmptyState;
