"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2, File, Clock, Award, CheckCircle, MessageSquare, User, BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function UserDashboard() {
  const router = useRouter();
  const [uploads, setUploads] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const [uploadsRes, profileRes] = await Promise.all([
          api.get('/uploads'),
          api.get('/profile')
        ]);
        setUploads(uploadsRes.data);
        setUserProfile(profileRes.data);
      } catch (err: any) {
        if (err.response?.status === 401) {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    };
    
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (!token) {
      router.push('/login');
    } else if (role === 'admin') {
      router.push('/dashboard');
    } else if (role === 'hod') {
      router.push('/hod-dashboard');
    } else if (role === 'evaluator') {
      router.push('/evaluator-dashboard');
    } else {
      fetchUserData();
    }
  }, [router]);

  if (loading) {
    return <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const evaluatedCount = uploads.filter(u => u.evaluation_status === 'Evaluation Completed' && u.marks !== null && u.marks !== undefined).length;
  const pendingCount = uploads.length - evaluatedCount;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Welcome & Profile Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-8 border-b border-white/10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Student Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, <span className="text-white font-medium">{userProfile?.name || "Student"}</span>. Track your assignment submissions and evaluation results.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link 
            href="/upload" 
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(99,102,241,0.4)]"
          >
            + Upload New Assignment
          </Link>
        </div>
      </div>

      {/* Profile Info Bar */}
      {userProfile && (
        <div className="mb-8 p-4 rounded-xl bg-card/40 border border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground text-xs uppercase block">Full Name</span>
            <span className="font-semibold text-white">{userProfile.name}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase block">Registration No.</span>
            <span className="font-semibold text-primary-300">{userProfile.registration_number || "N/A"}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase block">Department</span>
            <span className="font-semibold text-white">{userProfile.department || "General"}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase block">Account Status</span>
            <span className="inline-flex items-center text-xs font-medium text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Verified Student
            </span>
          </div>
        </div>
      )}
      
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
          <div className="p-4 bg-primary/20 rounded-xl"><File className="w-8 h-8 text-primary" /></div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">Total Submissions</p>
            <h4 className="text-3xl font-bold">{uploads.length}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
          <div className="p-4 bg-emerald-500/20 rounded-xl"><Award className="w-8 h-8 text-emerald-400" /></div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">Evaluated</p>
            <h4 className="text-3xl font-bold text-emerald-400">{evaluatedCount}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
          <div className="p-4 bg-yellow-500/20 rounded-xl"><Clock className="w-8 h-8 text-yellow-400" /></div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">Pending Review</p>
            <h4 className="text-3xl font-bold text-yellow-400">{pendingCount}</h4>
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
        <h3 className="text-xl font-semibold mb-6 flex items-center">
          <Clock className="w-5 h-5 mr-2 text-primary" /> Submission History & Academic Results
        </h3>
        {uploads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground text-xs uppercase font-semibold">
                  <th className="pb-3 pr-4">Assignment Title</th>
                  <th className="pb-3 px-3">Section</th>
                  <th className="pb-3 px-3">Upload Date</th>
                  <th className="pb-3 px-3">Evaluation Status</th>
                  <th className="pb-3 px-3">Academic Marks</th>
                  <th className="pb-3 pl-3 text-right">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((file: any) => (
                  <tr key={file.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <td className="py-4 pr-4 font-medium text-white truncate max-w-[200px]">
                      {file.assignment_title || file.file_name}
                    </td>
                    <td className="py-4 px-3 text-sm text-gray-400">{file.section_name || 'N/A'}</td>
                    <td className="py-4 px-3 text-sm text-gray-400">{file.upload_time}</td>
                    <td className="py-4 px-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        file.evaluation_status === 'Evaluation Completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : file.evaluation_status === 'Under Review'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : file.evaluation_status === 'Requires Further Review'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                      }`}>
                        {file.evaluation_status && file.evaluation_status !== 'Submitted' ? file.evaluation_status : 'Pending Review'}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-sm">
                      {file.evaluation_status === 'Evaluation Completed' && file.marks !== null && file.marks !== undefined ? (
                        <span className="font-bold text-emerald-400">{file.marks} / {file.max_marks || 100}</span>
                      ) : file.evaluation_status === 'Under Review' ? (
                        <span className="text-blue-400 text-xs italic font-medium">Under review</span>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Not yet evaluated</span>
                      )}
                    </td>
                    <td className="py-4 pl-3 text-right">
                      {(file.evaluation_status === 'Evaluation Completed' || file.evaluation_status === 'Requires Further Review') && (file.comments || file.decision) ? (
                        <button 
                          onClick={() => setSelectedFeedback(file)}
                          className="px-3 py-1 bg-white/10 hover:bg-white/20 text-xs rounded-md text-white transition-colors inline-flex items-center"
                        >
                          <MessageSquare className="w-3.5 h-3.5 mr-1 text-primary" /> View Feedback
                        </button>
                      ) : (
                        <span className="text-gray-500 text-xs">Not available</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 space-y-4 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto text-gray-600" />
            <p>No assignments submitted yet.</p>
            <Link 
              href="/upload"
              className="inline-block px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
            >
              Upload Your First Assignment
            </Link>
          </div>
        )}
      </div>

      {/* Feedback Modal */}
      {selectedFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-lg p-6 rounded-2xl border border-white/10 space-y-4">
            <h3 className="text-xl font-bold text-white flex items-center">
              <MessageSquare className="w-5 h-5 mr-2 text-primary" /> Evaluator Feedback
            </h3>
            <p className="text-sm text-gray-400">
              Assignment: <span className="text-white font-medium">{selectedFeedback.assignment_title || selectedFeedback.file_name}</span>
            </p>
            {selectedFeedback.decision && (
              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <span className="text-xs uppercase text-muted-foreground block mb-1">Decision</span>
                <span className="text-sm font-semibold text-primary-300">{selectedFeedback.decision}</span>
              </div>
            )}
            <div className="p-4 bg-black/40 rounded-xl border border-white/10">
              <span className="text-xs uppercase text-muted-foreground block mb-2">Evaluator Comments</span>
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                {selectedFeedback.comments || "No written comments provided."}
              </p>
            </div>
            {selectedFeedback.marks !== null && (
              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-muted-foreground">Marks Awarded:</span>
                <span className="font-bold text-emerald-400 text-lg">{selectedFeedback.marks} / {selectedFeedback.max_marks || 100}</span>
              </div>
            )}
            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button 
                onClick={() => setSelectedFeedback(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
