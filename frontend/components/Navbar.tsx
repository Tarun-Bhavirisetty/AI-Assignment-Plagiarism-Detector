"use client";

import Link from "next/link";
import { Shield, Menu, X, UserCircle, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userRole = localStorage.getItem("role");
    const userJson = localStorage.getItem("user");
    if (token) {
      setIsAuthenticated(true);
      setRole(userRole);
      if (userJson) {
        try {
          const parsed = JSON.parse(userJson);
          setUserName(parsed.name || null);
        } catch (e) {}
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    window.location.href = "/";
  };

  const roleLabelMap: Record<string, { label: string; color: string }> = {
    admin: { label: "Administrator", color: "bg-red-500/10 text-red-500 border-red-500/20" },
    hod: { label: "HOD", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
    faculty: { label: "Faculty", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    evaluator: { label: "Evaluator", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    student: { label: "Student", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  };

  const currentRoleInfo = role ? roleLabelMap[role] || { label: role, color: "bg-muted text-muted-foreground border-border" } : null;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-card/80 backdrop-blur-md transition-colors duration-200">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center space-x-2 text-primary font-bold text-xl tracking-tight group">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 group-hover:scale-105 transition-transform">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">MetaGuard</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center space-x-6 text-sm font-medium">
          {isAuthenticated ? (
            <>
              {role === "admin" && (
                <>
                  <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">Admin Dashboard</Link>
                  <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
                </>
              )}
              {role === "hod" && (
                <>
                  <Link href="/hod-dashboard" className="text-muted-foreground hover:text-foreground transition-colors">HOD Dashboard</Link>
                  <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
                </>
              )}
              {role === "faculty" && (
                <>
                  <Link href="/faculty-dashboard" className="text-muted-foreground hover:text-foreground transition-colors">Faculty Dashboard</Link>
                  <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
                </>
              )}
              {role === "evaluator" && (
                <>
                  <Link href="/evaluator-dashboard" className="text-muted-foreground hover:text-foreground transition-colors">Evaluator Dashboard</Link>
                  <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
                </>
              )}
              {role === "student" && (
                <>
                  <Link href="/user-dashboard" className="text-muted-foreground hover:text-foreground transition-colors">My Dashboard</Link>
                  <Link href="/upload" className="text-muted-foreground hover:text-foreground transition-colors">Upload Assignment</Link>
                  <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
                </>
              )}

              {/* Role badge */}
              {currentRoleInfo && (
                <div className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${currentRoleInfo.color}`}>
                  <UserCircle className="w-3.5 h-3.5" />
                  <span>{currentRoleInfo.label}</span>
                </div>
              )}

              {/* Notifications */}
              <NotificationBell />

              {/* Theme toggle */}
              <ThemeToggle />

              {/* Logout button */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 font-medium px-2.5 py-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                title="Sign out of account"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <div className="flex items-center space-x-3">
              <ThemeToggle />
              <Link
                href="/login"
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)]"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex md:hidden items-center space-x-2">
          {isAuthenticated && <NotificationBell />}
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg border border-border bg-card text-foreground"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-150">
          {isAuthenticated ? (
            <>
              {currentRoleInfo && (
                <div className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${currentRoleInfo.color}`}>
                  {userName ? `${userName} (${currentRoleInfo.label})` : currentRoleInfo.label}
                </div>
              )}
              <div className="flex flex-col space-y-2 pt-2">
                {role === "admin" && (
                  <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-accent text-foreground">Admin Dashboard</Link>
                )}
                {role === "hod" && (
                  <Link href="/hod-dashboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-accent text-foreground">HOD Dashboard</Link>
                )}
                {role === "faculty" && (
                  <Link href="/faculty-dashboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-accent text-foreground">Faculty Dashboard</Link>
                )}
                {role === "evaluator" && (
                  <Link href="/evaluator-dashboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-accent text-foreground">Evaluator Dashboard</Link>
                )}
                {role === "student" && (
                  <>
                    <Link href="/user-dashboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-accent text-foreground">My Dashboard</Link>
                    <Link href="/upload" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-accent text-foreground">Upload Assignment</Link>
                  </>
                )}
                <Link href="/settings" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-accent text-foreground">Settings</Link>
                <button
                  onClick={handleLogout}
                  className="text-left px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-center px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold"
            >
              Sign In
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
