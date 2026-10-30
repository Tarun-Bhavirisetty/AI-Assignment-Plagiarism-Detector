"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Award,
  Calendar,
  Percent,
} from "lucide-react";

interface AssignmentAnalyticsModalProps {
  isOpen: boolean;
  assignmentId: number | null;
  assignmentTitle: string;
  onClose: () => void;
  token: string;
}

interface AnalyticsData {
  assignment_id: number;
  title: string;
  department: string;
  status: string;
  total_eligible_students: number;
  total_submissions: number;
  pending_submissions: number;
  on_time_submissions: number;
  late_submissions: number;
  completion_rate: number;
  evaluated_count: number;
  average_marks: number | null;
  high_similarity_count: number;
}

export function AssignmentAnalyticsModal({
  isOpen,
  assignmentId,
  assignmentTitle,
  onClose,
  token,
}: AssignmentAnalyticsModalProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && assignmentId) {
      setIsLoading(true);
      setError(null);
      fetch(`http://localhost:8000/assignments/${assignmentId}/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load analytics");
          return res.json();
        })
        .then((analytics) => setData(analytics))
        .catch((err) => setError(err.message))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, assignmentId, token]);

  if (!isOpen || !assignmentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Coursework Analytics & Submission Breakdown
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                {assignmentTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-xs text-slate-500">Calculating real-time database metrics...</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
              {error}
            </div>
          )}

          {data && (
            <div className="space-y-6">
              {/* Primary Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Eligible Cohort</span>
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {data.total_eligible_students}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">Students in target sections</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Submissions</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {data.total_submissions}
                  </span>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {data.completion_rate}% completion
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Pending</span>
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {data.pending_submissions}
                  </span>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Awaiting upload</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Avg Evaluation</span>
                    <Award className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {data.average_marks !== null ? `${data.average_marks}` : "—"}
                  </span>
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {data.evaluated_count} evaluated
                  </p>
                </div>
              </div>

              {/* Progress & Breakdown */}
              <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Cohort Turn-in Progress</span>
                  <span>{data.completion_rate}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                  <div
                    style={{
                      width: `${data.total_eligible_students ? (data.on_time_submissions / data.total_eligible_students) * 100 : 0}%`,
                    }}
                    className="bg-emerald-500 h-full"
                    title={`On-time: ${data.on_time_submissions}`}
                  />
                  <div
                    style={{
                      width: `${data.total_eligible_students ? (data.late_submissions / data.total_eligible_students) * 100 : 0}%`,
                    }}
                    className="bg-amber-500 h-full"
                    title={`Late: ${data.late_submissions}`}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                      On-Time: {data.on_time_submissions}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                      Late: {data.late_submissions}
                    </span>
                  </div>
                  <span>Pending: {data.pending_submissions}</span>
                </div>
              </div>

              {/* Integrity Warning Section */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-900/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Academic Integrity Flagged Submissions
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Submissions exceeding 60% similarity threshold
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-rose-600 dark:text-rose-400 px-3 py-1 bg-white dark:bg-slate-900 rounded-lg border border-rose-200 dark:border-rose-900/40">
                  {data.high_similarity_count}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 rounded-xl transition shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
