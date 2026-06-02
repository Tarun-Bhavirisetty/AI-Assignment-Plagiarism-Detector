"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2, Save, KeyRound } from 'lucide-react';

export default function Settings() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
    }
  }, [router]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      await api.post('/change-password', {
        old_password: oldPassword,
        new_password: newPassword
      });
      setMessage({ text: 'Password updated successfully!', type: 'success' });
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      setMessage({ text: err.response?.data?.detail || 'Failed to update password.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8 flex items-center"><KeyRound className="w-8 h-8 mr-3 text-primary" /> Account Settings</h1>
      
      <div className="p-8 rounded-2xl bg-card/40 border border-white/10">
        <h3 className="text-xl font-semibold mb-6">Change Password</h3>
        
        {message.text && (
          <div className={`p-4 mb-6 rounded-lg text-sm font-medium border ${message.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">Current Password</label>
            <input 
              type="password" 
              required 
              className="mt-1 block w-full px-4 py-2 bg-black/50 border border-white/10 rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">New Password</label>
            <input 
              type="password" 
              required 
              className="mt-1 block w-full px-4 py-2 bg-black/50 border border-white/10 rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex justify-center items-center py-2 px-4 mt-6 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Update Password</>}
          </button>
        </form>
      </div>
    </div>
  );
}
