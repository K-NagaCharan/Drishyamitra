import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuth from '../hooks/useAuth';
import api from '../services/api';
import { getSocket } from '../services/socket';

const Dashboard = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Socket connect checking
  useEffect(() => {
    const socket = getSocket();
    if (!socket) {
      setIsConnected(false);
      return;
    }

    setIsConnected(socket.connected);

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [token]);

  // Fetch Stats
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const response = await api.get('/photos/stats');
        if (response.data && response.data.success) {
          setStats(response.data.data);
        } else {
          toast.error('Failed to load library statistics');
        }
      } catch (err) {
        console.error('Failed to fetch dashboard statistics', err);
        toast.error('Unable to fetch library statistics. Please check connection.');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchStats();
    }
  }, [token]);

  // Progress block generator
  const generateBlockBar = (percent) => {
    const totalBlocks = 16;
    const filledBlocks = Math.min(totalBlocks, Math.max(0, Math.round((percent / 100) * totalBlocks)));
    const emptyBlocks = totalBlocks - filledBlocks;
    return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
  };

  // Bytes formatting
  const formatStorage = (bytes) => {
    if (bytes === undefined || bytes === null || bytes === 0) return '0.0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb < 0.1) {
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(1)} MB`;
    }
    return `${gb.toFixed(1)} GB`;
  };

  // Time formatting helper
  const formatTimeAgo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="flex-grow flex flex-col justify-center relative select-none">
      {/* Decorative blurred background shdrishyamitra */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#fdf0ea] rounded-full filter blur-3xl opacity-50 pointer-events-none text-transparent">.</div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#eeedfe] rounded-full filter blur-3xl opacity-50 pointer-events-none text-transparent">.</div>

      {/* Main Workspace content */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto p-6 md:p-12 space-y-8 flex flex-col justify-center">

        {/* Welcome Section */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-[#c8501a] font-bold">
              Photo Library Control Center
            </span>
            <div className="flex items-center space-x-1.5 bg-white border border-[#e8e4dc] px-2.5 py-1 rounded-full shadow-xs">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#0f6e56] animate-pulse' : 'bg-red-500'}`}></span>
              <span className="text-[9px] font-mono uppercase tracking-wider text-[#6b6760]">
                API: {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>
          
          <h1 className="text-4xl font-serif text-[#0f0e0c] leading-tight">
            Welcome back, <em className="italic text-[#c8501a] font-medium">{user?.username}</em>
          </h1>
          <p className="text-sm text-[#6b6760] max-w-2xl leading-relaxed">
            Your personal AI-assisted media repository is fully operational. Access real-time detection telemetry, verify embeddings storage, and manage indexing delivery directly.
          </p>
        </section>

        {loading ? (
          /* Loading Skeletons */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white border border-[#e8e4dc] rounded-xl p-6 min-h-[300px] flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  <div className="h-3 w-1/3 bg-gray-200 rounded"></div>
                  <div className="space-y-3 pt-4">
                    <div className="h-6 bg-gray-100 rounded w-full"></div>
                    <div className="h-6 bg-gray-100 rounded w-full"></div>
                    <div className="h-6 bg-gray-100 rounded w-full"></div>
                  </div>
                </div>
                <div className="h-10 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : stats ? (
          /* Info Grid */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* YOUR PHOTO LIBRARY */}
            <div className="bg-white border border-[#e8e4dc] hover:border-[#c8501a]/50 rounded-xl p-6 shadow-sm flex flex-col justify-between min-h-[340px] transition-all duration-300 group hover:shadow-md">
              <div className="space-y-5">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#9c9890] font-bold">
                  YOUR PHOTO LIBRARY
                </h3>
                
                <div className="space-y-3 font-mono text-xs text-[#3a3834]">
                  <div className="flex justify-between items-center border-b border-[#f2f0eb] pb-2.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">📷</span> Photos Uploaded
                    </span>
                    <span className="font-bold text-[#0f0e0c]">{stats.photosCount?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#f2f0eb] pb-2.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">👤</span> People Identified
                    </span>
                    <span className="font-bold text-[#0f0e0c]">{stats.peopleCount?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#f2f0eb] pb-2.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">🙂</span> Faces Detected
                    </span>
                    <span className="font-bold text-[#0f0e0c]">{stats.facesCount?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#f2f0eb] pb-2.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">🏷️</span> Unlabeled Faces
                    </span>
                    <span className="font-bold text-[#c8501a]">{stats.unlabeledFacesCount?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[#f2f0eb] pb-2.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">🧠</span> Embeddings Stored
                    </span>
                    <span className="font-bold text-[#0f0e0c]">{stats.embeddingsCount?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between items-center pb-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">☁️</span> Storage Used
                    </span>
                    <span className="font-bold text-[#0f0e0c]">{formatStorage(stats.storageBytes)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => navigate('/gallery')}
                  className="w-full text-center px-4 py-2.5 border border-[#e8e4dc] hover:border-[#c8501a] text-[#0f0e0c] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition-all duration-200 bg-white font-bold group-hover:bg-[#faf9f6] active:scale-98 cursor-pointer"
                >
                  View Gallery →
                </button>
              </div>
            </div>

            {/* LIBRARY STORAGE */}
            <div className="bg-white border border-[#e8e4dc] hover:border-[#c8501a]/50 rounded-xl p-6 shadow-sm flex flex-col justify-between min-h-[340px] transition-all duration-300 group hover:shadow-md">
              <div className="space-y-6">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#9c9890] font-bold">
                  LIBRARY STORAGE
                </h3>
                
                {/* Dynamically Generated Progress Bar Blocks */}
                <div className="space-y-3">
                  <div className="font-mono text-sm tracking-tight text-[#c8501a] font-bold select-none truncate">
                    {generateBlockBar(stats.storagePercent)}
                  </div>
                  
                  {/* Visual HTML5 Premium Progress Bar */}
                  <div className="w-full bg-[#f2f0eb] border border-[#e8e4dc] rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-[#c8501a] to-[#e67e22] h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${stats.storagePercent}%` }}
                    ></div>
                  </div>

                  <p className="font-mono text-xs text-[#6b6760] font-semibold">
                    {formatStorage(stats.storageBytes)} / {formatStorage(stats.storageLimitBytes)} ({stats.storagePercent}%)
                  </p>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-[#f2f0eb] font-mono text-xs text-[#6b6760]">
                  <div className="flex justify-between">
                    <span>Images:</span>
                    <span className="font-bold text-[#0f0e0c]">{stats.photosCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Faces:</span>
                    <span className="font-bold text-[#0f0e0c]">{stats.facesCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Embeddings:</span>
                    <span className="font-bold text-[#0f0e0c]">{stats.embeddingsCount || 0}</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => navigate('/gallery')}
                  className="w-full text-center px-4 py-2.5 border border-[#e8e4dc] hover:border-[#c8501a] text-[#0f0e0c] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition-all duration-200 bg-white font-bold group-hover:bg-[#faf9f6] active:scale-98 cursor-pointer"
                >
                  Manage Storage →
                </button>
              </div>
            </div>

            {/* RECENT ACTIVITY */}
            <div className="bg-[#0f0e0c] text-white rounded-xl p-6 shadow-sm flex flex-col justify-between min-h-[340px] relative overflow-hidden transition-all duration-300 hover:shadow-md">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#c8501a]/10 rounded-full filter blur-2xl pointer-events-none"></div>
              
              <div className="space-y-4 relative z-10 flex-1 flex flex-col justify-start">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#9c9890] font-bold">
                  RECENT ACTIVITY
                </h3>
                
                {stats.recentActivities && stats.recentActivities.length > 0 ? (
                  <ul className="space-y-3 font-mono text-[11px] text-[#9c9890] flex-grow">
                    {stats.recentActivities.map((act, index) => (
                      <li key={index} className="flex items-start gap-2.5 group">
                        <span className="text-[#c8501a] font-bold select-none group-hover:scale-110 transition-transform">✓</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#faf9f6] truncate font-medium">{act.message}</p>
                          <span className="text-[9px] text-[#6b6760] font-light">
                            {formatTimeAgo(act.timestamp)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex-grow flex items-center justify-center text-center p-4">
                    <p className="text-xs font-mono text-[#6b6760] italic">No recent activity detected.</p>
                  </div>
                )}
              </div>

              {stats.lastUpload && (
                <div className="relative z-10 mt-4 pt-4 border-t border-[#3a3834] space-y-1">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-[#9c9890] font-bold block">
                    Last Upload
                  </span>
                  <p className="text-xs font-semibold text-white truncate">{stats.lastUpload.filename}</p>
                  <span className="text-[9px] text-[#6b6760] font-mono block">
                    {formatTimeAgo(stats.lastUpload.uploadedAt)}
                  </span>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="border border-[#e8e4dc] rounded-xl p-12 text-center max-w-md mx-auto space-y-4">
            <p className="text-sm font-mono text-[#6b6760]">Failed to initialize dashboard. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#0f0e0c] text-white text-xs font-mono uppercase tracking-widest rounded-lg transition hover:bg-[#c8501a]"
            >
              Reload
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
