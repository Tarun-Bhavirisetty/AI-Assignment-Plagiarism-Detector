"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2, Users, FileText, CheckCircle, Clock, AlertTriangle, Layers, UserCheck, Trash2, Plus, BarChart3, Eye } from 'lucide-react';
import DuplicateCompareModal from '@/components/DuplicateCompareModal';

export default function HodDashboard() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [evaluators, setEvaluators] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment form state
  const [selectedEvaluator, setSelectedEvaluator] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Section creation state
  const [newSectionName, setNewSectionName] = useState('');
  const [creatingSection, setCreatingSection] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'evaluators' | 'assignments' | 'submissions'>('overview');
  const [compareUploadId, setCompareUploadId] = useState<number | null>(null);

  const fetchAllData = async () => {
    try {
      const [analyticsRes, subsRes, evalRes, secRes, assignRes] = await Promise.all([
        api.get('/hod/analytics'),
        api.get('/hod/submissions'),
        api.get('/evaluators'),
        api.get('/sections'),
        api.get('/evaluator-sections')
      ]);
      setAnalytics(analyticsRes.data);
      setSubmissions(subsRes.data);
      setEvaluators(evalRes.data);
      setSections(secRes.data);
      setAssignments(assignRes.data);
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
    } else if (role !== 'hod' && role !== 'admin') {
      router.push('/user-dashboard');
    } else {
      fetchAllData();
    }
  }, [router]);

  const handleAssignEvaluator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvaluator || !selectedSection) return;
    setAssigning(true);
    setMessage({ text: '', type: '' });

    try {
      await api.post('/evaluator-sections', {
        evaluator_id: parseInt(selectedEvaluator),
        section_id: parseInt(selectedSection)
      });
      setMessage({ text: 'Evaluator assigned to section successfully!', type: 'success' });
      setSelectedEvaluator('');
      setSelectedSection('');
      fetchAllData();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.detail || 'Failed to assign evaluator.', type: 'error' });
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAssignment = async (evaluatorId: number, sectionId: number) => {
    if (!confirm("Are you sure you want to remove this section assignment?")) return;
    try {
      await api.delete(`/evaluator-sections/${evaluatorId}/${sectionId}`);
      fetchAllData();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to remove assignment.");
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim()) return;
    setCreatingSection(true);
    try {
      await api.post('/sections', {
        name: newSectionName.trim(),
        department: analytics?.department || "Computer Science"
      });
      setNewSectionName('');
      fetchAllData();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to create section.");
    } finally {
      setCreatingSection(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-8 border-b border-border gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">HOD Department Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Department of <span className="text-primary font-bold">{analytics?.department}</span> — Academic Oversight & Evaluator Workload
          </p>
        </div>
      </div>

      {/* Top Department Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <p className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Total Students</p>
          <h4 className="text-3xl font-black text-foreground mt-1">{analytics?.total_students || 0}</h4>
          <span className="text-xs text-primary font-semibold mt-1 block">Registered in Department</span>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <p className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Submissions</p>
          <h4 className="text-3xl font-black text-foreground mt-1">{analytics?.total_submissions || 0}</h4>
          <span className="text-xs text-muted-foreground mt-1 block">{analytics?.total_sections || 0} Sections</span>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <p className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Evaluations Completed</p>
          <h4 className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{analytics?.completed_evaluations || 0}</h4>
          <span className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold mt-1 block">{analytics?.pending_evaluations || 0} Pending Review</span>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
          <p className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider">Average Similarity</p>
          <h4 className="text-3xl font-black text-amber-500 mt-1">{analytics?.average_similarity || 0}%</h4>
          <span className="text-xs text-red-500 font-semibold mt-1 block">{analytics?.high_similarity_count || 0} Flagged (&ge;90%)</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6 space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 font-bold text-xs uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Section Performance
        </button>
        <button
          onClick={() => setActiveTab('evaluators')}
          className={`pb-3 font-bold text-xs uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'evaluators' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Evaluator Workload ({analytics?.evaluator_workload?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={`pb-3 font-bold text-xs uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'assignments' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Assign Evaluators to Sections
        </button>
        <button
          onClick={() => setActiveTab('submissions')}
          className={`pb-3 font-bold text-xs uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'submissions' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Department Submissions ({submissions.length})
        </button>
      </div>

      {/* Tab 1: Section Performance */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground flex items-center">
                <Layers className="w-5 h-5 mr-2 text-primary" /> Section-wise Evaluation Progress & Similarity
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-[11px] uppercase font-bold tracking-wider">
                    <th className="pb-3 pr-4">Section Name</th>
                    <th className="pb-3 px-3">Total Submissions</th>
                    <th className="pb-3 px-3">Evaluations Completed</th>
                    <th className="pb-3 px-3">Pending Review</th>
                    <th className="pb-3 px-3">Completion Rate</th>
                    <th className="pb-3 pl-3 text-right">Avg Similarity</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics?.section_stats?.length > 0 ? (
                    analytics.section_stats.map((sec: any) => {
                      const rate = sec.total_submissions > 0 
                        ? Math.round((sec.completed_evaluations / sec.total_submissions) * 100) 
                        : 0;
                      return (
                        <tr key={sec.section_id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-4 pr-4 font-bold text-foreground text-sm">{sec.section_name}</td>
                          <td className="py-4 px-3 text-xs text-foreground font-medium">{sec.total_submissions}</td>
                          <td className="py-4 px-3 text-xs text-emerald-600 dark:text-emerald-400 font-bold">{sec.completed_evaluations}</td>
                          <td className="py-4 px-3 text-xs text-yellow-600 dark:text-yellow-400 font-bold">{sec.pending_evaluations}</td>
                          <td className="py-4 px-3 text-sm">
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${rate}%` }}></div>
                              </div>
                              <span className="text-xs text-muted-foreground font-semibold">{rate}%</span>
                            </div>
                          </td>
                          <td className="py-4 pl-3 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                              sec.average_similarity >= 80 ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            }`}>
                              {sec.average_similarity}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                        No section statistics available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Evaluator Workload */}
      {activeTab === 'evaluators' && (
        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-4 flex items-center">
            <UserCheck className="w-5 h-5 mr-2 text-primary" /> Evaluator Progress & Pending Workload
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-[11px] uppercase font-bold tracking-wider">
                  <th className="pb-3 pr-4">Evaluator</th>
                  <th className="pb-3 px-3">Assigned Sections</th>
                  <th className="pb-3 px-3">Total Submissions</th>
                  <th className="pb-3 px-3">Completed Evaluations</th>
                  <th className="pb-3 px-3">Pending Workload</th>
                  <th className="pb-3 pl-3 text-right">Progress</th>
                </tr>
              </thead>
              <tbody>
                {analytics?.evaluator_workload?.length > 0 ? (
                  analytics.evaluator_workload.map((ev: any) => {
                    const rate = ev.total_submissions > 0 ? Math.round((ev.completed / ev.total_submissions) * 100) : 0;
                    return (
                      <tr key={ev.evaluator_id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="py-4 pr-4">
                          <div className="font-bold text-foreground text-sm">{ev.evaluator_name}</div>
                          <div className="text-xs text-muted-foreground">{ev.evaluator_email}</div>
                        </td>
                        <td className="py-4 px-3 text-xs">
                          {ev.assigned_sections?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {ev.assigned_sections.map((secName: string) => (
                                <span key={secName} className="px-2 py-0.5 rounded-full bg-muted text-[11px] text-foreground font-semibold border border-border">
                                  {secName}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No sections assigned</span>
                          )}
                        </td>
                        <td className="py-4 px-3 text-xs text-foreground font-medium">{ev.total_submissions}</td>
                        <td className="py-4 px-3 text-xs text-emerald-600 dark:text-emerald-400 font-bold">{ev.completed}</td>
                        <td className="py-4 px-3 text-xs text-yellow-600 dark:text-yellow-400 font-bold">{ev.pending}</td>
                        <td className="py-4 pl-3 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                            rate === 100 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                          }`}>
                            {rate}% Complete
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                      No evaluators found in this department. Assign the Evaluator role to faculty users.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Assign Evaluators to Sections */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          {message.text && (
            <div className={`p-4 rounded-xl text-xs font-semibold border ${
              message.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
            }`}>
              {message.text}
            </div>
          )}

          {/* Form */}
          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4 flex items-center">
              <Plus className="w-5 h-5 mr-2 text-primary" /> Assign Evaluator to Section
            </h3>
            <form onSubmit={handleAssignEvaluator} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Select Evaluator</label>
                <select
                  required
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={selectedEvaluator}
                  onChange={(e) => setSelectedEvaluator(e.target.value)}
                >
                  <option value="">-- Choose Evaluator --</option>
                  {evaluators.map((ev: any) => (
                    <option key={ev.id} value={ev.id}>{ev.name} ({ev.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Select Section</label>
                <select
                  required
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                >
                  <option value="">-- Choose Section --</option>
                  {sections.map((sec: any) => (
                    <option key={sec.id} value={sec.id}>{sec.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={assigning}
                className="w-full py-2 px-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Confirm Assignment
              </button>
            </form>
          </div>

          {/* Current Assignments Table */}
          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Current Evaluator-Section Mappings</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-[11px] uppercase font-bold tracking-wider">
                    <th className="pb-3 pr-4">Evaluator Name</th>
                    <th className="pb-3 px-3">Evaluator Email</th>
                    <th className="pb-3 px-3">Section Assigned</th>
                    <th className="pb-3 px-3">Assigned Date</th>
                    <th className="pb-3 pl-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.length > 0 ? (
                    assignments.map((as: any) => (
                      <tr key={as.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="py-4 pr-4 font-bold text-foreground text-sm">{as.evaluator_name}</td>
                        <td className="py-4 px-3 text-xs text-muted-foreground">{as.evaluator_email}</td>
                        <td className="py-4 px-3 text-xs font-bold text-primary">{as.section_name}</td>
                        <td className="py-4 px-3 text-xs text-muted-foreground">{as.assigned_at}</td>
                        <td className="py-4 pl-3 text-right">
                          <button
                            onClick={() => handleRemoveAssignment(as.evaluator_id, as.section_id)}
                            className="p-1.5 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors inline-flex items-center text-xs font-semibold"
                            title="Remove assignment"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                        No active evaluator-to-section assignments.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Submissions */}
      {activeTab === 'submissions' && (
        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-4 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-primary" /> Department Submissions & Comparison Reports
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-[11px] uppercase font-bold tracking-wider">
                  <th className="pb-3 pr-4">Student</th>
                  <th className="pb-3 px-3">Reg No</th>
                  <th className="pb-3 px-3">Assignment Title</th>
                  <th className="pb-3 px-3">Section</th>
                  <th className="pb-3 px-3">Similarity</th>
                  <th className="pb-3 px-3">Review Status</th>
                  <th className="pb-3 px-3">Marks</th>
                  <th className="pb-3 pl-3 text-right">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {submissions.length > 0 ? (
                  submissions.map((sub: any) => (
                    <tr key={sub.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-4 pr-4">
                        <div className="font-bold text-foreground text-sm">{sub.student_name}</div>
                        <div className="text-xs text-muted-foreground">{sub.student_email}</div>
                      </td>
                      <td className="py-4 px-3 text-xs font-mono font-medium text-foreground">{sub.registration_number}</td>
                      <td className="py-4 px-3 text-xs text-foreground font-semibold truncate max-w-[200px]">
                        {sub.assignment_title || sub.file_name}
                      </td>
                      <td className="py-4 px-3 text-xs font-bold text-primary">{sub.section_name}</td>
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-muted text-foreground border-border">
                          {sub.evaluation_status}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-sm">
                        {sub.marks !== null && sub.marks !== undefined ? (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{sub.marks}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-4 pl-3 text-right">
                        <button
                          onClick={() => setCompareUploadId(sub.id)}
                          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs rounded-xl font-bold transition-colors border border-primary/20 inline-flex items-center shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" /> View Report
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">
                      No submissions in this department yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
    </div>
  );
}
