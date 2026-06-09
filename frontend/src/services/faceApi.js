import api from './api';

/**
 * Fetch sorted and paginated unlabeled faces for the authenticated user
 * @param {number} page - Current page offset
 * @param {number} limit - Items per page
 * @returns {Promise<Array>} - Array of unlabeled face objects
 */
export const getUnlabeledFaces = async (page = 1, limit = 20) => {
  const response = await api.get('/faces/unlabeled', {
    params: { page, limit }
  });
  return response.data;
};

/**
 * Assign a person name to an unlabeled face, triggering auto-propagation
 * @param {string} faceId - Face ObjectID to label
 * @param {string} personName - Name to associate with the face
 * @returns {Promise<object>} - Service result response
 */
export const labelFace = async (faceId, personName) => {
  const response = await api.post(`/faces/${faceId}/label`, { personName });
  return response.data;
};

/**
 * Retrieve visual name suggestion for an unlabeled face
 * @param {string} faceId - Face ObjectID
 * @returns {Promise<object>} - Suggestion payload
 */
export const getFaceSuggestion = async (faceId) => {
  const response = await api.get(`/faces/${faceId}/suggest`);
  return response.data;
};
