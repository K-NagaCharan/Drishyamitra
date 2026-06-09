import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * FaceContextModal
 * Full-screen lightbox modal displaying the source photo with a spotlight highlight overlay.
 * Uses React Portal to prevent layout conflicts and implements keyboard escape,
 * click-outside, focus trapping, and background scroll locking.
 */
const FaceContextModal = ({ photoUrl, bbox, onClose }) => {
  const [naturalDimensions, setNaturalDimensions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  const closeButtonRef = useRef(null);
  const backdropRef = useRef(null);

  // Manage body scroll locking, escape key listeners, and focus restoration
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    
    // Lock scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus close button on mount
    closeButtonRef.current?.focus();

    return () => {
      // Restore scroll and focus on teardown
      document.body.style.overflow = originalOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, []);

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    setNaturalDimensions({ width: naturalWidth, height: naturalHeight });
    setLoading(false);
  };

  const handleImageError = () => {
    setError(true);
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'Tab') {
      // Focus Trap: Only Close button is active inside the modal
      e.preventDefault();
      closeButtonRef.current?.focus();
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  // Spotlight math calculating percentage overlays relative to natural dimensions
  const getSpotlightStyles = () => {
    if (!naturalDimensions || !bbox) return { display: 'none' };

    const left = (bbox.x / naturalDimensions.width) * 100;
    const top = (bbox.y / naturalDimensions.height) * 100;
    const width = (bbox.w / naturalDimensions.width) * 100;
    const height = (bbox.h / naturalDimensions.height) * 100;

    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
      position: 'absolute',
      border: '3px solid #c8501a',
      boxShadow: '0 0 0 9999px rgba(15, 14, 12, 0.7)', // Spotlight shader mask
      pointerEvents: 'none',
      borderRadius: '4px',
      zIndex: 10,
    };
  };

  const getContainerStyle = () => {
    if (!naturalDimensions) return {};
    return {
      position: 'relative',
      maxWidth: '90vw',
      maxHeight: '70vh',
      aspectRatio: `${naturalDimensions.width} / ${naturalDimensions.height}`,
      overflow: 'hidden',
      borderRadius: '8px',
      border: '1px solid #3a3834',
    };
  };

  const modalContent = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 bg-[#0f0e0c]/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 z-50 animate-fade-in outline-none"
      tabIndex={-1}
    >
      <div className="flex flex-col items-center space-y-6 w-full max-w-4xl">
        
        {/* Main image context display */}
        <div className="relative flex items-center justify-center min-h-[200px] w-full">
          
          {/* Hidden image buffer to read dimensions first */}
          <img
            src={photoUrl}
            alt="Source context loading buffer"
            onLoad={handleImageLoad}
            onError={handleImageError}
            className="hidden"
          />

          {loading && (
            <div className="flex flex-col items-center justify-center space-y-3 p-12 text-[#9c9890] font-mono text-xs select-none">
              <div className="w-8 h-8 border-2 border-[#c8501a] border-t-transparent rounded-full animate-spin" />
              <span>Loading Context Photo...</span>
            </div>
          )}

          {error && (
            <div className="bg-[#faf9f6] border border-[#e8e4dc] p-8 rounded-xl max-w-md text-center space-y-3">
              <span className="text-2xl">⚠️</span>
              <p className="text-sm font-sans font-semibold text-[#0f0e0c]">
                Unable to load full context image.
              </p>
              <p className="text-xs text-[#6b6760] font-mono">
                Check database connectivity or image source URL.
              </p>
            </div>
          )}

          {!loading && !error && naturalDimensions && (
            <div style={getContainerStyle()} className="shadow-2xl">
              <img
                src={photoUrl}
                alt="Full Context view"
                className="w-full h-full object-contain block"
              />
              {/* Highlight Overlay Spotlight */}
              <div style={getSpotlightStyles()} />
            </div>
          )}
        </div>

        {/* Modal Controls */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="px-6 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition bg-white cursor-pointer active:scale-95 shadow-md outline-none focus:ring-2 focus:ring-[#c8501a]"
        >
          Close Context
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default FaceContextModal;
