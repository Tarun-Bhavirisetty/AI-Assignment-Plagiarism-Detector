"use client";

import React, { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Calendar,
  Award,
} from "lucide-react";
import { DeadlineCountdown } from "./DeadlineCountdown";

export interface AssignmentItem {
  id: number;
  title: string;
  subject?: string;
  description?: string;
  instructions?: string;
  category?: string;
  department?: string;
  start_date: string;
  due_date: string;
  allow_late_submissions: boolean;
  late_deadline?: string;
  max_marks: number;
  allowed_formats: string;
  max_file_size_mb: number;
  status: string;
  is_submitted?: boolean;
  submission_status?: string;
  submitted_at?: string;
  is_late?: boolean;
  marks_awarded?: number;
  evaluation_feedback?: string;
}

interface SubmitAssignmentModalProps {
  isOpen: boolean;
  assignment: AssignmentItem | null;
  studentSection: string;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
}

export function SubmitAssignmentModal({
  isOpen,
  assignment,
  studentSection,
  onClose,
  onSuccess,
  token,
}: SubmitAssignmentModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !assignment) return null;

  const now = new Date().getTime();
  const dueTime = new Date(assignment.due_date).getTime();
  const isPastDue = now > dueTime;
  const isClosed = isPastDue && !assignment.allow_late_submissions;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];

      // Validate size
      const maxBytes = (assignment.max_file_size_mb || 50) * 1024 * 1024;
      if (selected.size > maxBytes) {
        setError(`File size exceeds maximum limit of ${assignment.max_file_size_mb} MB.`);
        return;
      }

      // Validate extension
      const allowedExts = (assignment.allowed_formats || ".pdf,.docx,.txt")
        .split(",")
        .map((ext) => ext.trim().toLowerCase());
      const ext = "." + selected.name.split(".").pop()?.toLowerCase();
      if (!allowedExts.includes(ext)) {
        setError(`File type not allowed. Allowed formats: ${assignment.allowed_formats}`);
        return;
      }

      setFile(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a document file to submit.");
      return;
    }
    if (isClosed) {
      setError("Submissions are closed for this assignment.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress("Uploading assignment document & running AI similarity checks...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("assignment_id", String(assignment.id));
    formData.append("assignment_title", assignment.title);
    if (studentSection) {
      formData.append("section_name", studentSection);
    }

    try {
      const res = await fetch("http://localhost:8000/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Submission failed");
      }

      const resData = await res.json();
      setSuccessMsg(
        resData.is_late
          ? "Assignment submitted successfully (marked Late as per course schedule)."
          : "Assignment submitted successfully! AI similarity analysis completed."
      );

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to submit assignment");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {assignment.subject || assignment.category || "Coursework"}
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate max-w-sm">
                {assignment.title}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Target Section: <span className="font-semibold text-slate-700 dark:text-slate-300">{studentSection}</span> • Max Marks: {assignment.max_marks}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Deadline Countdown Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="text-xs space-y-1">
              <span className="font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                Due: {new Date(assignment.due_date).toLocaleString()}
              </span>
              {assignment.allow_late_submissions && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 block">
                  Late submissions are permitted
                </span>
              )}
            </div>
            <DeadlineCountdown
              dueDate={assignment.due_date}
              startDate={assignment.start_date}
              allowLateSubmissions={assignment.allow_late_submissions}
              lateDeadline={assignment.late_deadline}
              isSubmitted={assignment.is_submitted}
              isLate={assignment.is_late}
            />
          </div>

          {/* Instructions Box */}
          {assignment.instructions && (
            <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/30 text-xs space-y-1">
              <span className="font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Instructions:
              </span>
              <p className="text-indigo-800/90 dark:text-indigo-300/80 leading-relaxed">
                {assignment.instructions}
              </p>
            </div>
          )}

          {/* Alerts */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Upload Dropzone */}
          {!isClosed ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                file
                  ? "border-emerald-500 bg-emerald-500/5"
                  : "border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-800/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={assignment.allowed_formats}
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center gap-2">
                {file ? (
                  <>
                    <FileText className="w-10 h-10 text-emerald-500 animate-in zoom-in-75 duration-200" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {file.name}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • Click to replace
                    </span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-10 h-10 text-indigo-500" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Click or drag document to upload
                      </p>
                      <p className="text-xs text-slate-500">
                        Supported: {assignment.allowed_formats} (Max {assignment.max_file_size_mb} MB)
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-center text-slate-500 text-xs">
              The submission deadline has closed. Contact your instructor for special consideration.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
          >
            Cancel
          </button>
          {!isClosed && (
            <button
              onClick={handleSubmit}
              disabled={!file || isUploading}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{uploadProgress || "Submitting..."}</span>
                </>
              ) : (
                <span>Submit Assignment</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
