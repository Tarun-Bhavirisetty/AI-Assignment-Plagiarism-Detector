"use client";

import Link from 'next/link';
import { Shield } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    // Basic check for auth token
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('role');
    if (token) {
      setIsAuthenticated(true);
      setRole(userRole);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.href = '/';
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/50 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2 text-primary font-bold text-xl tracking-tight">
          <Shield className="w-6 h-6" />
          <span>MetaGuard</span>
        </Link>
        <div className="flex items-center space-x-4 text-sm font-medium">
          {isAuthenticated ? (
            <>
              {role === 'admin' ? (
                <>
                  <Link href="/dashboard" className="text-muted-foreground hover:text-white transition-colors">Admin Dashboard</Link>
                  <Link href="/settings" className="text-muted-foreground hover:text-white transition-colors">Settings</Link>
                </>
              ) : (
                <>
                  <Link href="/user-dashboard" className="text-muted-foreground hover:text-white transition-colors">My Dashboard</Link>
                  <Link href="/upload" className="text-muted-foreground hover:text-white transition-colors">Upload</Link>
                  <Link href="/settings" className="text-muted-foreground hover:text-white transition-colors">Settings</Link>
                </>
              )}
              <button onClick={handleLogout} className="text-destructive hover:text-red-400 transition-colors">Logout</button>
            </>
          ) : (
            <Link href="/login" className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-[0_0_15px_rgba(99,102,241,0.5)]">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
