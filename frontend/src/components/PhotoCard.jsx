import React from 'react';

const PhotoCard = ({
  photo,
  onDeleteClick,
  isDeleting,
  isSelectionMode,
  isSelected,
  onSelectToggle
}) => {
  // Format Date
  const formatDate = (dateString) => {
    try {
      const options = { year: 'numeric', month: 'short', day: 'numeric' };
      return new Date(dateString).toLocaleDateString(undefined, options);
    } catch (e) {
      return 'Unknown Date';
    }
  };

  return (
    <div
      onClick={isSelectionMode ? () => onSelectToggle(photo.id) : undefined}
      className={`relative group bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition duration-200 flex flex-col h-full ${
        isSelectionMode ? 'cursor-pointer' : ''
      } ${
        isSelectionMode && isSelected 
          ? 'border-[#c8501a] ring-2 ring-[#c8501a]/20' 
          : 'border-[#e8e4dc]'
      }`}
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-square w-full bg-[#f2f0eb] overflow-hidden">
        <img
          src={photo.url}
          alt={`Upload ${photo.id}`}
          loading="lazy"
          className="w-full h-full object-cover transition duration-300 group-hover:scale-102"
        />

        {/* Status Badge overlay */}
        <div className="absolute top-3 left-3 flex items-center space-x-1.5 z-10">
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
            photo.status === 'completed'
              ? 'bg-[#e8f5f1] text-[#0f6e56] border border-[#0f6e56]/20'
              : 'bg-[#faeeda] text-[#854f0b] border border-[#854f0b]/20'
          }`}>
            {photo.status || 'processing'}
          </span>
        </div>

        {/* Selection Checkbox Overlay */}
        {isSelectionMode && (
          <div className="absolute top-3 right-3 z-10">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition ${
              isSelected 
                ? 'bg-[#c8501a] border-[#c8501a] text-white shadow-sm' 
                : 'bg-black/20 border-white text-transparent'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        )}

        {/* Delete button overlay - visible on hover (only when not in selection mode) */}
        {!isSelectionMode && (
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition z-10">
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click
                onDeleteClick(photo);
              }}
              disabled={isDeleting}
              className="p-2 bg-white/95 hover:bg-red-50 text-[#6b6760] hover:text-red-600 rounded-lg shadow-sm border border-[#e8e4dc] transition hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              title="Delete Photo"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}

        {/* Loading Spinner overlay when card is undergoing active deletion */}
        {isDeleting && (
          <div className="absolute inset-0 bg-white/85 backdrop-blur-xs flex flex-col items-center justify-center space-y-2 z-20">
            <svg className="animate-spin h-8 w-8 text-[#c8501a]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#6b6760] font-bold">
              Removing File
            </span>
          </div>
        )}
      </div>

      {/* Details Box */}
      <div className="p-4 flex flex-col justify-between flex-grow space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-[#9c9890] font-semibold uppercase tracking-wider">
            <span>Dimensions</span>
            <span>Uploaded</span>
          </div>
          <div className="flex justify-between items-center text-xs text-[#0f0e0c] font-medium">
            <span className="font-mono">{photo.width || '?'} × {photo.height || '?'} px</span>
            <span>{formatDate(photo.uploadDate)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoCard;
