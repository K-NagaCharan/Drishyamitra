import React, { useState } from 'react';

/**
 * ToolResultCard Component
 * Displays a single photo item with metadata, rounded corners, shadows, and smooth hover effects.
 * Includes a robust image loading error fallback to display a stylized placeholder for mock or invalid URLs.
 *
 * @param {object} props
 * @param {object} props.photo - Photo data object: { id, thumbnailUrl, person, date }
 */
const ToolResultCard = ({ photo }) => {
  const { thumbnailUrl, person, date, people } = photo;
  const [imageError, setImageError] = useState(false);

  // Consider mock URLs as immediate errors so we don't try to load them in the DOM
  const isInvalidUrl = !thumbnailUrl || thumbnailUrl.startsWith('mock://');
  const showErrorFallback = imageError || isInvalidUrl;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'No date';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        return dateStr;
      }
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#e8e4dc] bg-[#faf9f6] shadow-xs hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5 group flex flex-col w-full">
      {/* Aspect Ratio Container */}
      <div className="relative w-full aspect-square bg-[#f2f0eb] overflow-hidden flex-shrink-0">
        {showErrorFallback ? (
          /* Premium-looking stylized gradient placeholder */
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#f2f0eb] to-[#e8e4dc] p-4 text-center">
            <svg
              className="w-8 h-8 text-[#6b6760] mb-2 opacity-80"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-[10px] font-mono font-semibold text-[#6b6760] uppercase tracking-wider select-none">
              Photo
            </span>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={person ? `Photo of ${person}` : 'Photo'}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        )}
      </div>

      {/* Metadata Section */}
      <div className="p-3 flex-grow flex flex-col justify-between bg-white border-t border-[#e8e4dc]">
        <div 
          className="text-xs font-semibold text-[#0f0e0c] truncate font-sans" 
          title={people && people.length > 0 ? people.join(', ') : (person || 'Unknown')}
        >
          {people && people.length > 0 ? people.join(', ') : (person || 'Unknown')}
        </div>
        <div className="text-[10px] text-[#6b6760] font-mono mt-1 select-none">
          {formatDate(date)}
        </div>
      </div>
    </div>
  );
};

export default ToolResultCard;
