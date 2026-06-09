import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as faceApi from '../services/faceApi';
import UnknownFaceCard from '../components/faces/UnknownFaceCard';
import FaceContextModal from '../components/faces/FaceContextModal';

/**
 * FaceLabelingPage
 * Core page orchestrating the retrieval and labeling of detected unknown faces.
 */
const FaceLabelingPage = () => {
  const [faces, setFaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [contextFace, setContextFace] = useState(null);
  const limit = 12; // 12 cards per page fits cleanly in responsive grids

  const fetchUnlabeledFaces = useCallback(async (targetPage) => {
    setLoading(true);
    setError(null);
    try {
      const data = await faceApi.getUnlabeledFaces(targetPage, limit);
      setFaces(data);
    } catch (err) {
      setError('Failed to retrieve unlabeled faces. Please verify database connection.');
      toast.error('Error loading faces');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Load faces on initial mount and page changes
  useEffect(() => {
    fetchUnlabeledFaces(page);
  }, [page, fetchUnlabeledFaces]);

  // Handle manual naming and optimistic state pruning
  const handleLabelFace = async (faceId, personName, isSuggested = false) => {
    try {
      const result = await faceApi.labelFace(faceId, personName);
      if (result && result.success) {
        // Optimistic UI update: Filter out the card immediately
        setFaces((prev) => prev.filter((f) => f.faceId !== faceId));

        // Toast notifications
        if (isSuggested) {
          toast.success(`Automatically identified as ${result.personName}.`);
        } else if (result.propagated > 0) {
          toast.success(`Labeled "${result.personName}"! Propagated to ${result.propagated} matching faces.`);
        } else {
          toast.success(`Labeled "${result.personName}" successfully.`);
        }
      } else {
        toast.error('Failed to label face.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to complete face labeling request.';
      toast.error(msg);
      throw err; // Re-throw to restore card pending states if needed
    }
  };

  const handleNextPage = () => {
    setPage((prev) => prev + 1);
  };

  const handlePrevPage = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const handleRefresh = () => {
    fetchUnlabeledFaces(page);
  };

  // Render Skeleton Loader Cards
  const renderSkeletons = () => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array(8)
          .fill(0)
          .map((_, i) => (
            <div
              key={i}
              className="bg-white border border-[#e8e4dc] rounded-xl p-4 space-y-4 animate-pulse select-none"
            >
              <div className="w-full aspect-square bg-[#f2f0eb] rounded-lg" />
              <div className="h-9 bg-[#f2f0eb] rounded-lg w-full" />
              <div className="h-8 bg-[#f2f0eb] rounded-lg w-full" />
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 flex-grow flex flex-col space-y-8 select-none">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 border-b border-[#e8e4dc] pb-6">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-[#0f0e0c] tracking-tight">
            Identify Detected Faces
          </h1>
          <p className="text-sm text-[#6b6760] font-sans mt-1">
            Assign names to unknown faces. The system learns identities and propagates labels automatically.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="self-start sm:self-center px-4 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition disabled:bg-gray-100 disabled:text-gray-400 bg-white shadow-xs cursor-pointer active:scale-95 flex items-center space-x-2"
        >
          <span>Sync Database</span>
        </button>
      </div>

      {/* Main Content Areas */}
      {loading ? (
        renderSkeletons()
      ) : error ? (
        // Error State UI
        <div className="flex-grow flex flex-col items-center justify-center py-16 text-center space-y-4 bg-white border border-[#e8e4dc] rounded-2xl shadow-xs">
          <div className="w-16 h-16 rounded-full bg-[#fdf0ea] flex items-center justify-center text-[#c8501a] text-2xl font-bold font-mono">
            !
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-serif font-semibold text-[#0f0e0c]">API Request Failure</h2>
            <p className="text-sm text-[#6b6760] max-w-md px-6">{error}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="px-6 py-2.5 bg-[#c8501a] hover:bg-[#c8501a]/95 text-white text-xs font-mono uppercase tracking-widest rounded-lg transition shadow-sm font-semibold cursor-pointer active:scale-95"
          >
            Retry Connection
          </button>
        </div>
      ) : faces.length === 0 ? (
        // Empty State UI
        <div className="flex-grow flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white border border-[#e8e4dc] rounded-2xl shadow-xs">
          <div className="w-16 h-16 rounded-full bg-[#fdf0ea] flex items-center justify-center text-[#c8501a] text-3xl">
            🎉
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-serif font-semibold text-[#0f0e0c]">All Faces Identified</h2>
            <p className="text-sm text-[#6b6760] max-w-md px-6">
              No unlabeled faces remaining. The learning loop has complete profiles for all recognized photos.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="px-5 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition bg-white cursor-pointer active:scale-95"
          >
            Check Again
          </button>
        </div>
      ) : (
        // Grid View
        <div className="flex-grow flex flex-col space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {faces.map((face) => (
              <UnknownFaceCard
                key={face.faceId}
                face={face}
                onLabel={handleLabelFace}
                onViewContext={(f) => setContextFace(f)}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-center space-x-6 pt-4 border-t border-[#e8e4dc]">
            <button
              onClick={handlePrevPage}
              disabled={page === 1}
              className="px-4 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] disabled:opacity-40 disabled:hover:border-[#e8e4dc] disabled:hover:text-[#6b6760] text-xs font-mono uppercase tracking-widest rounded-lg transition bg-white font-semibold cursor-pointer active:scale-95"
            >
              Previous
            </button>

            <span className="text-xs font-mono uppercase tracking-wider text-[#6b6760] font-semibold">
              Page {page}
            </span>

            <button
              onClick={handleNextPage}
              disabled={faces.length < limit}
              className="px-4 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] disabled:opacity-40 disabled:hover:border-[#e8e4dc] disabled:hover:text-[#6b6760] text-xs font-mono uppercase tracking-widest rounded-lg transition bg-white font-semibold cursor-pointer active:scale-95"
            >
              Next
            </button>
          </div>
        </div>
      )}
      
      {contextFace && (
        <FaceContextModal
          photoUrl={contextFace.photoUrl}
          bbox={contextFace.bbox}
          onClose={() => setContextFace(null)}
        />
      )}
    </div>
  );
};

export default FaceLabelingPage;
