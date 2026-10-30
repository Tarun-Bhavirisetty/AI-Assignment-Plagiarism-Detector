"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Clock,
  BookOpen,
  Users,
  FileCheck,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Layers,
  Check,
} from "lucide-react";

interface SectionItem {
  id: number;
  name: string;
  department: string;
}

interface CreateAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
}

export function CreateAssignmentModal({
  isOpen,
  onClose,
  onSuccess,
  token,
}: CreateAssignmentModalProps) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("Assignment");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [allowLateSubmissions, setAllowLateSubmissions] = useState(false);
  const [lateDeadline, setLateDeadline] = useState("");
  const [maxMarks, setMaxMarks] = useState<number>(100);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState<number>(50);
  const [allowedFormats, setAllowedFormats] = useState([".pdf", ".docx"]);
  const [status, setStatus] = useState("Active");

  const [availableSections, setAvailableSections] = useState<SectionItem[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize default dates
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const formatLocal = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };

      setStartDate(formatLocal(now));
      setDueDate(formatLocal(inOneWeek));
      setError(null);

      // Fetch available sections
      fetch("http://localhost:8000/sections", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            setAvailableSections(data);
            if (data.length > 0 && selectedSectionIds.length === 0) {
              setSelectedSectionIds([data[0].id]);
            }
          }
        })
        .catch((err) => console.error("Error fetching sections:", err));
    }
  }, [isOpen, token]);

  if (!isOpen) return null;

  const toggleSection = (id: number) => {
    if (selectedSectionIds.includes(id)) {
      if (selectedSectionIds.length === 1) return; // Keep at least one
      setSelectedSectionIds(selectedSectionIds.filter((sid) => sid !== id));
    } else {
      setSelectedSectionIds([...selectedSectionIds, id]);
    }
  };

  const toggleFormat = (fmt: string) => {
    if (allowedFormats.includes(fmt)) {
      if (allowedFormats.length === 1) return;
      setAllowedFormats(allowedFormats.filter((f) => f !== fmt));
    } else {
      setAllowedFormats([...allowedFormats, fmt]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Assignment title is required.");
      return;
    }

    if (selectedSectionIds.length === 0) {
      setError("Please select at least one target section.");
      return;
    }

    if (!dueDate) {
      setError("Please specify a submission due date.");
      return;
    }

    const payload = {
      title: title.trim(),
      subject: subject.trim() || undefined,
      category,
      description: description.trim() || undefined,
      instructions: instructions.trim() || undefined,
      start_date: startDate ? startDate.replace("T", " ") : undefined,
      due_date: dueDate.replace("T", " "),
      allow_late_submissions: allowLateSubmissions,
      late_deadline: allowLateSubmissions && lateDeadline ? lateDeadline.replace("T", " ") : undefined,
      max_marks: Number(maxMarks),
      allowed_formats: allowedFormats.join(","),
      max_file_size_mb: Number(maxFileSizeMB),
      status,
      section_ids: selectedSectionIds,
    };

    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:8000/assignments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to create assignment");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create New Coursework Assignment</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure schedule, target sections, and submission parameters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Title & Subject */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                Assignment Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Relational Query Optimization & Indexing"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700 dark:text-slate-300">Course / Subject</label>
              <input
                type="text"
                placeholder="e.g. CS302 DBMS"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition text-sm"
              />
            </div>
          </div>

          {/* Category & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700 dark:text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition text-sm"
              >
                <option value="Assignment">Assignment</option>
                <option value="Lab Report">Lab Report</option>
                <option value="Mini Project">Mini Project</option>
                <option value="Research Paper">Research Paper</option>
                <option value="Case Study">Case Study</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700 dark:text-slate-300">Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition text-sm"
              >
                <option value="Active">Active (Open for Submissions)</option>
                <option value="Scheduled">Scheduled (Opens at Start Date)</option>
                <option value="Draft">Draft (Hidden from Students)</option>
              </select>
            </div>
          </div>

          {/* Target Sections */}
          <div className="space-y-2">
            <label className="font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" />
                Target Sections <span className="text-rose-500">*</span>
              </span>
              <span className="text-xs text-slate-500 font-normal">
                {selectedSectionIds.length} section(s) selected
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {availableSections.map((sec) => {
                const isSelected = selectedSectionIds.includes(sec.id);
                return (
                  <button
                    type="button"
                    key={sec.id}
                    onClick={() => toggleSection(sec.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                      isSelected
                        ? "bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <span>{sec.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dates & Schedule */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-500" />
                Start Date & Time
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-rose-500" />
                Due Date & Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-xs"
              />
            </div>
          </div>

          {/* Late Policy */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-medium text-slate-800 dark:text-slate-200 cursor-pointer flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowLateSubmissions}
                    onChange={(e) => setAllowLateSubmissions(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 dark:bg-slate-900"
                  />
                  <span>Allow Late Submissions</span>
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 pl-6">
                  Permit students to submit after deadline (flagged as late with timestamp)
                </p>
              </div>
            </div>

            {allowLateSubmissions && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex flex-col sm:flex-row gap-3 items-center">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  Late Cutoff Deadline (Optional):
                </label>
                <input
                  type="datetime-local"
                  value={lateDeadline}
                  onChange={(e) => setLateDeadline(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
                />
              </div>
            )}
          </div>

          {/* Allowed Formats & Max Marks */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700 dark:text-slate-300">Max Marks</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={maxMarks}
                onChange={(e) => setMaxMarks(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700 dark:text-slate-300">Max File Size (MB)</label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxFileSizeMB}
                onChange={(e) => setMaxFileSizeMB(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700 dark:text-slate-300">Allowed Formats</label>
              <div className="flex gap-2 pt-1">
                {[".pdf", ".docx", ".txt"].map((fmt) => (
                  <button
                    type="button"
                    key={fmt}
                    onClick={() => toggleFormat(fmt)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium border transition ${
                      allowedFormats.includes(fmt)
                        ? "bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <label className="font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Submission Instructions & Guidelines</span>
              <span className="text-xs text-slate-400">Optional</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Include full methodology, algorithmic complexity analysis, and citations. All submissions undergo automated AI similarity & evidence checks."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition text-sm"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Create Assignment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
