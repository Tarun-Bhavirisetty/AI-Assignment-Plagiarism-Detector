"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const res = await api.post('/login', { email, password });
        localStorage.setItem('token', res.data.access_token);
        localStorage.setItem('role', res.data.role);
        window.location.href = res.data.role === 'admin' ? '/dashboard' : '/user-dashboard';
      } else {
        const res = await api.post('/signup', { name, email, password });
        localStorage.setItem('token', res.data.access_token);
        localStorage.setItem('role', res.data.role);
        window.location.href = '/user-dashboard';
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-6 rounded-2xl bg-card/40 backdrop-blur-xl border border-white/10 shadow-2xl relative overflow-hidden">
        
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary/30 rounded-full blur-[60px] pointer-events-none"></div>
        
        <h2 className="text-3xl font-bold text-center text-white relative z-10">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        
        {error && <div className="p-3 text-sm text-red-200 bg-red-900/50 rounded border border-red-900">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-300">Name</label>
              <input 
                type="text" 
                required 
                className="mt-1 block w-full px-4 py-2 bg-black/50 border border-white/10 rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300">Email</label>
            <input 
              type="email" 
              required 
              className="mt-1 block w-full px-4 py-2 bg-black/50 border border-white/10 rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Password</label>
            <input 
              type="password" 
              required 
              className="mt-1 block w-full px-4 py-2 bg-black/50 border border-white/10 rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="text-center text-sm text-gray-400 relative z-10">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline">
            {isLogin ? 'Sign Up' : 'Log In'}
          </button>
        </div>
      </div>
    </div>
  );
}
