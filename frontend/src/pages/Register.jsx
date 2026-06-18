import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuth from '../hooks/useAuth';
import AuthLayout from '../components/AuthLayout';

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validations
    if (!username.trim()) {
      toast.error('Username is required');
      return;
    }
    if (username.trim().length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (!password) {
      toast.error('Password is required');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Creating user profile...');

    try {
      const response = await register(username.trim(), email.trim(), password);
      toast.success(response.message || 'Registration successful!', { id: toastId });
      navigate('/dashboard');
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Registration failed';
      toast.error(errMsg, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Initialize your developer credentials on the Drishyamitra platform."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="block text-xs font-mono uppercase tracking-widest text-[#6b6760] font-semibold">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isSubmitting}
            className="w-full px-4 py-3 bg-[#f2f0eb] border border-[#e8e4dc] rounded-lg text-[#0f0e0c] font-sans placeholder-[#9c9890] transition focus:outline-none focus:border-[#c8501a] focus:bg-white disabled:opacity-50 text-sm"
            placeholder="johndoe"
            autoComplete="username"
          />
        </div>

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
          <label className="block text-xs font-mono uppercase tracking-widest text-[#6b6760] font-semibold">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            className="w-full px-4 py-3 bg-[#f2f0eb] border border-[#e8e4dc] rounded-lg text-[#0f0e0c] font-sans placeholder-[#9c9890] transition focus:outline-none focus:border-[#c8501a] focus:bg-white disabled:opacity-50 text-sm"
            placeholder="••••••••"
            autoComplete="new-password"
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
              <span>Registering...</span>
            </>
          ) : (
            <span>Create Account</span>
          )}
        </button>

        <div className="text-center pt-2">
          <p className="text-xs text-[#6b6760]">
            Already registered?   {' '}
            <Link
              to="/login"
              className="text-[#c8501a] hover:underline font-semibold"
            >
              Authenticate session
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
};

export default Register;
