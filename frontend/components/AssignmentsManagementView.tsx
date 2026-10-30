"use client";

import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  Plus,
  BarChart3,
  Search,
  Filter,
  FileText,
  Layers,
  ChevronRight,
  MoreVertical,
  Check,
} from "lucide-react";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { AssignmentAnalyticsModal } from "./AssignmentAnalyticsModal";

interface AssignmentRecord {
  id: number;
  title: string;
  subject?: string;
  category?: string;
  instructions?: string;
  department: string;
  start_date: string;
  due_date: string;
  allow_late_submissions: boolean;
  late_deadline?: string;
  max_marks: number;
  allowed_formats: string;
  max_file_size_mb: number;
  status: string;
  sections?: { id: number; name: string }[];
  eligible_students?: number;
  submissions_count?: number;
  pending_count?: number;
  late_count?: number;
  completion_rate?: number;
}

interface AssignmentsManagementViewProps {
  userRole: string;
  token: string;
  onCreateClick: () => void;
  refreshTrigger?: number;
}

export function AssignmentsManagementView({
  userRole,
  token,
  onCreateClick,
  refreshTrigger = 0,
}: AssignmentsManagementViewProps) {
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [analyticsAssignmentId, setAnalyticsAssignmentId] = useState<number | null>(null);
  const [analyticsAssignmentTitle, setAnalyticsAssignmentTitle] = useState("");

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const res = await fetch("http://localhost:8000/assignments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAssignments(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch assignments:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAssignments();
    }
  }, [token, refreshTrigger]);

  const handleStatusChange = async (assignmentId: number, newStatus: string) => {
    try {
      const res = await fetch(`http://localhost:8000/assignments/${assignmentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setAssignments((prev) =>
          prev.map((a) => (a.id === assignmentId ? { ...a, status: newStatus } : a))
        );
      }
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  };

  const filtered = assignments.filter((a) => {
    const matchesSearch =
      (a.title && a.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (a.subject && a.subject.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = filterStatus === "all" ? true : a.status.toLowerCase() === filterStatus.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Coursework & Assignment Manager</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure institutional assignments, manage section cohorts, and inspect turn-in analytics
          </p>
        </div>

        <button
          onClick={onCreateClick}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Create Assignment</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search assignments by title or course code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-background border border-border text-foreground focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="closed">Closed</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      {/* Assignments List */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs">Loading assignments...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
          <BookOpen className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
          <h3 className="text-sm font-semibold text-foreground">No Assignments Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchQuery
              ? "No assignments matched your search filter."
              : "No coursework assignments have been created yet. Click 'Create Assignment' to publish your first one."}
          </p>
          {!searchQuery && (
            <button
              onClick={onCreateClick}
              className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Assignment Now</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((assign) => (
            <div
              key={assign.id}
              className="p-5 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between space-y-4"
            >
              {/* Card Header */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {assign.subject && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                          {assign.subject}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                        {assign.category || "Coursework"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          assign.status === "Active"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : assign.status === "Scheduled"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                            : "bg-slate-500/10 text-slate-500 border border-slate-500/20"
                        }`}
                      >
                        {assign.status}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-foreground truncate" title={assign.title}>
                      {assign.title}
                    </h3>
                  </div>
                </div>

                {/* Scoped Sections */}
                {assign.sections && assign.sections.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Cohort:</span>
                    {assign.sections.map((sec) => (
                      <span
                        key={sec.id}
                        className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono font-medium text-foreground border border-border"
                      >
                        {sec.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Deadline & Urgency Display */}
              <div className="pt-2 border-t border-border/60">
                <DeadlineCountdown
                  dueDate={assign.due_date}
                  startDate={assign.start_date}
                  allowLateSubmissions={assign.allow_late_submissions}
                  lateDeadline={assign.late_deadline}
                />
              </div>

              {/* Cohort Progress / Stats */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-muted/30 border border-border/50 text-center text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">Turn-in</span>
                  <span className="font-bold text-foreground">
                    {assign.submissions_count ?? 0} / {assign.eligible_students ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">Pending</span>
                  <span className="font-bold text-amber-500">{assign.pending_count ?? 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">Late</span>
                  <span className="font-bold text-rose-500">{assign.late_count ?? 0}</span>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-border gap-2">
                <button
                  onClick={() => {
                    setAnalyticsAssignmentId(assign.id);
                    setAnalyticsAssignmentTitle(assign.title);
                  }}
                  className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-primary" />
                  <span>View Analytics</span>
                </button>

                <div className="flex items-center gap-2">
                  <select
                    value={assign.status}
                    onChange={(e) => handleStatusChange(assign.id, e.target.value)}
                    className="px-2 py-1 text-[11px] rounded-lg bg-background border border-border text-foreground focus:outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Closed">Closed</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Analytics Modal */}
      {analyticsAssignmentId && (
        <AssignmentAnalyticsModal
          isOpen={true}
          assignmentId={analyticsAssignmentId}
          assignmentTitle={analyticsAssignmentTitle}
          onClose={() => setAnalyticsAssignmentId(null)}
          token={token}
        />
      )}
    </div>
  );
}
