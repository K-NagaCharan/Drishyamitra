import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import PhotoCard from '../components/PhotoCard';
import PageLoader from '../components/PageLoader';

const PersonPhotosPage = () => {
  const { personId } = useParams();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState([]);
  const [personName, setPersonName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPersonPhotos = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/faces/people/${personId}/photos`);
        setPhotos(response.data.photos);
        setPersonName(response.data.personName);
      } catch (err) {
        setError('Failed to retrieve photos for this person.');
        toast.error(err.response?.data?.message || 'Error fetching photos.');
      } finally {
        setLoading(false);
      }
    };

    fetchPersonPhotos();
  }, [personId]);

  return (
    <div className="flex-grow max-w-7xl w-full mx-auto p-6 md:p-12 space-y-8 select-none flex flex-col justify-start">
      {/* Back navigation & Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate('/gallery')}
          className="flex items-center space-x-2 text-xs font-mono uppercase tracking-widest text-[#6b6760] hover:text-[#c8501a] transition cursor-pointer active:scale-98"
        >
          <span>← Back to Gallery</span>
        </button>
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-widest text-[#c8501a] font-bold">
            Person Filter
          </span>
          <h1 className="text-3xl font-serif text-[#0f0e0c]">
            Photos of {personName || '...'}
          </h1>
          <p className="text-sm text-[#6b6760] leading-relaxed">
            All labeled photos matching the profile of {personName || 'this person'}.
          </p>
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <div className="text-center py-12 text-[#6b6760] font-sans">
          {error}
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center py-12 text-[#6b6760] font-sans">
          No labeled photos found for this person.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in duration-200">
          {photos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onDeleteClick={() => {}} // Read-only mode on this filter page
              isDeleting={false}
              isSelectionMode={false}
              isSelected={false}
              onSelectToggle={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PersonPhotosPage;
