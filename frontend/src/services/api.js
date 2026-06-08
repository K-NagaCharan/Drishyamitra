import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

let unauthorizedInterceptor = null;

// Register response interceptor dynamically so AuthContext can clean up state on 401s
export const registerAuthInterceptor = (onUnauthorized) => {
  if (unauthorizedInterceptor !== null) {
    api.interceptors.response.eject(unauthorizedInterceptor);
  }

  unauthorizedInterceptor = api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response && error.response.status === 401) {
        onUnauthorized();
      }
      return Promise.reject(error);
    }
  );
};

export default api;
