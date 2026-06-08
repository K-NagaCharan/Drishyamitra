import React from 'react';

const AuthLayout = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f6] p-4 font-sans selection:bg-[#c8501a] selection:text-white relative overflow-hidden">
      {/* Decorative blurred background shapes for depth */}
      <div className="absolute top-20 left-20 w-72 h-72 bg-[#fdf0ea] rounded-full filter blur-3xl opacity-60 animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-[#eeedfe] rounded-full filter blur-3xl opacity-60 animate-pulse"></div>

      <div className="relative w-full max-w-5xl bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[600px] z-10">
        {/* Left pane: Branding & Concept */}
        <div className="hidden md:flex md:col-span-5 bg-[#0f0e0c] text-white p-12 flex-col justify-between relative overflow-hidden">
          {/* Subtle noise/grid pattern overlay */}
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          
          <div className="relative z-10">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#c8501a] font-bold">
              System Core — v1.0
            </span>
            <h1 className="font-serif italic text-4xl mt-6 text-[#faf9f6]">
              APES<span className="text-[#c8501a] not-italic">.</span>
            </h1>
            <p className="text-[#9c9890] text-xs mt-2 font-mono uppercase tracking-widest leading-relaxed">
              Agentic Photos Evaluation & Segregation
            </p>
          </div>

          <div className="relative z-10 space-y-6">
            <blockquote className="border-l-2 border-[#c8501a] pl-4">
              <p className="font-serif italic text-base text-[#e8e4dc] leading-relaxed">
                "Deterministic session states orchestrate probabilistic computer vision intelligence."
              </p>
            </blockquote>
            <p className="text-xs text-[#9c9890] font-mono leading-relaxed">
              Upload photos, extract facial embeddings, label identities, and query files using a Groq tool-calling agent.
            </p>
          </div>

          <div className="relative z-10 text-[10px] text-[#6b6760] font-mono">
            © 2026 APES Core. All rights reserved.
          </div>
        </div>

        {/* Right pane: Auth Form */}
        <div className="col-span-1 md:col-span-7 flex flex-col justify-center p-8 sm:p-12 lg:p-16">
          <div className="w-full max-w-md mx-auto space-y-8">
            <div className="space-y-2">
              <h2 className="text-3xl font-serif tracking-tight text-[#0f0e0c]">
                {title}
              </h2>
              <p className="text-sm text-[#6b6760]">
                {subtitle}
              </p>
            </div>
            
            <div className="mt-8">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
