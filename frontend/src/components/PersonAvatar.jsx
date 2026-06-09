import React, { useState } from 'react';
import useFaceCrop from '../hooks/useFaceCrop';

/**
 * PersonAvatar
 * Renders a circular cropped avatar of a person's face inside the Gallery People section.
 */
const PersonAvatar = ({ person, onClick }) => {
  const [naturalDimensions, setNaturalDimensions] = useState(null);
  const { name, avatarUrl, bbox } = person;

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    setNaturalDimensions({ width: naturalWidth, height: naturalHeight });
  };

  const { containerStyle, imageStyle } = useFaceCrop(bbox, naturalDimensions);

  return (
    <div
      onClick={onClick}
      className="flex flex-col items-center space-y-2 cursor-pointer group select-none flex-shrink-0"
    >
      <div className="w-20 h-20 rounded-full border border-[#e8e4dc] overflow-hidden flex items-center justify-center bg-[#f2f0eb] shadow-sm relative transition duration-200 group-hover:scale-105 group-hover:border-[#c8501a] active:scale-95">
        <img
          src={avatarUrl}
          alt="Avatar Buffer"
          onLoad={handleImageLoad}
          className="hidden"
        />
        {naturalDimensions ? (
          <div style={containerStyle} className="rounded-full">
            <img
              src={avatarUrl}
              alt={name}
              style={imageStyle}
            />
          </div>
        ) : (
          <div className="w-5 h-5 border-2 border-[#c8501a] border-t-transparent rounded-full animate-spin" />
        )}
      </div>
      <span className="text-xs font-semibold text-[#6b6760] group-hover:text-[#c8501a] transition font-sans max-w-[90px] truncate text-center">
        {name}
      </span>
    </div>
  );
};

export default PersonAvatar;
