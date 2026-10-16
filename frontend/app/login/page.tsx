"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2, MailCheck, ShieldCheck, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const router = useRouter();

  const handleLoginSuccess = (role: string) => {
    if (role === 'admin') {
      window.location.href = '/dashboard';
    } else if (role === 'hod') {
      window.location.href = '/hod-dashboard';
    } else if (role === 'evaluator') {
      window.location.href = '/evaluator-dashboard';
    } else {
      window.location.href = '/user-dashboard';
    }
  };

  const validateRegistration = () => {
    const errors: { [key: string]: string } = {};
    if (!name.trim()) {
      errors.name = 'Full Name is required';
    } else if (name.trim().length < 2) {
      errors.name = 'Full Name must be at least 2 characters';
    }

    if (!registrationNumber.trim()) {
      errors.registrationNumber = 'Registration Number is required';
    } else if (!/^[A-Za-z0-9\-_/]+$/.test(registrationNumber.trim())) {
      errors.registrationNumber = 'Only letters, numbers, hyphens, and slashes allowed';
    }

    const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!email.trim()) {
      errors.email = 'Email Address is required';
    } else if (!emailRegex.test(email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm Password is required';
    } else if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setShowResend(false);

    if (!isLogin) {
      const isValid = validateRegistration();
      if (!isValid) return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const res = await api.post('/login', { email: email.trim(), password });
        localStorage.setItem('token', res.data.access_token);
        localStorage.setItem('role', res.data.role);
        if (res.data.user) {
          localStorage.setItem('user', JSON.stringify(res.data.user));
        }
        handleLoginSuccess(res.data.role);
      } else {
        const res = await api.post('/signup', {
          name: name.trim(),
          registration_number: registrationNumber.trim(),
          email: email.trim(),
          password,
          confirm_password: confirmPassword,
          department: department.trim() || 'Computer Science'
        });

        if (res.data.success) {
          setInfoMessage(res.data.message || "Registration successful! Please verify your email.");
          if (res.data.verification_url) {
            setVerificationUrl(res.data.verification_url);
          }
          // Clear registration inputs
          setName('');
          setRegistrationNumber('');
          setPassword('');
          setConfirmPassword('');
          setFieldErrors({});
          setIsLogin(true);
        }
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || "Authentication request failed.";
      setError(detail);
      if (err.response?.status === 403 && detail.toLowerCase().includes("not verified")) {
        setShowResend(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError("Please enter your registered email address.");
      return;
    }
    setResending(true);
    try {
      const res = await api.post('/resend-verification', { email: email.trim() });
      setInfoMessage(res.data.message || "Verification email sent.");
      if (res.data.verification_url) {
        setVerificationUrl(res.data.verification_url);
      }
      setShowResend(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to resend verification link.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-6 rounded-2xl bg-card/40 backdrop-blur-xl border border-white/10 shadow-2xl relative overflow-hidden">
        
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary/30 rounded-full blur-[60px] pointer-events-none"></div>

        {/* Tab Switcher */}
        <div className="flex rounded-lg bg-black/40 p-1 border border-white/10 relative z-10">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setError('');
              setFieldErrors({});
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              isLogin
                ? 'bg-primary text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setError('');
              setFieldErrors({});
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              !isLogin
                ? 'bg-primary text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Register as Student
          </button>
        </div>
        
        <h2 className="text-2xl font-bold text-center text-white relative z-10">
          {isLogin ? 'Welcome Back' : 'Create Student Account'}
        </h2>
        
        {error && (
          <div className="p-3 text-sm text-red-200 bg-red-900/50 rounded-lg border border-red-900/80 flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{error}</span>
              {showResend && (
                <button 
                  type="button" 
                  onClick={handleResend}
                  disabled={resending}
                  className="block mt-2 font-semibold text-primary-300 underline hover:text-white"
                >
                  {resending ? "Sending link..." : "Click here to resend verification link"}
                </button>
              )}
            </div>
          </div>
        )}

        {infoMessage && (
          <div className="p-3 text-sm text-emerald-200 bg-emerald-950/60 rounded-lg border border-emerald-800">
            <div className="flex items-start space-x-2">
              <MailCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{infoMessage}</span>
              </div>
            </div>
            {verificationUrl && (
              <div className="mt-3 p-3 bg-black/60 rounded border border-emerald-500/40">
                <p className="text-xs text-amber-300 font-medium mb-1">
                  Direct Verification Link (Local / Dev Environment):
                </p>
                <a 
                  href={verificationUrl}
                  className="text-xs font-semibold text-emerald-400 hover:underline flex items-center break-all"
                >
                  Click Here to Verify Your Email <ArrowRight className="w-3.5 h-3.5 ml-1 flex-shrink-0" />
                </a>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10" noValidate>
          {!isLogin && (
            <>
              {/* Field 1: Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Alex Johnson"
                  className={`mt-1 block w-full px-4 py-2 bg-black/50 border ${
                    fieldErrors.name ? 'border-red-500 ring-1 ring-red-500' : 'border-white/10'
                  } rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors`}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: '' });
                  }}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-400 mt-1">{fieldErrors.name}</p>
                )}
              </div>

              {/* Field 2: Registration Number */}
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Registration Number <span className="text-red-400">*</span>
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. 21CS045"
                  className={`mt-1 block w-full px-4 py-2 bg-black/50 border ${
                    fieldErrors.registrationNumber ? 'border-red-500 ring-1 ring-red-500' : 'border-white/10'
                  } rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors uppercase`}
                  value={registrationNumber}
                  onChange={(e) => {
                    setRegistrationNumber(e.target.value.toUpperCase());
                    if (fieldErrors.registrationNumber) setFieldErrors({ ...fieldErrors, registrationNumber: '' });
                  }}
                />
                {fieldErrors.registrationNumber && (
                  <p className="text-xs text-red-400 mt-1">{fieldErrors.registrationNumber}</p>
                )}
              </div>

              {/* Department (Optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Department
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. Computer Science"
                  className="mt-1 block w-full px-4 py-2 bg-black/50 border border-white/10 rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Field 3: Email Address */}
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Email Address <span className="text-red-400">*</span>
            </label>
            <input 
              type="email" 
              required 
              placeholder="student@university.edu"
              className={`mt-1 block w-full px-4 py-2 bg-black/50 border ${
                fieldErrors.email ? 'border-red-500 ring-1 ring-red-500' : 'border-white/10'
              } rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: '' });
              }}
            />
            {fieldErrors.email && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          {/* Field 4: Password */}
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Password <span className="text-red-400">*</span>
            </label>
            <input 
              type="password" 
              required 
              placeholder={isLogin ? "••••••••" : "At least 6 characters"}
              className={`mt-1 block w-full px-4 py-2 bg-black/50 border ${
                fieldErrors.password ? 'border-red-500 ring-1 ring-red-500' : 'border-white/10'
              } rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors`}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: '' });
              }}
            />
            {fieldErrors.password && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.password}</p>
            )}
          </div>

          {/* Field 5: Confirm Password (Registration only) */}
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-300">
                Confirm Password <span className="text-red-400">*</span>
              </label>
              <input 
                type="password" 
                required 
                placeholder="Re-enter your password"
                className={`mt-1 block w-full px-4 py-2 bg-black/50 border ${
                  fieldErrors.confirmPassword ? 'border-red-500 ring-1 ring-red-500' : 'border-white/10'
                } rounded-md text-white focus:ring-primary focus:border-primary outline-none transition-colors`}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword) setFieldErrors({ ...fieldErrors, confirmPassword: '' });
                }}
              />
              {fieldErrors.confirmPassword && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.confirmPassword}</p>
              )}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)]"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {isLogin ? 'Signing In...' : 'Registering...'}
              </>
            ) : (
              isLogin ? 'Sign In' : 'Create Student Account'
            )}
          </button>
        </form>

        <div className="text-center text-sm text-gray-400 relative z-10 pt-2 border-t border-white/5">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            type="button" 
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setInfoMessage('');
              setVerificationUrl(null);
              setFieldErrors({});
            }} 
            className="text-primary hover:underline font-semibold"
          >
            {isLogin ? 'Register as Student' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
