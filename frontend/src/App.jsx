import React from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import AppRouter from './router/AppRouter';

function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'font-sans text-sm border border-[#e8e4dc] bg-white text-[#0f0e0c] shadow-md rounded-lg',
          duration: 4000,
          success: {
            iconTheme: {
              primary: '#0f6e56',
              secondary: '#faf9f6',
            },
          },
          error: {
            iconTheme: {
              primary: '#c8501a',
              secondary: '#faf9f6',
            },
          },
        }}
      />
      <AppRouter />
    </AuthProvider>
  );
}

export default App;
