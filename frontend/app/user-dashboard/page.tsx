"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2, File, Copy, Clock, AlertTriangle } from 'lucide-react';

export default function UserDashboard() {
  const router = useRouter();
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserUploads = async () => {
      try {
        const res = await api.get('/uploads');
        setUploads(res.data);
      } catch (err: any) {
        if (err.response?.status === 401) {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    };
    
    if (!localStorage.getItem('token')) {
      router.push('/login');
    } else if (localStorage.getItem('role') === 'admin') {
      router.push('/dashboard');
    } else {
      fetchUserUploads();
    }
  }, [router]);

  if (loading) {
    return <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">My Dashboard</h1>
      <p className="text-muted-foreground mb-8">View your personal upload history.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-8 max-w-sm">
        <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
          <div className="p-4 bg-primary/20 rounded-xl"><File className="w-8 h-8 text-primary" /></div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">My Total Uploads</p>
            <h4 className="text-3xl font-bold">{uploads.length}</h4>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
        <h3 className="text-xl font-semibold mb-6 flex items-center"><Clock className="w-5 h-5 mr-2" /> Upload History & Results</h3>
        {uploads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground text-sm">
                  <th className="pb-3 font-medium">Assignment Title</th>
                  <th className="pb-3 font-medium">Section</th>
                  <th className="pb-3 font-medium">Upload Date & Time</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((file: any) => (
                  <tr key={file.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <td className="py-4 pr-4 font-medium truncate max-w-[200px]">{file.assignment_title || file.file_name}</td>
                    <td className="py-4 text-sm text-gray-400">{file.section_name || 'N/A'}</td>
                    <td className="py-4 text-sm text-gray-400">{file.upload_time}</td>
                    <td className="py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">
                        Uploaded
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
           <div className="text-center py-12 text-muted-foreground">
             No uploads yet. Go to the Upload page to get started!
           </div>
        )}
      </div>
    </div>
  );
}
