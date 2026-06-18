import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuth from '../hooks/useAuth';
import RecognitionProgress from './RecognitionProgress';
import DeliveryStatus from './DeliveryStatus';

const AppLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    `px-3 py-2 text-[10px] sm:text-xs font-mono uppercase tracking-widest rounded-lg transition-colors font-semibold ${
      isActive
        ? 'bg-[#c8501a] text-white font-bold'
        : 'text-[#6b6760] hover:text-[#c8501a] hover:bg-[#f2f0eb]/50'
    }`;

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#0f0e0c] flex flex-col font-sans">
      {/* Navigation Header */}
      <nav className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-[#e8e4dc] px-6 py-4 flex items-center justify-between z-30 shadow-xs select-none">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <span className="font-serif italic text-2xl tracking-tight text-[#0f0e0c]">
              Drishyamitra<span className="text-[#c8501a] not-italic">.</span>
            </span>
          </div>

          <div className="hidden md:flex items-center space-x-2">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/gallery" className={navLinkClass}>
              Gallery
            </NavLink>
            <NavLink to="/upload" className={navLinkClass}>
              Upload
            </NavLink>
            <NavLink to="/chat" className={navLinkClass}>
              Chat
            </NavLink>
            <NavLink to="/faces" className={navLinkClass}>
              Faces
            </NavLink>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-[#0f0e0c]">{user?.username}</span>
            <span className="text-[10px] text-[#6b6760] font-mono">{user?.email}</span>
          </div>
          
          <div className="md:hidden flex items-center space-x-1">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dash
            </NavLink>
            <NavLink to="/gallery" className={navLinkClass}>
              Gallery
            </NavLink>
            <NavLink to="/upload" className={navLinkClass}>
              Upload
            </NavLink>
            <NavLink to="/chat" className={navLinkClass}>
              Chat
            </NavLink>
            <NavLink to="/faces" className={navLinkClass}>
              Faces
            </NavLink>
          </div>

          <button
            onClick={handleLogout}
            className="px-4 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer bg-white"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Workspace Slot */}
      <div className="flex-grow flex flex-col">
        <RecognitionProgress />
        <DeliveryStatus />
        <Outlet />
      </div>
    </div>
  );
};

export default AppLayout;
