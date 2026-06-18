import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useFaceCrop from '../hooks/useFaceCrop';

const SidebarFaceItem = ({ face, photoUrl, isActive, onHover, onClick }) => {
  const [imgSize, setImgSize] = useState(null);
  const handleLoad = (e) => {
    setImgSize({ width: e.target.naturalWidth, height: e.target.naturalHeight });
  };
  const { containerStyle, imageStyle } = useFaceCrop(face.bbox, imgSize);

  return (
    <div
      onMouseEnter={() => onHover(face.faceId)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(face)}
      className={`flex items-center justify-between p-3 rounded-lg border transition duration-150 cursor-pointer ${
        isActive 
          ? 'bg-[#c8501a]/10 border-[#c8501a] ring-1 ring-[#c8501a]/20' 
          : 'bg-[#faf9f6]/40 hover:bg-[#faf9f6]/90 border-[#e8e4dc]'
      }`}
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-lg overflow-hidden border border-[#e8e4dc] flex-shrink-0 flex items-center justify-center bg-[#f2f0eb]">
          <img src={photoUrl} alt="source" onLoad={handleLoad} className="hidden" />
          {imgSize ? (
            <div style={containerStyle}>
              <img src={photoUrl} alt="crop" style={imageStyle} />
            </div>
          ) : (
            <div className="w-4 h-4 border border-[#c8501a] border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#9c9890]">Identity</div>
          <div className="text-sm font-sans font-semibold text-[#0f0e0c]">
            {face.person ? face.person.name : 'Unknown'}
          </div>
        </div>
      </div>
      
      {face.person && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick(face);
          }}
          className="text-xs font-mono uppercase tracking-widest text-[#c8501a] hover:text-[#c8501a]/80 font-bold px-2 py-1 bg-white hover:bg-gray-50 border border-[#e8e4dc] rounded-md transition"
        >
          View Page
        </button>
      )}
    </div>
  );
};

const PhotoDetailModal = ({ photoId, onClose, onPrev, onNext }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [naturalDimensions, setNaturalDimensions] = useState(null);
  const [activeFaceId, setActiveFaceId] = useState(null);

  // Zoom/Pan State
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const closeButtonRef = useRef(null);
  const backdropRef = useRef(null);

  // Fetch data
  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/photos/${photoId}`);
        if (active) {
          setData(response.data.data);
        }
      } catch (err) {
        toast.error("Failed to load photo details");
        onClose();
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchDetails();
    return () => {
      active = false;
    };
  }, [photoId, onClose]);

  // Reset zoom & pan on photo ID change
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setActiveFaceId(null);
    setNaturalDimensions(null);
  }, [photoId]);

  // Keyboard navigation & body scroll lock
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, onPrev, onNext]);

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    setNaturalDimensions({ width: naturalWidth, height: naturalHeight });
  };

  // Spotlight Bounding Box Styling
  const getSpotlightStyles = (bbox) => {
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
    };
  };

  // Drag to Pan Handlers
  const handleMouseDown = (e) => {
    if (scale === 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleFaceClick = (face) => {
    if (face.person) {
      onClose();
      navigate(`/gallery/person/${face.person.id}`);
    } else {
      toast.success("This face is unlabeled. Assign labels using the Face Recognition tab.");
    }
  };

  const handleDownload = () => {
    if (!data) return;
    const link = document.createElement('a');
    link.href = data.url;
    link.download = `drishyamitra-photo-${data.id}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  const modalContent = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-[#0f0e0c]/90 backdrop-blur-xs flex z-50 animate-fade-in outline-none select-none overflow-hidden"
    >
      {/* Lightbox Area */}
      <div className="flex-grow flex flex-col items-center justify-between p-6 relative">
        {/* Top bar with buttons */}
        <div className="w-full flex items-center justify-between z-20">
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="p-2 border border-white/20 hover:border-white text-white rounded-lg transition active:scale-95 bg-[#0f0e0c]/40 cursor-pointer"
              title="Close Modal (Esc)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {data && (
              <button
                onClick={handleDownload}
                className="px-4 py-2 border border-white/20 hover:border-white text-white rounded-lg transition active:scale-95 bg-[#0f0e0c]/40 flex items-center space-x-2 text-xs font-mono uppercase tracking-wider cursor-pointer"
                title="Download Photo"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download</span>
              </button>
            )}
          </div>

          {data && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleZoomOut}
                disabled={scale === 1}
                className="p-2 border border-white/20 hover:border-white disabled:opacity-40 disabled:border-white/10 text-white rounded-lg transition active:scale-95 bg-[#0f0e0c]/40 cursor-pointer"
                title="Zoom Out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
                </svg>
              </button>
              <span className="text-white font-mono text-xs px-2 select-none">{Math.round(scale * 100)}%</span>
              <button
                onClick={handleZoomIn}
                disabled={scale === 3}
                className="p-2 border border-white/20 hover:border-white disabled:opacity-40 disabled:border-white/10 text-white rounded-lg transition active:scale-95 bg-[#0f0e0c]/40 cursor-pointer"
                title="Zoom In"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Carousel Prev Trigger */}
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-6 top-1/2 -translate-y-1/2 p-3 border border-white/20 hover:border-white hover:bg-white/10 text-white rounded-full transition active:scale-95 bg-[#0f0e0c]/30 z-20 cursor-pointer"
            title="Previous Photo (←)"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Main image container */}
        <div className="flex-grow flex items-center justify-center w-full max-h-[78vh] relative overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center space-y-3 p-12 text-[#9c9890] font-mono text-xs select-none">
              <div className="w-8 h-8 border-2 border-[#c8501a] border-t-transparent rounded-full animate-spin" />
              <span>Loading details...</span>
            </div>
          ) : (
            <div
              style={{
                transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              }}
              className="relative max-w-full max-h-[70vh] flex items-center justify-center"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <img
                src={data.url}
                alt="Detailed View"
                onLoad={handleImageLoad}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl pointer-events-none"
              />

              {/* Spotlight box overlay highlights */}
              {naturalDimensions &&
                data.faces &&
                data.faces.map((face) => (
                  <div
                    key={face.faceId}
                    style={getSpotlightStyles(face.bbox)}
                    className={`absolute border-2 rounded transition-all duration-150 z-10 cursor-pointer ${
                      activeFaceId === face.faceId
                        ? 'border-[#c8501a] bg-[#c8501a]/15 shadow-[0_0_10px_#c8501a]'
                        : 'border-white/60 bg-transparent hover:border-[#c8501a] hover:bg-white/5'
                    }`}
                    onMouseEnter={() => setActiveFaceId(face.faceId)}
                    onMouseLeave={() => setActiveFaceId(null)}
                    onClick={() => handleFaceClick(face)}
                  />
                ))}
            </div>
          )}
        </div>

        {/* Carousel Next Trigger */}
        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-6 top-1/2 -translate-y-1/2 p-3 border border-white/20 hover:border-white hover:bg-white/10 text-white rounded-full transition active:scale-95 bg-[#0f0e0c]/30 z-20 cursor-pointer"
            title="Next Photo (→)"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Bottom Metadata bar */}
        {data && (
          <div className="text-white/60 font-mono text-[10px] uppercase tracking-widest text-center select-none pt-4">
            Dimensions: {data.width || '?'} × {data.height || '?'} px &bull; Faces detected: {data.faces?.length || 0}
          </div>
        )}
      </div>

      {/* Sidebar Panel */}
      <div className="w-80 h-full bg-[#f8f7f3] border-l border-[#e8e4dc] flex flex-col justify-start select-none shadow-2xl z-30 transform transition-transform duration-300">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-[#e8e4dc] bg-white">
          <h2 className="text-lg font-serif text-[#0f0e0c] font-semibold">Detected Faces</h2>
          <p className="text-xs text-[#6b6760] font-sans mt-1">
            People identified in this photograph. Hover or click to highlight.
          </p>
        </div>

        {/* Sidebar List */}
        <div className="flex-grow overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              {Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-16 bg-[#f2f0eb] rounded-lg w-full" />
              ))}
            </div>
          ) : data && data.faces && data.faces.length > 0 ? (
            data.faces.map((face) => (
              <SidebarFaceItem
                key={face.faceId}
                face={face}
                photoUrl={data.url}
                isActive={activeFaceId === face.faceId}
                onHover={setActiveFaceId}
                onClick={handleFaceClick}
              />
            ))
          ) : (
            <div className="text-center py-12 text-[#6b6760] font-sans text-sm">
              No faces detected in this photo.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default PhotoDetailModal;
