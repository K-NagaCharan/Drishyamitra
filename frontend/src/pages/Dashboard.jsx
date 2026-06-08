import React from 'react';
import toast from 'react-hot-toast';
import useAuth from '../hooks/useAuth';

const Dashboard = () => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#0f0e0c] flex flex-col font-sans selection:bg-[#c8501a] selection:text-white relative">
      {/* Decorative blurred background shapes */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#fdf0ea] rounded-full filter blur-3xl opacity-50 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#eeedfe] rounded-full filter blur-3xl opacity-50 pointer-events-none"></div>

      {/* Top Navbar */}
      <nav className="relative z-10 bg-white/70 backdrop-blur-md border-b border-[#e8e4dc] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="font-serif italic text-2xl tracking-tight text-[#0f0e0c]">
            APES<span className="text-[#c8501a] not-italic">.</span>
          </span>
          <span className="hidden sm:inline-block px-2 py-0.5 bg-[#f2f0eb] border border-[#e8e4dc] rounded text-[10px] font-mono text-[#6b6760] uppercase tracking-wider">
            Workspace
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex flex-col text-right">
            <span className="text-xs font-semibold text-[#0f0e0c]">{user?.username}</span>
            <span className="text-[10px] text-[#6b6760] font-mono">{user?.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 border border-[#e8e4dc] hover:border-[#c8501a] hover:text-[#c8501a] text-xs font-mono uppercase tracking-widest rounded-lg transition active:scale-95 cursor-pointer bg-white"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Workspace content */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto p-6 md:p-12 space-y-8">
        {/* Welcome Section */}
        <section className="space-y-2">
          <span className="font-mono text-xs uppercase tracking-widest text-[#c8501a] font-bold">
            Auth Access Verification
          </span>
          <h1 className="text-4xl font-serif text-[#0f0e0c]">
            Welcome back, <em className="italic text-[#c8501a] font-medium">{user?.username}</em>
          </h1>
          <p className="text-sm text-[#6b6760] max-w-2xl leading-relaxed">
            Authentication successfully initialized. Your credentials have been verified and access is granted. Feel free to explore the core modules below as they unlock during future sprints.
          </p>
        </section>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Identity Credentials Card */}
          <div className="col-span-1 md:col-span-1 bg-white border border-[#e8e4dc] rounded-xl p-6 shadow-sm flex flex-col justify-between min-h-[180px]">
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#9c9890] font-bold mb-4">
                Core Identity
              </h3>
              <p className="text-sm text-[#0f0e0c] font-semibold">{user?.username}</p>
              <p className="text-xs text-[#6b6760] font-mono mt-1">{user?.email}</p>
            </div>
            <div className="flex items-center mt-4">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0f6e56] animate-pulse mr-2"></span>
              <span className="text-[10px] font-mono text-[#0f6e56] uppercase tracking-widest font-bold">
                Session Active
              </span>
            </div>
          </div>

          {/* Integration Status Card */}
          <div className="col-span-1 md:col-span-1 bg-white border border-[#e8e4dc] rounded-xl p-6 shadow-sm flex flex-col justify-between min-h-[180px]">
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#9c9890] font-bold mb-4">
                Integration API Status
              </h3>
              <p className="text-sm text-[#0f0e0c] font-semibold">Backend Gateway Connected</p>
              <p className="text-xs text-[#6b6760] mt-1">
                Connected to {import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}
              </p>
            </div>
            <div className="flex items-center mt-4">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0f6e56] mr-2"></span>
              <span className="text-[10px] font-mono text-[#0f6e56] uppercase tracking-widest font-bold">
                200 OK
              </span>
            </div>
          </div>

          {/* Next Sprint Actions */}
          <div className="col-span-1 md:col-span-1 bg-[#0f0e0c] text-white rounded-xl p-6 shadow-sm flex flex-col justify-between min-h-[180px] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#c8501a]/20 rounded-full filter blur-xl"></div>
            <div className="relative z-10">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#9c9890] font-bold mb-4">
                Next Modules
              </h3>
              <p className="text-sm text-white font-semibold">Photo pipeline & Agentic controls</p>
              <p className="text-xs text-[#9c9890] mt-1 leading-relaxed">
                Sprint 2 will unlock real-time photo uploads and natural language commands.
              </p>
            </div>
            <div className="relative z-10 flex items-center mt-4">
              <span className="text-[10px] font-mono text-[#c8501a] uppercase tracking-widest font-bold">
                Upcoming Sprint
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
