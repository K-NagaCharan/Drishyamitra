import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuth from '../hooks/useAuth';
import AuthLayout from '../components/AuthLayout';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validations
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!password) {
      toast.error('Password is required');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Authenticating...');

    try {
      const response = await login(email, password);
      toast.success(response.message || 'Welcome back!', { id: toastId });
      navigate('/dashboard');
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Login failed';
      toast.error(errMsg, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to Drishyamitra"
      subtitle="Welcome back. Enter your credentials to access the console."
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-xs font-mono uppercase tracking-widest text-[#6b6760] font-semibold">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            className="w-full px-4 py-3 bg-[#f2f0eb] border border-[#e8e4dc] rounded-lg text-[#0f0e0c] font-sans placeholder-[#9c9890] transition focus:outline-none focus:border-[#c8501a] focus:bg-white disabled:opacity-50 text-sm"
            placeholder="name@domain.com"
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-mono uppercase tracking-widest text-[#6b6760] font-semibold">
              Password
            </label>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            className="w-full px-4 py-3 bg-[#f2f0eb] border border-[#e8e4dc] rounded-lg text-[#0f0e0c] font-sans placeholder-[#9c9890] transition focus:outline-none focus:border-[#c8501a] focus:bg-white disabled:opacity-50 text-sm"
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-[#0f0e0c] hover:bg-[#c8501a] text-[#faf9f6] font-mono text-xs uppercase tracking-widest rounded-lg font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center space-x-2 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Verifying...</span>
            </>
          ) : (
            <span>Authenticate</span>
          )}
        </button>

        <div className="text-center pt-2">
          <p className="text-xs text-[#6b6760]">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="text-[#c8501a] hover:underline font-semibold"
            >
              Register core session
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
};

export default Login;
