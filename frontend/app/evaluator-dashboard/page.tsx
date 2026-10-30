"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2, Users, FileText, CheckCircle, Clock, AlertTriangle, Edit3, Eye, Search, Filter, Plus, BookOpen } from 'lucide-react';
import DuplicateCompareModal from '@/components/DuplicateCompareModal';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import { AssignmentsManagementView } from '@/components/AssignmentsManagementView';
import { CreateAssignmentModal } from '@/components/CreateAssignmentModal';

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

  // Coursework assignments state
  const [activeTab, setActiveTab] = useState<'submissions' | 'assignments'>('submissions');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshAssignmentsTrigger, setRefreshAssignmentsTrigger] = useState(0);
  const [token, setToken] = useState<string>('');

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
      setToken(token);
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
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
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
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-8 border-b border-border gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">Evaluator Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review assignment submissions, evaluate plagiarism similarity, manage coursework, and record academic evaluations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border">
            <button
              onClick={() => setActiveTab("submissions")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "submissions"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Submissions & Evaluation
            </button>
            <button
              onClick={() => setActiveTab("assignments")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "assignments"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Coursework Assignments
            </button>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-xl shadow-md transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Assignment</span>
          </button>
        </div>
      </div>

      {activeTab === 'assignments' ? (
        <AssignmentsManagementView
          userRole="evaluator"
          token={token}
          onCreateClick={() => setIsCreateModalOpen(true)}
          refreshTrigger={refreshAssignmentsTrigger}
        />
      ) : (
        <>
          {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-center space-x-4">
          <div className="p-4 bg-primary/10 rounded-xl text-primary"><Users className="w-7 h-7" /></div>
          <div>
            <p className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Assigned Sections</p>
            <h4 className="text-2xl font-black text-foreground mt-1">{assignedSections.length}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-center space-x-4">
          <div className="p-4 bg-blue-500/10 rounded-xl text-blue-500"><FileText className="w-7 h-7" /></div>
          <div>
            <p className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Submissions to Review</p>
            <h4 className="text-2xl font-black text-foreground mt-1">{submissions.length}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-center space-x-4">
          <div className="p-4 bg-yellow-500/10 rounded-xl text-yellow-500"><Clock className="w-7 h-7" /></div>
          <div>
            <p className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Pending Evaluation</p>
            <h4 className="text-2xl font-black text-yellow-600 dark:text-yellow-400 mt-1">{pendingCount}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-center space-x-4">
          <div className="p-4 bg-emerald-500/10 rounded-xl text-emerald-500"><CheckCircle className="w-7 h-7" /></div>
          <div>
            <p className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Completed</p>
            <h4 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{completedCount}</h4>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm mb-8 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search student, reg no, or file..."
              className="w-full pl-9 pr-4 py-2 bg-muted/40 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <select
              className="px-3 py-2 bg-muted/40 border border-border rounded-xl text-xs font-medium text-foreground focus:outline-none"
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
            >
              <option value="">All Assigned Sections</option>
              {assignedSections.map((sec: any) => (
                <option key={sec.id} value={sec.name}>{sec.name}</option>
              ))}
            </select>

            <select
              className="px-3 py-2 bg-muted/40 border border-border rounded-xl text-xs font-medium text-foreground focus:outline-none"
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
              <tr className="border-b border-border text-muted-foreground text-[11px] uppercase font-bold tracking-wider">
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
                  <tr key={sub.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="font-bold text-foreground text-sm">{sub.student_name}</div>
                      <div className="text-xs text-muted-foreground">{sub.student_email}</div>
                    </td>
                    <td className="py-4 px-3 text-xs text-foreground font-mono font-medium">{sub.registration_number}</td>
                    <td className="py-4 px-3">
                      <div className="font-semibold text-foreground text-xs truncate max-w-[180px]">{sub.assignment_title || sub.file_name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{sub.upload_time}</div>
                    </td>
                    <td className="py-4 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-muted text-xs text-foreground border border-border font-semibold">
                        {sub.section_name}
                      </span>
                    </td>
                    <td className="py-4 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                        sub.similarity_score >= 90
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                          : sub.similarity_score >= 60
                          ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      }`}>
                        {sub.similarity_score?.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-4 px-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        sub.evaluation_status === 'Evaluation Completed'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : sub.evaluation_status === 'Under Review'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                          : sub.evaluation_status === 'Requires Further Review'
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                          : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30'
                      }`}>
                        {sub.evaluation_status}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-sm">
                      {sub.marks !== null && sub.marks !== undefined ? (
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{sub.marks} / {sub.max_marks || 100}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs font-medium">Ungraded</span>
                      )}
                    </td>
                    <td className="py-4 pl-3 text-right space-x-2">
                      <button
                        onClick={() => setCompareUploadId(sub.id)}
                        className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs rounded-xl font-bold transition-colors border border-primary/20 inline-flex items-center shadow-sm"
                        title="View Plagiarism Report & 14 Metric Cards"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> Compare
                      </button>
                      <button
                        onClick={() => openGradingModal(sub)}
                        className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs rounded-xl font-semibold transition-colors border border-border inline-flex items-center shadow-sm"
                        title="Record Academic Evaluation"
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-1 text-emerald-500" /> Grade
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">
                    No submissions found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Create Assignment Modal */}
      <CreateAssignmentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setRefreshAssignmentsTrigger((prev) => prev + 1);
          fetchData();
        }}
        token={token}
      />
      {gradingUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="bg-card w-full max-w-lg p-6 rounded-2xl border border-border space-y-6 shadow-2xl text-foreground">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-lg font-bold text-foreground flex items-center">
                <Edit3 className="w-5 h-5 mr-2 text-emerald-500" /> Academic Evaluation
              </h3>
              <button 
                onClick={() => setGradingUpload(null)}
                className="text-muted-foreground hover:text-foreground text-sm p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-muted/30 rounded-xl border border-border text-xs space-y-1.5">
              <div>Student: <span className="text-foreground font-bold">{gradingUpload.student_name}</span> ({gradingUpload.registration_number})</div>
              <div>Assignment: <span className="text-foreground font-medium">{gradingUpload.assignment_title || gradingUpload.file_name}</span></div>
              <div>Section: <span className="text-primary font-bold">{gradingUpload.section_name}</span></div>
              <div>Plagiarism Similarity: <span className="text-amber-500 font-extrabold">{gradingUpload.similarity_score?.toFixed(0)}%</span></div>
            </div>

            {evalSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-xl flex items-center">
                <CheckCircle className="w-4 h-4 mr-2" /> {evalSuccess}
              </div>
            )}

            <form onSubmit={handleSaveEvaluation} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Marks Awarded</label>
                  <input 
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    placeholder="e.g. 85.5"
                    className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={marks}
                    onChange={(e) => setMarks(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Max Marks</label>
                  <input 
                    type="number"
                    disabled
                    className="w-full px-3 py-2 bg-muted/20 border border-border rounded-xl text-muted-foreground font-bold"
                    value={maxMarks}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Review Status</label>
                <select
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
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
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Academic Decision</label>
                <select
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  <option value="Cleared">Cleared (Original Work)</option>
                  <option value="Needs Revision">Needs Revision / Minor Citation Issues</option>
                  <option value="Academic Overlap Flagged">Academic Overlap Flagged (High Similarity)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Evaluator Feedback / Comments</label>
                <textarea 
                  rows={4}
                  placeholder="Provide constructive feedback for the student..."
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none transition-all"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setGradingUpload(null)}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl text-xs border border-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEval}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center shadow-md disabled:opacity-50"
                >
                  {savingEval ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
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
