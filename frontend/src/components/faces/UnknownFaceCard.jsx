import React, { useState } from 'react';

/**
 * UnknownFaceCard
 * Renders a single undetected face inside its parent photo context
 * with an overlay highlight, name input, and save button.
 */
const UnknownFaceCard = ({ face, onLabel }) => {
  const { faceId, photoUrl, bbox } = face;
  const [naturalDimensions, setNaturalDimensions] = useState(null);
  const [personName, setPersonName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Capture natural image size on render to map bbox pixel coordinates to percentages
  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    setNaturalDimensions({ width: naturalWidth, height: naturalHeight });
  };

  // Compute percentage styles dynamically
  const getBoxStyle = () => {
    if (!naturalDimensions || !bbox) return {};

    const left = (bbox.x / naturalDimensions.width) * 100;
    const top = (bbox.y / naturalDimensions.height) * 100;
    const width = (bbox.w / naturalDimensions.width) * 100;
    const height = (bbox.h / naturalDimensions.height) * 100;

    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = personName.trim();
    if (!trimmedName || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onLabel(faceId, trimmedName);
    } catch (err) {
      // Re-enable if error occurs (parent will handle state updates or notifications)
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-hidden flex flex-col p-4 space-y-4 shadow-sm hover:shadow-md transition duration-200 select-none">
      
      {/* Full Photo Container with relative positioning */}
      <div className="relative w-full aspect-square bg-[#f2f0eb] rounded-lg overflow-hidden flex items-center justify-center border border-[#e8e4dc]">
        
        {/* Relative content block that sizes to image bounds */}
        <div className="relative max-w-full max-h-full">
          <img
            src={photoUrl}
            alt="Source context"
            onLoad={handleImageLoad}
            className="max-w-full max-h-full object-contain block rounded-sm"
          />

          {/* Highlight Bounding Box Overlay */}
          {naturalDimensions && bbox && (
            <div
              style={getBoxStyle()}
              className="absolute border-3 border-[#c8501a] rounded-sm shadow-[0_0_12px_rgba(200,80,26,0.6)] animate-pulse"
            />
          )}
        </div>
      </div>

      {/* Label Entry Form */}
      <form onSubmit={handleSubmit} className="flex flex-col space-y-2.5">
        <input
          type="text"
          placeholder="Name this person..."
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          disabled={isSubmitting}
          className="w-full px-3 py-2 border border-[#e8e4dc] rounded-lg text-sm focus:outline-none focus:border-[#c8501a] font-sans bg-[#faf9f6]/30 disabled:bg-[#f2f0eb] disabled:text-[#6b6760]/60 transition"
        />

        <button
          type="submit"
          disabled={!personName.trim() || isSubmitting}
          className="w-full px-4 py-2 bg-[#c8501a] hover:bg-[#c8501a]/90 text-white text-xs font-mono uppercase tracking-widest rounded-lg transition-all duration-150 disabled:bg-[#e8e4dc] disabled:text-[#6b6760]/50 disabled:cursor-not-allowed cursor-pointer font-bold select-none active:scale-98"
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
};

export default UnknownFaceCard;
