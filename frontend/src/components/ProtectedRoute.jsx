import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

export const FullPageLoader = () => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#faf9f6] z-50">
      <div className="flex flex-col items-center space-y-4">
        {/* Animated outer ring */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-[#e8e4dc] opacity-50"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-[#c8501a] animate-spin"></div>
        </div>
        
        {/* Sleek brand typography */}
        <div className="font-serif italic text-2xl text-[#0f0e0c] animate-pulse">
          Drishyamitra<span className="text-[#c8501a] not-italic">.</span>
        </div>
        <p className="text-xs font-mono uppercase tracking-widest text-[#6b6760] animate-pulse">
          Initializing Session
        </p>
      </div>
    </div>
  );
};

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <FullPageLoader />;
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
