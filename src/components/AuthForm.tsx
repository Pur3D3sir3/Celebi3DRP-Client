import { useState } from 'react';
import axios from 'axios';

type AuthMode = 'login' | 'register';

interface Props {
  mode: AuthMode;
  onSuccess: (token: string, user?: any) => void;
  onSwitch: () => void;
}

export default function AuthForm({ mode, onSuccess, onSwitch }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/login' : '/register';
      const res = await axios.post(endpoint, { username, password });
      
      if (mode === 'login') {
        onSuccess(res.data.token, res.data.user);
      } else {
        onSuccess(res.data.token);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'login' ? 'Sign In' : 'Create Account';
  const switchText = mode === 'login' 
    ? "Don't have an account? Sign up" 
    : 'Already have an account? Sign in';

  return (
    <div className="flex min-h-screen items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className={`
        w-full max-w-md 
        backdrop-blur-xl bg-black/40 
        border border-white/10 rounded-2xl 
        shadow-2xl shadow-indigo-500/5 
        p-8 md:p-10
        transition-all duration-300
      `}>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-gray-400">Welcome to Velvet Horizon</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.trim())}
              className={`
                w-full px-4 py-3 
                bg-black/50 border border-white/10 rounded-lg 
                text-white placeholder-gray-500 
                focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30
                transition
              `}
              placeholder="Choose a username"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`
                w-full px-4 py-3 
                bg-black/50 border border-white/10 rounded-lg 
                text-white placeholder-gray-500 
                focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30
                transition
              `}
              placeholder="••••••••"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-950/30 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`
              w-full py-3.5 px-4 
              bg-indigo-600 hover:bg-indigo-500 
              text-white font-medium rounded-lg 
              shadow-lg shadow-indigo-500/20 
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center
            `}
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-16 0z" />
              </svg>
            ) : null}
            {loading ? 'Please wait...' : title}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={onSwitch}
            className="text-indigo-400 hover:text-indigo-300 text-sm transition"
          >
            {switchText}
          </button>
        </div>
      </div>
    </div>
  );
}