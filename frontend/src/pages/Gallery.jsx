import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import PhotoCard from '../components/PhotoCard';
import PersonAvatar from '../components/PersonAvatar';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import EmptyState from '../components/EmptyState';
import PageLoader from '../components/PageLoader';

const Gallery = () => {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  
  // Pagination details
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 30;

  // Labeled People
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);

  // Deletion details (Single & Selection)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [deletingIds, setDeletingIds] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);

  // Fetch photos function
  const fetchPhotos = useCallback(async (currentSkip, append = false) => {
    if (currentSkip === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const response = await api.get(`/photos?limit=${LIMIT}&skip=${currentSkip}`);
      if (response.data && response.data.success) {
        const fetchedPhotos = response.data.data.photos;
        
        if (append) {
          setPhotos((prev) => [...prev, ...fetchedPhotos]);
        } else {
          setPhotos(fetchedPhotos);
        }

        // Determine if there are more photos
        if (fetchedPhotos.length < LIMIT) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      }
    } catch (err) {
      setError('Unable to load photos. Please check your connection.');
      toast.error(err.response?.data?.message || 'Failed to fetch photos.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Fetch people function
  const fetchPeople = useCallback(async () => {
    setLoadingPeople(true);
    try {
      const response = await api.get('/faces/people');
      setPeople(response.data);
    } catch (err) {
      console.error('Failed to load people avatars:', err);
    } finally {
      setLoadingPeople(false);
    }
  }, []);

  // Fetch initial batch on mount
  useEffect(() => {
    fetchPhotos(0);
    fetchPeople();
  }, [fetchPhotos, fetchPeople]);

  // Load more trigger
  const handleLoadMore = () => {
    const nextSkip = skip + LIMIT;
    setSkip(nextSkip);
    fetchPhotos(nextSkip, true);
  };

  // Retry trigger
  const handleRetry = () => {
    setSkip(0);
    setHasMore(true);
    fetchPhotos(0);
    fetchPeople();
  };

  // Deletion handlers
  const handleDeleteClick = (photo) => {
    setSelectedPhoto(photo);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (photoId) => {
    setDeleteModalOpen(false);
    
    // Add to deleting list to show loading spinners on the card itself
    setDeletingIds((prev) => [...prev, photoId]);

    try {
      await api.delete(`/photos/${photoId}`);
      toast.success('Photo deleted successfully!');
      
      // Filter out immediately from UI
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to delete photo';
      toast.error(errMsg);
    } finally {
      // Remove from deleting loading state
      setDeletingIds((prev) => prev.filter((id) => id !== photoId));
      setSelectedPhoto(null);
    }
  };

  // Selection handlers
  const handleToggleSelectionMode = () => {
    setIsSelectionMode((prev) => !prev);
    setSelectedPhotoIds([]); // Reset selection on toggle
  };

  const handleSelectToggle = (photoId) => {
    setSelectedPhotoIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  };

  const handleSelectAllToggle = () => {
    if (selectedPhotoIds.length === photos.length) {
      setSelectedPhotoIds([]);
    } else {
      setSelectedPhotoIds(photos.map((p) => p.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPhotoIds.length === 0) return;
    
    const confirmMsg = `Are you sure you want to delete ${selectedPhotoIds.length} photo(s)? This will permanently remove them and all associated faces.`;
    if (!window.confirm(confirmMsg)) return;

    // Add selected IDs to deleting list to show loaders
    setDeletingIds((prev) => [...prev, ...selectedPhotoIds]);

    try {
      await api.post('/photos/bulk-delete', { ids: selectedPhotoIds });
      toast.success(`Successfully deleted ${selectedPhotoIds.length} photo(s)!`);
      
      // Filter out immediately from UI
      setPhotos((prev) => prev.filter((p) => !selectedPhotoIds.includes(p.id)));
      setIsSelectionMode(false);
      setSelectedPhotoIds([]);
      // Refresh people avatars as some face references might be removed
      fetchPeople();
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to delete photos';
      toast.error(errMsg);
    } finally {
      setDeletingIds((prev) => prev.filter((id) => !selectedPhotoIds.includes(id)));
    }
  };

  return (
    <div className="flex-grow max-w-7xl w-full mx-auto p-6 md:p-12 space-y-8 select-none flex flex-col justify-start">
      {/* Header Section */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 border-b border-[#e8e4dc] pb-6">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-widest text-[#c8501a] font-bold">
            Asset Control
          </span>
          <h1 className="text-3xl font-serif text-[#0f0e0c]">
            Photo Gallery
          </h1>
          <p className="text-sm text-[#6b6760] leading-relaxed">
            Manage your uploaded images and map corresponding face structures.
          </p>
        </div>

        {photos.length > 0 && (
          <div className="flex items-center space-x-3">
            {isSelectionMode ? (
              <>
                <span className="text-xs font-mono text-[#6b6760] mr-2">
                  Selected: {selectedPhotoIds.length} photo(s)
                </span>
                <button
                  onClick={handleSelectAllToggle}
                  className="px-4 py-2 border border-[#e8e4dc] hover:bg-[#f2f0eb] text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer bg-white text-[#3a3834]"
                >
                  {selectedPhotoIds.length === photos.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedPhotoIds.length === 0}
                  className="px-4 py-2 bg-[#c8501a] hover:bg-[#c8501a]/90 disabled:opacity-50 text-white text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer font-bold"
                >
                  Delete ({selectedPhotoIds.length})
                </button>
                <button
                  onClick={handleToggleSelectionMode}
                  className="px-4 py-2 border border-[#e8e4dc] hover:bg-[#f2f0eb] text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer bg-white text-[#3a3834]"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={handleToggleSelectionMode}
                className="px-4 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer bg-white text-[#3a3834]"
              >
                Select Photos
              </button>
            )}
          </div>
        )}
      </section>

      {/* Main Area */}
      {loading ? (
        /* Loader state */
        <PageLoader />
      ) : error ? (
        /* Network Error & Retry Interface */
        <div className="border border-red-200 bg-red-50/50 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-4 flex flex-col items-center">
          <div className="p-3 bg-red-100 rounded-full text-red-600">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-serif text-[#0f0e0c] font-bold">Connection Error</h3>
            <p className="text-sm text-[#6b6760] leading-relaxed">{error}</p>
          </div>
          <button
            onClick={handleRetry}
            className="px-6 py-2 bg-[#0f0e0c] hover:bg-[#c8501a] text-white text-xs font-mono uppercase tracking-widest rounded-lg font-semibold transition active:scale-95 cursor-pointer mt-2"
          >
            Retry Fetch
          </button>
        </div>
      ) : photos.length === 0 ? (
        /* Empty State */
        <EmptyState />
      ) : (
        <div className="space-y-10">
          {/* People horizontally scrolling section */}
          {!loadingPeople && people.length > 0 && (
            <section className="space-y-4 pb-6 border-b border-[#e8e4dc]/60">
              <h2 className="text-sm font-mono uppercase tracking-widest text-[#6b6760] font-bold">
                People
              </h2>
              <div className="flex items-center space-x-6 overflow-x-auto py-2 scrollbar-none scroll-smooth">
                {people.map((person) => (
                  <PersonAvatar
                    key={person.id}
                    person={person}
                    onClick={() => navigate(`/gallery/person/${person.id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Photos grid section */}
          <section className="space-y-4">
            {people.length > 0 && (
              <h2 className="text-sm font-mono uppercase tracking-widest text-[#6b6760] font-bold">
                Photos
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in duration-200">
              {photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onDeleteClick={handleDeleteClick}
                  isDeleting={deletingIds.includes(photo.id)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedPhotoIds.includes(photo.id)}
                  onSelectToggle={handleSelectToggle}
                />
              ))}
            </div>
          </section>

          {/* Pagination trigger button */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-8 py-3 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer bg-white text-[#3a3834] font-semibold flex items-center justify-center space-x-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                {loadingMore ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#c8501a]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Fetching assets...</span>
                  </>
                ) : (
                  <span>Load More</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Deletion Modal overlay */}
      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        photo={selectedPhoto}
      />
    </div>
  );
};

export default Gallery;
