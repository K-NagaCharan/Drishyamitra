import React, { useState, useEffect } from 'react';
import useFaceCrop from '../../hooks/useFaceCrop';
import * as faceApi from '../../services/faceApi';

/**
 * UnknownFaceCard
 * Renders a single undetected face, displaying a cropped preview of the face bounds.
 * Asynchronously queries for visual label suggestions on mount, rendering a
 * confidence visual progress bar and quick Confirm/Change options.
 */
const UnknownFaceCard = ({ face, onLabel, onViewContext }) => {
  const { faceId, photoUrl, bbox } = face;
  const [naturalDimensions, setNaturalDimensions] = useState(null);
  const [personName, setPersonName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Suggestion State
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(true);
  const [showInputOverride, setShowInputOverride] = useState(false);

  // Fetch AI suggestion on mount
  useEffect(() => {
    let active = true;
    const fetchSuggestion = async () => {
      try {
        const data = await faceApi.getFaceSuggestion(faceId);
        if (active && data.suggested) {
          setSuggestion(data);
        }
      } catch (err) {
        console.error('Failed to load suggestion for face:', faceId, err);
      } finally {
        if (active) {
          setLoadingSuggestion(false);
        }
      }
    };
    fetchSuggestion();
    return () => {
      active = false;
    };
  }, [faceId]);

  // Capture natural image size on buffer render to dynamically scale crop translations
  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    setNaturalDimensions({ width: naturalWidth, height: naturalHeight });
  };

  // Delegate cropping style calculations to useFaceCrop hook
  const { containerStyle, imageStyle } = useFaceCrop(bbox, naturalDimensions);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = personName.trim();
    if (!trimmedName || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onLabel(faceId, trimmedName);
    } catch (err) {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSuggestion = async () => {
    if (!suggestion || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onLabel(faceId, suggestion.personName, true);
    } catch (err) {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-[#e8e4dc] rounded-xl overflow-hidden flex flex-col p-4 space-y-4 shadow-sm hover:shadow-md transition duration-200 select-none">
      
      {/* Face Crop Preview Viewport */}
      <div className="relative w-full aspect-square bg-[#f2f0eb] rounded-lg overflow-hidden flex items-center justify-center border border-[#e8e4dc]">
        
        {/* Hidden buffer loader to capture natural size */}
        <img
          src={photoUrl}
          alt="Context buffer"
          onLoad={handleImageLoad}
          className="hidden"
        />

        {naturalDimensions ? (
          <div style={containerStyle}>
            <img
              src={photoUrl}
              alt="Cropped Face Preview"
              style={imageStyle}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2 p-4 text-[#9c9890] text-xs font-mono select-none">
            <div className="w-6 h-6 border-2 border-[#c8501a] border-t-transparent rounded-full animate-spin" />
            <span>Loading Crop...</span>
          </div>
        )}
      </div>

      {/* Suggestion / Manual Entry Area */}
      {loadingSuggestion ? (
        // Loading suggestion skeleton (maintains card height layout)
        <div className="space-y-3 animate-pulse">
          <div className="h-16 bg-[#f2f0eb] rounded-lg w-full" />
          <div className="flex space-x-2">
            <div className="h-8 bg-[#f2f0eb] rounded-lg w-16" />
            <div className="h-8 bg-[#f2f0eb] rounded-lg flex-grow" />
          </div>
        </div>
      ) : suggestion && !showInputOverride ? (
        // Suggestion UI with Confidence Bar
        <div className="flex flex-col space-y-3">
          <div className="bg-[#f2f0eb]/60 p-3 rounded-lg border border-[#e8e4dc]">
            <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider text-[#6b6760] font-semibold mb-1.5 select-none">
              <span>AI Suggestion</span>
              <span>{Math.round(suggestion.score * 100)}%</span>
            </div>
            
            <div className="text-sm font-sans font-bold text-[#0f0e0c] mb-2 leading-tight">
              {suggestion.personName}
            </div>

            {/* Progress Bar Confidence Meter */}
            <div className="w-full bg-[#e8e4dc] h-1 rounded-full overflow-hidden">
              <div
                className="bg-[#c8501a] h-full rounded-full transition-all duration-700"
                style={{ width: `${suggestion.score * 100}%` }}
              />
            </div>
          </div>

          <div className="flex space-x-2 w-full">
            <button
              type="button"
              onClick={() => setShowInputOverride(true)}
              disabled={isSubmitting}
              className="px-3.5 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition-all duration-150 disabled:bg-[#e8e4dc] disabled:text-[#6b6760]/50 disabled:cursor-not-allowed cursor-pointer font-bold select-none active:scale-98 bg-white"
            >
              Change
            </button>
            
            <button
              type="button"
              onClick={handleConfirmSuggestion}
              disabled={isSubmitting}
              className="flex-grow px-4 py-2 bg-[#c8501a] hover:bg-[#c8501a]/90 text-white text-xs font-mono uppercase tracking-widest rounded-lg transition-all duration-150 disabled:bg-[#e8e4dc] disabled:text-[#6b6760]/50 disabled:cursor-not-allowed cursor-pointer font-bold select-none active:scale-98"
            >
              {isSubmitting ? 'Confirming...' : 'Confirm'}
            </button>
          </div>

          {/* Context view action below */}
          <button
            type="button"
            onClick={() => onViewContext(face)}
            disabled={isSubmitting}
            className="w-full py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition-all duration-150 disabled:bg-[#e8e4dc] disabled:text-[#6b6760]/50 disabled:cursor-not-allowed cursor-pointer font-bold select-none active:scale-98 bg-white"
          >
            View Context
          </button>
        </div>
      ) : (
        // Manual input fall-back form
        <form onSubmit={handleSubmit} className="flex flex-col space-y-2.5">
          <input
            type="text"
            placeholder="Name this person..."
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-[#e8e4dc] rounded-lg text-sm focus:outline-none focus:border-[#c8501a] font-sans bg-[#faf9f6]/30 disabled:bg-[#f2f0eb] disabled:text-[#6b6760]/60 transition"
          />

          <div className="flex space-x-2 w-full">
            <button
              type="button"
              onClick={() => onViewContext(face)}
              disabled={isSubmitting}
              className="px-3.5 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition-all duration-150 disabled:bg-[#e8e4dc] disabled:text-[#6b6760]/50 disabled:cursor-not-allowed cursor-pointer font-bold select-none active:scale-98 bg-white"
            >
              Context
            </button>
            
            <button
              type="submit"
              disabled={!personName.trim() || isSubmitting}
              className="flex-grow px-4 py-2 bg-[#c8501a] hover:bg-[#c8501a]/90 text-white text-xs font-mono uppercase tracking-widest rounded-lg transition-all duration-150 disabled:bg-[#e8e4dc] disabled:text-[#6b6760]/50 disabled:cursor-not-allowed cursor-pointer font-bold select-none active:scale-98"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default UnknownFaceCard;
