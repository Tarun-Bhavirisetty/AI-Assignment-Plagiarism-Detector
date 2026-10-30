"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Loader2, MailCheck, ShieldCheck, ArrowRight, AlertCircle, CheckCircle2, GraduationCap, Briefcase, UserCheck, Shield } from "lucide-react";

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [loginRole, setLoginRole] = useState<string>("student");
  const [regRole, setRegRole] = useState<"student" | "faculty">("student");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [department, setDepartment] = useState("Computer Science");

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const router = useRouter();

  const handleLoginSuccess = (role: string) => {
    if (role === "admin") {
      window.location.href = "/dashboard";
    } else if (role === "hod") {
      window.location.href = "/hod-dashboard";
    } else if (role === "faculty") {
      window.location.href = "/faculty-dashboard";
    } else if (role === "evaluator") {
      window.location.href = "/evaluator-dashboard";
    } else {
      window.location.href = "/user-dashboard";
    }
  };

  const validateRegistration = () => {
    const errors: { [key: string]: string } = {};
    if (!name.trim()) {
      errors.name = "Full Name is required";
    } else if (name.trim().length < 2) {
      errors.name = "Full Name must be at least 2 characters";
    }

    if (!registrationNumber.trim()) {
      errors.registrationNumber = regRole === "faculty" ? "Faculty ID / Employee ID is required" : "Registration Number is required";
    } else if (!/^[A-Za-z0-9\-_/]+$/.test(registrationNumber.trim())) {
      errors.registrationNumber = "Only letters, numbers, hyphens, and slashes allowed";
    }

    const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!email.trim()) {
      errors.email = "Email Address is required";
    } else if (!emailRegex.test(email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Confirm Password is required";
    } else if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");
    setShowResend(false);

    if (!isLogin) {
      const isValid = validateRegistration();
      if (!isValid) return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const res = await api.post("/login", {
          email: email.trim(),
          password,
          role: loginRole,
        });
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("role", res.data.role);
        if (res.data.user) {
          localStorage.setItem("user", JSON.stringify(res.data.user));
        }
        handleLoginSuccess(res.data.role);
      } else {
        const res = await api.post("/signup", {
          name: name.trim(),
          registration_number: registrationNumber.trim(),
          email: email.trim(),
          password,
          confirm_password: confirmPassword,
          department: department.trim() || "Computer Science",
          role: regRole,
        });

        if (res.data.success) {
          setInfoMessage(res.data.message || "Registration successful! Please verify your email.");
          if (res.data.verification_url) {
            setVerificationUrl(res.data.verification_url);
          }
          setName("");
          setRegistrationNumber("");
          setPassword("");
          setConfirmPassword("");
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
      const res = await api.post("/resend-verification", { email: email.trim() });
      setInfoMessage(res.data.message || "Verification email sent! Please check your inbox.");
      if (res.data.verification_url) {
        setVerificationUrl(res.data.verification_url);
      }
      setShowResend(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to resend verification email.");
    } finally {
      setResending(false);
    }
  };

  const rolesList = [
    { id: "student", label: "Student", icon: GraduationCap },
    { id: "faculty", label: "Faculty", icon: Briefcase },
    { id: "evaluator", label: "Evaluator", icon: UserCheck },
    { id: "hod", label: "HOD / Admin", icon: Shield },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden bg-background transition-colors duration-200">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[140px] -z-10 pointer-events-none" />

      <div className="max-w-md w-full p-8 rounded-2xl bg-card border border-border shadow-2xl relative z-10 space-y-6 transition-colors duration-200">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-primary/10 border border-primary/20 mb-3 shadow-inner">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {isLogin ? "Welcome Back to MetaGuard" : "Create Your Account"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isLogin
              ? "Select your institutional role and sign in"
              : "Register to submit or review academic assignments"}
          </p>
        </div>

        {/* Role Selector */}
        {isLogin ? (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Select Your Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              {rolesList.map((r) => {
                const Icon = r.icon;
                const isSelected = loginRole === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setLoginRole(r.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      isSelected
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Register As
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRegRole("student")}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  regRole === "student"
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                <span>Student</span>
              </button>
              <button
                type="button"
                onClick={() => setRegRole("faculty")}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  regRole === "faculty"
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
                }`}
              >
                <Briefcase className="w-4 h-4" />
                <span>Faculty</span>
              </button>
            </div>
          </div>
        )}

        {/* Notifications / Alerts */}
        {error && (
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{error}</p>
              {showResend && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="mt-2 text-xs font-semibold underline hover:no-underline flex items-center gap-1"
                >
                  {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MailCheck className="w-3 h-3" />}
                  Resend verification email
                </button>
              )}
            </div>
          </div>
        )}

        {infoMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p>{infoMessage}</p>
              {verificationUrl && (
                <a
                  href={verificationUrl}
                  className="inline-flex items-center text-xs font-semibold text-primary hover:underline mt-1 gap-1"
                >
                  Verify Now <ArrowRight className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={regRole === "faculty" ? "Dr. Jane Doe" : "Alex Johnson"}
                  className={`block w-full px-3.5 py-2 rounded-xl bg-muted/40 border ${
                    fieldErrors.name ? "border-destructive ring-1 ring-destructive" : "border-border"
                  } text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all`}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: "" });
                  }}
                />
                {fieldErrors.name && <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p>}
              </div>

              {/* ID Field */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  {regRole === "faculty" ? "Faculty ID / Employee ID" : "Student Registration Number"}{" "}
                  <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={regRole === "faculty" ? "FAC1024" : "23BCE1042"}
                  className={`block w-full px-3.5 py-2 rounded-xl bg-muted/40 border ${
                    fieldErrors.registrationNumber ? "border-destructive ring-1 ring-destructive" : "border-border"
                  } text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all`}
                  value={registrationNumber}
                  onChange={(e) => {
                    setRegistrationNumber(e.target.value);
                    if (fieldErrors.registrationNumber) setFieldErrors({ ...fieldErrors, registrationNumber: "" });
                  }}
                />
                {fieldErrors.registrationNumber && (
                  <p className="text-xs text-destructive mt-1">{fieldErrors.registrationNumber}</p>
                )}
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Department
                </label>
                <input
                  type="text"
                  placeholder="Computer Science"
                  className="block w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Email Address */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Email Address <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              required
              placeholder={isLogin ? "user@university.edu" : regRole === "faculty" ? "faculty@university.edu" : "student@university.edu"}
              className={`block w-full px-3.5 py-2 rounded-xl bg-muted/40 border ${
                fieldErrors.email ? "border-destructive ring-1 ring-destructive" : "border-border"
              } text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: "" });
              }}
            />
            {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Password <span className="text-destructive">*</span>
            </label>
            <input
              type="password"
              required
              placeholder={isLogin ? "••••••••" : "At least 6 characters"}
              className={`block w-full px-3.5 py-2 rounded-xl bg-muted/40 border ${
                fieldErrors.password ? "border-destructive ring-1 ring-destructive" : "border-border"
              } text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all`}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: "" });
              }}
            />
            {fieldErrors.password && <p className="text-xs text-destructive mt-1">{fieldErrors.password}</p>}
          </div>

          {/* Confirm Password (Registration only) */}
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Confirm Password <span className="text-destructive">*</span>
              </label>
              <input
                type="password"
                required
                placeholder="Re-enter your password"
                className={`block w-full px-3.5 py-2 rounded-xl bg-muted/40 border ${
                  fieldErrors.confirmPassword ? "border-destructive ring-1 ring-destructive" : "border-border"
                } text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all`}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword) setFieldErrors({ ...fieldErrors, confirmPassword: "" });
                }}
              />
              {fieldErrors.confirmPassword && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.confirmPassword}</p>
              )}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(99,102,241,0.35)] mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {isLogin ? "Signing In..." : "Registering..."}
              </>
            ) : isLogin ? (
              "Sign In"
            ) : regRole === "faculty" ? (
              "Create Faculty Account"
            ) : (
              "Create Student Account"
            )}
          </button>
        </form>

        {/* Footer switch */}
        <div className="text-center text-xs text-muted-foreground pt-2 border-t border-border">
          {isLogin ? "Need a new account? " : "Already registered? "}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
              setInfoMessage("");
              setVerificationUrl(null);
              setFieldErrors({});
            }}
            className="text-primary hover:underline font-semibold"
          >
            {isLogin ? "Register as Student or Faculty" : "Sign In to Existing Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
