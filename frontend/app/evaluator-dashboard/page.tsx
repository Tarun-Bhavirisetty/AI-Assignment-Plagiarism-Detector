"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2, Users, FileText, CheckCircle, Clock, AlertTriangle, Edit3, Eye, Search, Filter } from 'lucide-react';
import DuplicateCompareModal from '@/components/DuplicateCompareModal';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';

export default function EvaluatorDashboard() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [assignedSections, setAssignedSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [compareUploadId, setCompareUploadId] = useState<number | null>(null);
  const [previewUpload, setPreviewUpload] = useState<any>(null);

  // Evaluation form state
  const [gradingUpload, setGradingUpload] = useState<any>(null);
  const [marks, setMarks] = useState<string>('');
  const [maxMarks, setMaxMarks] = useState<string>('100');
  const [evalStatus, setEvalStatus] = useState<string>('Evaluation Completed');
  const [decision, setDecision] = useState<string>('Cleared');
  const [comments, setComments] = useState<string>('');
  const [savingEval, setSavingEval] = useState(false);
  const [evalSuccess, setEvalSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [subsRes, secRes] = await Promise.all([
        api.get('/evaluator/submissions'),
        api.get('/evaluator/sections')
      ]);
      setSubmissions(subsRes.data);
      setAssignedSections(secRes.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        router.push('/login');
      } else if (err.response?.status === 403) {
        router.push('/user-dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (!token) {
      router.push('/login');
    } else if (role !== 'evaluator' && role !== 'admin') {
      router.push('/user-dashboard');
    } else {
      fetchData();
    }
  }, [router]);

  const openGradingModal = async (sub: any) => {
    setGradingUpload(sub);
    setMarks(sub.marks !== null && sub.marks !== undefined ? String(sub.marks) : '');
    setMaxMarks(String(sub.max_marks || 100));
    setEvalStatus(sub.evaluation_status || 'Evaluation Completed');
    setDecision(sub.decision || 'Cleared');
    setComments(sub.comments || '');
    setEvalSuccess('');

    // Fetch existing details
    try {
      const res = await api.get(`/evaluations/${sub.id}`);
      if (res.data) {
        if (res.data.marks !== null) setMarks(String(res.data.marks));
        if (res.data.status) setEvalStatus(res.data.status);
        if (res.data.decision) setDecision(res.data.decision);
        if (res.data.comments) setComments(res.data.comments);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingUpload) return;
    setSavingEval(true);
    try {
      await api.post(`/evaluations/${gradingUpload.id}`, {
        marks: marks ? parseFloat(marks) : null,
        max_marks: maxMarks ? parseFloat(maxMarks) : 100.0,
        status: evalStatus,
        decision,
        comments
      });
      setEvalSuccess("Evaluation saved successfully!");
      fetchData();
      setTimeout(() => {
        setGradingUpload(null);
      }, 1000);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to save evaluation.");
    } finally {
      setSavingEval(false);
    }
  };

  if (loading) {
    return <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const completedCount = submissions.filter(s => s.evaluation_status === 'Evaluation Completed').length;
  const pendingCount = submissions.length - completedCount;

  const filteredSubmissions = submissions.filter(s => {
    const matchesSearch = 
      (s.student_name && s.student_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.file_name && s.file_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.registration_number && s.registration_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.assignment_title && s.assignment_title.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSection = !filterSection || s.section_name === filterSection;
    const matchesStatus = !filterStatus || s.evaluation_status === filterStatus;

    return matchesSearch && matchesSection && matchesStatus;
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-8 border-b border-white/10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Evaluator Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Review assignment submissions, evaluate plagiarism similarity, and record academic evaluations.
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
          <div className="p-4 bg-primary/20 rounded-xl"><Users className="w-7 h-7 text-primary" /></div>
          <div>
            <p className="text-muted-foreground text-xs uppercase font-semibold">Assigned Sections</p>
            <h4 className="text-2xl font-bold text-white">{assignedSections.length}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
          <div className="p-4 bg-blue-500/20 rounded-xl"><FileText className="w-7 h-7 text-blue-400" /></div>
          <div>
            <p className="text-muted-foreground text-xs uppercase font-semibold">Submissions to Review</p>
            <h4 className="text-2xl font-bold text-white">{submissions.length}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
          <div className="p-4 bg-yellow-500/20 rounded-xl"><Clock className="w-7 h-7 text-yellow-400" /></div>
          <div>
            <p className="text-muted-foreground text-xs uppercase font-semibold">Pending Evaluation</p>
            <h4 className="text-2xl font-bold text-yellow-400">{pendingCount}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
          <div className="p-4 bg-emerald-500/20 rounded-xl"><CheckCircle className="w-7 h-7 text-emerald-400" /></div>
          <div>
            <p className="text-muted-foreground text-xs uppercase font-semibold">Completed</p>
            <h4 className="text-2xl font-bold text-emerald-400">{completedCount}</h4>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="p-6 rounded-2xl bg-card/40 border border-white/10 mb-8 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search student, reg no, or file..."
              className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <select
              className="px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none"
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
            >
              <option value="">All Assigned Sections</option>
              {assignedSections.map((sec: any) => (
                <option key={sec.id} value={sec.name}>{sec.name}</option>
              ))}
            </select>

            <select
              className="px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Review Statuses</option>
              <option value="Ready for Review">Ready for Review</option>
              <option value="Under Review">Under Review</option>
              <option value="Evaluation Completed">Evaluation Completed</option>
              <option value="Requires Further Review">Requires Further Review</option>
            </select>
          </div>
        </div>

        {/* Submissions Table */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-muted-foreground text-xs uppercase font-semibold">
                <th className="pb-3 pr-4">Student</th>
                <th className="pb-3 px-3">Reg No</th>
                <th className="pb-3 px-3">Assignment / File</th>
                <th className="pb-3 px-3">Section</th>
                <th className="pb-3 px-3">Similarity</th>
                <th className="pb-3 px-3">Evaluation Status</th>
                <th className="pb-3 px-3">Marks</th>
                <th className="pb-3 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.length > 0 ? (
                filteredSubmissions.map((sub: any) => (
                  <tr key={sub.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-white">{sub.student_name}</div>
                      <div className="text-xs text-muted-foreground">{sub.student_email}</div>
                    </td>
                    <td className="py-4 px-3 text-sm text-gray-300 font-mono">{sub.registration_number}</td>
                    <td className="py-4 px-3">
                      <div className="font-medium text-white truncate max-w-[180px]">{sub.assignment_title || sub.file_name}</div>
                      <div className="text-xs text-muted-foreground">{sub.upload_time}</div>
                    </td>
                    <td className="py-4 px-3">
                      <span className="px-2 py-1 rounded bg-white/5 text-xs text-gray-300 border border-white/10 font-medium">
                        {sub.section_name}
                      </span>
                    </td>
                    <td className="py-4 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                        sub.similarity_score >= 90
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : sub.similarity_score >= 60
                          ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {sub.similarity_score?.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-4 px-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        sub.evaluation_status === 'Evaluation Completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : sub.evaluation_status === 'Under Review'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : sub.evaluation_status === 'Requires Further Review'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                      }`}>
                        {sub.evaluation_status}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-sm">
                      {sub.marks !== null && sub.marks !== undefined ? (
                        <span className="font-bold text-emerald-400">{sub.marks} / {sub.max_marks || 100}</span>
                      ) : (
                        <span className="text-gray-500 text-xs font-medium">Ungraded</span>
                      )}
                    </td>
                    <td className="py-4 pl-3 text-right space-x-2">
                      <button
                        onClick={() => setCompareUploadId(sub.id)}
                        className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary text-xs rounded-lg font-medium transition-colors border border-primary/30 inline-flex items-center"
                        title="View Plagiarism Report & Heatmap"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> Compare
                      </button>
                      <button
                        onClick={() => openGradingModal(sub)}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg font-medium transition-colors border border-white/10 inline-flex items-center"
                        title="Record Academic Evaluation"
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Grade
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    No submissions found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grading / Evaluation Modal */}
      {gradingUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-lg p-6 rounded-2xl border border-white/10 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-xl font-bold text-white flex items-center">
                <Edit3 className="w-5 h-5 mr-2 text-emerald-400" /> Academic Evaluation
              </h3>
              <button 
                onClick={() => setGradingUpload(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs space-y-1">
              <div>Student: <span className="text-white font-medium">{gradingUpload.student_name}</span> ({gradingUpload.registration_number})</div>
              <div>Assignment: <span className="text-white font-medium">{gradingUpload.assignment_title || gradingUpload.file_name}</span></div>
              <div>Section: <span className="text-primary-300 font-medium">{gradingUpload.section_name}</span></div>
              <div>Plagiarism Similarity: <span className="text-yellow-400 font-bold">{gradingUpload.similarity_score?.toFixed(0)}%</span></div>
            </div>

            {evalSuccess && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm rounded-lg flex items-center">
                <CheckCircle className="w-4 h-4 mr-2" /> {evalSuccess}
              </div>
            )}

            <form onSubmit={handleSaveEvaluation} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Marks Awarded</label>
                  <input 
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    placeholder="e.g. 85.5"
                    className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white font-bold focus:border-primary outline-none"
                    value={marks}
                    onChange={(e) => setMarks(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Max Marks</label>
                  <input 
                    type="number"
                    disabled
                    className="w-full px-3 py-2 bg-black/20 border border-white/5 rounded-lg text-gray-400"
                    value={maxMarks}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Review Status</label>
                <select
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white focus:border-primary outline-none text-sm"
                  value={evalStatus}
                  onChange={(e) => setEvalStatus(e.target.value)}
                >
                  <option value="Ready for Review">Ready for Review</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Evaluation Completed">Evaluation Completed</option>
                  <option value="Requires Further Review">Requires Further Review</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Academic Decision</label>
                <select
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white focus:border-primary outline-none text-sm"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  <option value="Cleared">Cleared (Original Work)</option>
                  <option value="Needs Revision">Needs Revision / Minor Citation Issues</option>
                  <option value="Academic Overlap Flagged">Academic Overlap Flagged (High Similarity)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Evaluator Feedback / Comments</label>
                <textarea 
                  rows={4}
                  placeholder="Provide constructive feedback for the student..."
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white text-sm focus:border-primary outline-none resize-none"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setGradingUpload(null)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEval}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center shadow-lg shadow-emerald-600/30"
                >
                  {savingEval ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Save Evaluation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {compareUploadId && (
        <DuplicateCompareModal 
          uploadId={compareUploadId} 
          onClose={() => setCompareUploadId(null)} 
        />
      )}

      {/* Preview Modal */}
      {previewUpload && (
        <DocumentPreviewModal 
          upload={previewUpload} 
          onClose={() => setPreviewUpload(null)} 
        />
      )}
    </div>
  );
}
