"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  Loader2,
  File,
  Clock,
  Award,
  CheckCircle,
  MessageSquare,
  User,
  BookOpen,
  UploadCloud,
  Calendar,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";
import { SubmitAssignmentModal, AssignmentItem } from "@/components/SubmitAssignmentModal";

export default function UserDashboard() {
  const router = useRouter();
  const [uploads, setUploads] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [activeAssignmentToSubmit, setActiveAssignmentToSubmit] = useState<AssignmentItem | null>(null);
  const [token, setToken] = useState<string>("");

  const fetchUserData = async () => {
    try {
      const [uploadsRes, profileRes, assignRes] = await Promise.all([
        api.get("/uploads"),
        api.get("/profile"),
        api.get("/assignments").catch(() => ({ data: [] })),
      ]);
      setUploads(uploadsRes.data || []);
      setUserProfile(profileRes.data || null);
      setAssignments(Array.isArray(assignRes.data) ? assignRes.data : []);
    } catch (err: any) {
      if (err.response?.status === 401) {
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!storedToken) {
      router.push("/login");
    } else if (role === "admin") {
      router.push("/dashboard");
    } else if (role === "hod") {
      router.push("/hod-dashboard");
    } else if (role === "evaluator") {
      router.push("/evaluator-dashboard");
    } else if (role === "faculty") {
      router.push("/faculty-dashboard");
    } else {
      setToken(storedToken);
      fetchUserData();
    }
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const evaluatedCount = uploads.filter(
    (u) => u.evaluation_status === "Evaluation Completed" && u.marks !== null && u.marks !== undefined
  ).length;
  const pendingCount = uploads.length - evaluatedCount;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Welcome & Profile Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-2">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Student Portal · Section {userProfile?.section_name || "CSE-A"}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">Coursework & Results Portal</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Welcome back, <span className="text-foreground font-semibold">{userProfile?.name || "Student"}</span>. Track your scheduled assignments, original submissions, and evaluation marks.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href="/upload"
            className="px-4 py-2 bg-primary text-primary-foreground text-xs sm:text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-md flex items-center gap-2"
          >
            <UploadCloud className="w-4 h-4" />
            <span>General Document Upload</span>
          </Link>
        </div>
      </div>

      {/* Profile Info Bar */}
      {userProfile && (
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider block">Student Name</span>
            <span className="font-bold text-foreground mt-0.5 block">{userProfile.name}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider block">Registration No.</span>
            <span className="font-bold text-primary mt-0.5 block font-mono">{userProfile.registration_number || "N/A"}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider block">Department</span>
            <span className="font-bold text-foreground mt-0.5 block">{userProfile.department || "Computer Science"}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider block">Cohort Section</span>
            <span className="font-bold text-foreground mt-0.5 block font-mono">
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs">
                {userProfile.section_name || "CSE-A"}
              </span>
            </span>
          </div>
          <div>
            <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider block">Account Status</span>
            <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Verified Student
            </span>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-center space-x-4">
          <div className="p-4 bg-primary/10 rounded-xl text-primary"><File className="w-7 h-7" /></div>
          <div>
            <p className="text-muted-foreground text-xs uppercase font-semibold">Total Submissions</p>
            <h4 className="text-3xl font-black text-foreground mt-1">{uploads.length}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-center space-x-4">
          <div className="p-4 bg-emerald-500/10 rounded-xl text-emerald-500"><Award className="w-7 h-7" /></div>
          <div>
            <p className="text-muted-foreground text-xs uppercase font-semibold">Evaluated</p>
            <h4 className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{evaluatedCount}</h4>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-center space-x-4">
          <div className="p-4 bg-yellow-500/10 rounded-xl text-yellow-500"><Clock className="w-7 h-7" /></div>
          <div>
            <p className="text-muted-foreground text-xs uppercase font-semibold">Pending Review</p>
            <h4 className="text-3xl font-black text-yellow-600 dark:text-yellow-400 mt-1">{pendingCount}</h4>
          </div>
        </div>
      </div>

      {/* Coursework & Assignments for Your Section */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Assigned Coursework for Your Section</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Coursework officially assigned to your cohort (<span className="font-semibold text-primary">{userProfile?.section_name || "CSE-A"}</span>). Review instructions and submit before the deadline.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-muted text-foreground border border-border self-start sm:self-auto">
            {assignments.length} Coursework Item{assignments.length !== 1 ? "s" : ""}
          </span>
        </div>

        {assignments.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground/60 mb-2">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-foreground">No Assignments Assigned Yet</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Your Faculty or Evaluator has not assigned any coursework to your section yet. New assignments will appear here once they are published.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignments.map((assign) => {
              // Match student's upload to this assignment
              const matchingUpload = uploads.find(
                (u) =>
                  (u.assignment_id && u.assignment_id === assign.id) ||
                  (u.assignment_title &&
                    assign.title &&
                    u.assignment_title.toLowerCase().trim() === assign.title.toLowerCase().trim())
              ) || (assign as any).my_submission;

              const isSubmitted = !!matchingUpload || !!assign.is_submitted;
              const isEvaluated = isSubmitted && (matchingUpload?.evaluation_status === "Evaluation Completed" || assign.submission_status === "Evaluated");
              const isRevisionRequested =
                assign.submission_status === "Resubmission Requested" ||
                matchingUpload?.evaluation_status === "Resubmission Requested" ||
                (assign as any).evaluation_decision === "Needs Revision";

              const nowMs = Date.now();
              const dueMs = assign.due_date ? new Date(assign.due_date).getTime() : 0;
              const startMs = assign.start_date ? new Date(assign.start_date).getTime() : 0;
              const isFuture = startMs > 0 && nowMs < startMs;
              const isPastDue = dueMs > 0 && nowMs > dueMs;
              const isDeadlineClosed = (!isSubmitted || isRevisionRequested) && isPastDue && !assign.allow_late_submissions;
              const isLateAllowed = (!isSubmitted || isRevisionRequested) && isPastDue && assign.allow_late_submissions;

              return (
                <div
                  key={assign.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                    isSubmitted && !isRevisionRequested
                      ? "bg-muted/15 border-border"
                      : isRevisionRequested
                      ? "bg-amber-500/5 border-amber-500/30 shadow-sm"
                      : "bg-card border-border hover:border-primary/40 shadow-sm"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {assign.subject && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                              {assign.subject}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                            {assign.category || "Assignment"}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-foreground truncate" title={assign.title}>
                          {assign.title}
                        </h3>
                      </div>

                      {/* Status Pill */}
                      {isRevisionRequested ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 inline-flex items-center gap-1 shrink-0">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Resubmission Requested</span>
                        </span>
                      ) : isSubmitted ? (
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 border shrink-0 ${
                            matchingUpload?.is_late || assign.is_late
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{matchingUpload?.is_late || assign.is_late ? "Submitted Late" : "Submitted"}</span>
                        </span>
                      ) : isDeadlineClosed ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 inline-flex items-center gap-1 shrink-0">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Deadline Closed</span>
                        </span>
                      ) : isLateAllowed ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1 shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Late Allowed</span>
                        </span>
                      ) : isFuture ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                          Scheduled
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                          Pending Submission
                        </span>
                      )}
                    </div>

                    {assign.instructions && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {assign.instructions}
                      </p>
                    )}

                    {/* Resubmission feedback banner */}
                    {isRevisionRequested && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Revision Requested by Evaluator</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {(assign as any).evaluation_feedback || matchingUpload?.comments || matchingUpload?.evaluation_comments || "Please review the feedback comments and submit an updated version."}
                        </p>
                      </div>
                    )}

                    {/* Late notice banner */}
                    {!isSubmitted && isLateAllowed && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                        <span>Deadline has passed. Late submission is permitted with possible grading penalty.</span>
                      </div>
                    )}
                  </div>

                  {/* Deadline Countdown Component */}
                  <div className="pt-2 border-t border-border/60">
                    <DeadlineCountdown
                      dueDate={assign.due_date}
                      startDate={assign.start_date}
                      allowLateSubmissions={assign.allow_late_submissions}
                      lateDeadline={assign.late_deadline}
                      isSubmitted={isSubmitted && !isRevisionRequested}
                      isLate={matchingUpload?.is_late || assign.is_late}
                    />
                  </div>

                  {/* Card Footer: Turn in button or Marks view */}
                  <div className="flex items-center justify-between pt-2 border-t border-border text-xs gap-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                      <span>Max: {assign.max_marks} marks</span>
                      <span>•</span>
                      <span>{assign.allowed_formats}</span>
                    </div>

                    {isRevisionRequested ? (
                      isDeadlineClosed ? (
                        <span className="text-xs text-destructive italic font-medium">Deadline closed. Revisions no longer accepted.</span>
                      ) : (
                        <button
                          onClick={() => setActiveAssignmentToSubmit(assign)}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-xs shadow transition flex items-center gap-1.5"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>Submit Revision (v{(matchingUpload?.version || 1) + 1})</span>
                        </button>
                      )
                    ) : isSubmitted ? (
                      <div className="flex items-center gap-2">
                        {isEvaluated ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                              {matchingUpload?.marks ?? (assign as any).marks_awarded} / {matchingUpload?.max_marks || assign.max_marks}
                            </span>
                            {(matchingUpload?.evaluation_comments || (assign as any).evaluation_feedback) && (
                              <button
                                onClick={() => setSelectedFeedback(matchingUpload || {
                                  marks: (assign as any).marks_awarded,
                                  max_marks: assign.max_marks,
                                  evaluation_comments: (assign as any).evaluation_feedback,
                                  decision: (assign as any).evaluation_decision,
                                  evaluated_at: "Recent",
                                  file_name: assign.title
                                })}
                                className="px-2 py-1 text-[11px] rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition font-semibold"
                              >
                                Feedback
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">Awaiting Evaluation</span>
                        )}
                      </div>
                    ) : isDeadlineClosed ? (
                      <span className="text-xs text-muted-foreground italic font-medium">Submissions are no longer accepted.</span>
                    ) : isFuture ? (
                      <span className="text-xs text-muted-foreground italic font-medium">Assignment Opens Soon</span>
                    ) : isLateAllowed ? (
                      <button
                        onClick={() => setActiveAssignmentToSubmit(assign)}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-xs shadow transition flex items-center gap-1.5"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Submit Late Assignment</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setActiveAssignmentToSubmit(assign)}
                        className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs shadow transition flex items-center gap-1.5"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Submit Assignment</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submissions Table */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
        <h3 className="text-lg font-bold mb-6 flex items-center text-foreground">
          <Clock className="w-5 h-5 mr-2 text-primary" /> Submission History & Academic Results
        </h3>
        {uploads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-[11px] uppercase font-bold tracking-wider">
                  <th className="pb-3 pr-4">Assignment Title</th>
                  <th className="pb-3 px-3">Submitted At</th>
                  <th className="pb-3 px-3">Originality Score</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3">Marks</th>
                  <th className="pb-3 pl-3 text-right">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((file: any) => (
                  <tr key={file.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-foreground text-sm">{file.assignment_title || file.file_name}</div>
                      <div className="text-xs text-muted-foreground">{file.file_name}</div>
                    </td>
                    <td className="py-4 px-3 text-xs text-muted-foreground">
                      <div>{file.upload_time}</div>
                      {file.is_late && (
                        <span className="text-[10px] text-amber-500 font-semibold">Late Submission</span>
                      )}
                    </td>
                    <td className="py-4 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                          file.similarity_score >= 60
                            ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                            : file.similarity_score >= 30
                            ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        {file.similarity_score ? `${file.similarity_score.toFixed(0)}% Match` : "0% Match"}
                      </span>
                    </td>
                    <td className="py-4 px-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          file.evaluation_status === "Evaluation Completed"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            : file.evaluation_status === "Under Review"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            : file.evaluation_status === "Requires Further Review"
                            ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                            : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                        }`}
                      >
                        {file.evaluation_status && file.evaluation_status !== "Submitted"
                          ? file.evaluation_status
                          : "Pending Review"}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-sm">
                      {file.evaluation_status === "Evaluation Completed" &&
                      file.marks !== null &&
                      file.marks !== undefined ? (
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                          {file.marks} / {file.max_marks || 100}
                        </span>
                      ) : file.evaluation_status === "Under Review" ? (
                        <span className="text-blue-500 text-xs italic font-medium">Under review</span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">Not yet evaluated</span>
                      )}
                    </td>
                    <td className="py-4 pl-3 text-right">
                      {(file.evaluation_status === "Evaluation Completed" ||
                        file.evaluation_status === "Requires Further Review") &&
                      (file.comments || file.decision) ? (
                        <button
                          onClick={() => setSelectedFeedback(file)}
                          className="px-3 py-1 bg-muted hover:bg-muted/80 text-xs rounded-lg text-foreground transition-colors inline-flex items-center gap-1.5"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-primary" />
                          <span>View Feedback</span>
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">Not available</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 space-y-4 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <p>No assignments submitted yet.</p>
            <Link
              href="/upload"
              className="inline-block px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow"
            >
              Upload Your First Assignment
            </Link>
          </div>
        )}
      </div>

      {/* Feedback Modal */}
      {selectedFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card w-full max-w-lg p-6 rounded-2xl border border-border space-y-4 text-foreground shadow-2xl">
            <h3 className="text-lg font-bold flex items-center">
              <MessageSquare className="w-5 h-5 mr-2 text-primary" /> Evaluator Feedback
            </h3>
            <p className="text-xs text-muted-foreground">
              Assignment:{" "}
              <span className="text-foreground font-medium">
                {selectedFeedback.assignment_title || selectedFeedback.file_name}
              </span>
            </p>
            {selectedFeedback.decision && (
              <div className="p-3 bg-muted/40 rounded-xl border border-border">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block mb-0.5">
                  Integrity Decision
                </span>
                <span className="text-sm font-bold text-primary">{selectedFeedback.decision}</span>
              </div>
            )}
            <div className="p-4 bg-muted/20 rounded-xl border border-border">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
                Evaluator Remarks
              </span>
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {selectedFeedback.comments || "No written comments provided."}
              </p>
            </div>
            {selectedFeedback.marks !== null && (
              <div className="flex justify-between items-center text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground font-medium">Marks Awarded:</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-lg">
                  {selectedFeedback.marks} / {selectedFeedback.max_marks || 100}
                </span>
              </div>
            )}
            <div className="pt-4 border-t border-border flex justify-end">
              <button
                onClick={() => setSelectedFeedback(null)}
                className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl text-xs border border-border transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Assignment Modal */}
      {activeAssignmentToSubmit && (
        <SubmitAssignmentModal
          isOpen={true}
          assignment={activeAssignmentToSubmit}
          studentSection={userProfile?.section_name || "CSE-A"}
          onClose={() => setActiveAssignmentToSubmit(null)}
          onSuccess={() => {
            fetchUserData();
          }}
          token={token}
        />
      )}
    </div>
  );
}
