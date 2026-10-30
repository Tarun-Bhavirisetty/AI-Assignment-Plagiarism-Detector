"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  Loader2,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Search,
  Filter,
  BarChart3,
  BookOpen,
  MessageSquare,
  ShieldCheck,
  Send,
  Plus,
  Layers,
} from "lucide-react";
import DuplicateCompareModal from "@/components/DuplicateCompareModal";
import DocumentPreviewModal from "@/components/DocumentPreviewModal";
import { AssignmentsManagementView } from "@/components/AssignmentsManagementView";
import { CreateAssignmentModal } from "@/components/CreateAssignmentModal";

export default function FacultyDashboard() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [compareUploadId, setCompareUploadId] = useState<number | null>(null);
  const [previewUpload, setPreviewUpload] = useState<any>(null);

  // Faculty comments modal state
  const [feedbackUpload, setFeedbackUpload] = useState<any>(null);
  const [feedbackComments, setFeedbackComments] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  // Assignments manager state
  const [activeTab, setActiveTab] = useState<'submissions' | 'assignments'>('submissions');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshAssignmentsTrigger, setRefreshAssignmentsTrigger] = useState(0);
  const [token, setToken] = useState<string>("");

  const fetchData = async () => {
    try {
      const [subsRes, anaRes] = await Promise.all([
        api.get("/faculty/submissions"),
        api.get("/faculty/analytics"),
      ]);
      setSubmissions(subsRes.data);
      setAnalytics(anaRes.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        router.push("/login");
      } else if (err.response?.status === 403) {
        router.push("/user-dashboard");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token) {
      router.push("/login");
    } else if (role !== "faculty" && role !== "admin") {
      router.push("/user-dashboard");
    } else {
      setToken(token);
      fetchData();
    }
  }, [router]);

  const handleSaveFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackUpload) return;
    setSavingFeedback(true);
    setFeedbackSuccess(false);

    try {
      await api.post(`/evaluations/${feedbackUpload.id}`, {
        marks: feedbackUpload.marks, // preserve existing marks
        max_marks: 100.0,
        status: feedbackUpload.evaluation_status || "Evaluation Completed",
        decision: feedbackUpload.decision || "Cleared",
        comments: feedbackComments,
      });

      setFeedbackSuccess(true);
      fetchData();
      setTimeout(() => {
        setFeedbackSuccess(false);
        setFeedbackUpload(null);
      }, 1500);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to submit faculty feedback.");
    } finally {
      setSavingFeedback(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Filter sections options
  const uniqueSections = Array.from(
    new Set(submissions.map((s) => s.section_name).filter(Boolean))
  );

  // Filtered submissions
  const filteredSubmissions = submissions.filter((s) => {
    const matchesSearch =
      (s.student_name && s.student_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.file_name && s.file_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.assignment_title && s.assignment_title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.registration_number && s.registration_number.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSection = filterSection ? s.section_name === filterSection : true;

    let matchesStatus = true;
    if (filterStatus === "flagged") {
      matchesStatus = s.similarity_score >= 60.0;
    } else if (filterStatus === "clean") {
      matchesStatus = s.similarity_score < 30.0;
    } else if (filterStatus === "evaluated") {
      matchesStatus = s.evaluation_status === "Evaluation Completed";
    }

    return matchesSearch && matchesSection && matchesStatus;
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-8 bg-background text-foreground transition-colors duration-200">
      {/* Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20 mb-2">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Academic Faculty Portal · {analytics?.department || "Computer Science"}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Faculty Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitor assignment submissions, review deep similarity evidence, manage coursework, and provide feedback.
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
              Submissions & Evidence
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
          userRole="faculty"
          token={token}
          onCreateClick={() => setIsCreateModalOpen(true)}
          refreshTrigger={refreshAssignmentsTrigger}
        />
      ) : (
        <>
          {/* Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Department Submissions</p>
            <p className="text-3xl font-bold mt-1.5 text-foreground">{analytics?.total_submissions || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Across assigned sections</p>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">High Overlap Flagged</p>
            <p className="text-3xl font-bold mt-1.5 text-red-500">{analytics?.flagged_submissions || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">&ge; 60% similarity threshold</p>
          </div>
          <div className="p-3 rounded-xl bg-red-500/10 text-red-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verified Clean</p>
            <p className="text-3xl font-bold mt-1.5 text-emerald-500">{analytics?.clean_submissions || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">&lt; 30% low similarity</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completed Evaluations</p>
            <p className="text-3xl font-bold mt-1.5 text-blue-500">{analytics?.evaluated_count || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Evaluated by faculty/staff</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Submissions Section */}
      <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
        {/* Header & Filters */}
        <div className="p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/20">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <span>Student Submissions</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review submissions, open interactive plagiarism metric cards, and verify online sources.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student, file, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-52"
              />
            </div>

            {/* Section Filter */}
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Sections</option>
              {uniqueSections.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              <option value="flagged">Flagged High Similarity (&ge;60%)</option>
              <option value="clean">Clean Low Similarity (&lt;30%)</option>
              <option value="evaluated">Evaluation Completed</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase font-semibold tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Student / ID</th>
                <th className="px-5 py-3.5">Assignment & Section</th>
                <th className="px-5 py-3.5">Submitted</th>
                <th className="px-5 py-3.5">Similarity</th>
                <th className="px-5 py-3.5">Evaluation Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground font-medium">
              {filteredSubmissions.length > 0 ? (
                filteredSubmissions.map((sub) => {
                  const score = Number(sub.similarity_score || 0);
                  const isHigh = score >= 60;
                  const isMed = score >= 30 && score < 60;
                  return (
                    <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-sm">{sub.student_name}</div>
                        <div className="text-muted-foreground text-[11px]">{sub.registration_number || sub.student_email}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-foreground">{sub.assignment_title}</div>
                        <div className="inline-block mt-0.5 px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-semibold">
                          {sub.section_name}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                        {sub.upload_time}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              isHigh
                                ? "bg-red-500/10 text-red-500 border border-red-500/20"
                                : isMed
                                ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            }`}
                          >
                            {score.toFixed(0)}%
                          </span>
                          {sub.duplicate_type && (
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {sub.duplicate_type}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            sub.evaluation_status === "Evaluation Completed"
                              ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {sub.evaluation_status === "Evaluation Completed" ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span>{sub.evaluation_status}</span>
                        </span>
                        {sub.marks !== null && sub.marks !== undefined && (
                          <span className="ml-2 text-xs font-bold text-foreground">
                            {sub.marks}/100
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setPreviewUpload(sub)}
                            className="p-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            title="Preview Document"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setFeedbackUpload(sub);
                              setFeedbackComments(sub.comments || "");
                            }}
                            className="p-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            title="Provide Faculty Feedback"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setCompareUploadId(sub.id)}
                            className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span>Inspect Analysis</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    No submissions matching your filter criteria.
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

      {/* Interactive Metric Cards Comparison Modal */}
      {compareUploadId && (
        <DuplicateCompareModal
          uploadId={compareUploadId}
          onClose={() => setCompareUploadId(null)}
        />
      )}

      {/* Document Preview Modal */}
      {previewUpload && (
        <DocumentPreviewModal
          upload={previewUpload}
          onClose={() => setPreviewUpload(null)}
        />
      )}

      {/* Faculty Feedback Modal */}
      {feedbackUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span>Academic Feedback & Remarks</span>
              </h3>
              <button
                onClick={() => setFeedbackUpload(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                Student: <span className="font-semibold text-foreground">{feedbackUpload.student_name}</span> ({feedbackUpload.registration_number})
              </p>
              <p>
                Assignment: <span className="font-semibold text-foreground">{feedbackUpload.assignment_title}</span> · Section: {feedbackUpload.section_name}
              </p>
              {feedbackUpload.marks !== null && (
                <p>
                  Evaluator Marks: <span className="font-semibold text-blue-500">{feedbackUpload.marks}/100</span> (Faculty cannot override evaluator marks)
                </p>
              )}
            </div>

            {feedbackSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span>Feedback submitted successfully!</span>
              </div>
            )}

            <form onSubmit={handleSaveFeedback} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Faculty Recommendations & Notes
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Enter academic feedback, integrity notes, or advice for the student..."
                  value={feedbackComments}
                  onChange={(e) => setFeedbackComments(e.target.value)}
                  className="w-full p-3 text-xs rounded-xl border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFeedbackUpload(null)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFeedback}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 flex items-center gap-1.5 shadow-sm"
                >
                  {savingFeedback ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Save Feedback</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
