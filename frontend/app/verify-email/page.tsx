"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setMessage("No verification token found in URL.");
      return;
    }

    const verify = async () => {
      try {
        const res = await api.post('/verify-email', { token });
        setSuccess(true);
        setMessage(res.data.message || "Email verified successfully!");
      } catch (err: any) {
        setSuccess(false);
        setMessage(err.response?.data?.detail || "Verification failed or token expired.");
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [token]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-card/40 backdrop-blur-xl border border-white/10 shadow-2xl text-center space-y-6 relative overflow-hidden">
        
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary/20 rounded-full blur-[60px] pointer-events-none"></div>

        {loading ? (
          <div className="py-12 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <h3 className="text-xl font-bold text-white">Verifying your email...</h3>
            <p className="text-sm text-muted-foreground">Please wait while we activate your student account.</p>
          </div>
        ) : success ? (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-white">Account Activated!</h3>
            <p className="text-sm text-gray-300">{message}</p>
            <div className="pt-4">
              <Link 
                href="/login" 
                className="w-full inline-flex items-center justify-center py-2.5 px-4 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                Sign In to Your Dashboard <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto text-red-400">
              <XCircle className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-white">Verification Failed</h3>
            <p className="text-sm text-gray-300">{message}</p>
            <div className="pt-4 space-y-2">
              <Link 
                href="/login" 
                className="w-full inline-flex items-center justify-center py-2.5 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
