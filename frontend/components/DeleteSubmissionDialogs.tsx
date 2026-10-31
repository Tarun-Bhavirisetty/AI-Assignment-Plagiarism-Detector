"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Trash2,
  X,
  Loader2,
  HardDrive,
  FileText,
  User,
  Clock,
  ShieldAlert,
} from "lucide-react";
import api from "@/lib/api";

// =========================================================================
// 1. DELETE SINGLE SUBMISSION MODAL
// =========================================================================
interface DeleteSingleSubmissionModalProps {
  isOpen: boolean;
  upload: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteSingleSubmissionModal({
  isOpen,
  upload,
  onClose,
  onSuccess,
}: DeleteSingleSubmissionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !upload) return null;

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/admin/uploads/${upload.id}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to delete submission.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                Delete Submission
              </h3>
              <p className="text-xs text-muted-foreground">
                Remove document file and associated analysis records.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Details Card */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-muted-foreground">Document File:</span>
            <span className="font-bold text-foreground truncate max-w-[240px]">
              {upload.file_name}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Student:</span>
            <span className="font-semibold text-foreground">
              {upload.uploaded_by_name} ({upload.section_name || "N/A"})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Coursework:</span>
            <span className="font-medium text-foreground">
              {upload.assignment_title || "N/A"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Submission Date:</span>
            <span className="font-mono text-muted-foreground">
              {upload.upload_time || "N/A"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">File Size on Disk:</span>
            <span className="font-semibold text-primary">
              {upload.file_size_formatted || "Unknown"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-muted-foreground">Integrity Status:</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                upload.similarity_status === "Exact Duplicate"
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                  : upload.similarity_status === "Potential Match"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              }`}
            >
              {upload.similarity_status || "Clean"} ({upload.similarity_score ?? 0}%)
            </span>
          </div>
        </div>

        {/* Impact Warning */}
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Deletion Impact Notice</span>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Deleting this submission permanently removes the physical file from storage, cleans its vector embeddings from ChromaDB, and clears all linked plagiarism evidence and evaluation marks.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground transition flex items-center gap-1.5 shadow"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Confirm Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 2. BULK DELETE SUBMISSIONS MODAL
// =========================================================================
interface BulkDeleteSubmissionsModalProps {
  isOpen: boolean;
  selectedUploads: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkDeleteSubmissionsModal({
  isOpen,
  selectedUploads,
  onClose,
  onSuccess,
}: BulkDeleteSubmissionsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || selectedUploads.length === 0) return null;

  const totalBytes = selectedUploads.reduce(
    (acc, u) => acc + (u.file_size_bytes || 0),
    0
  );
  const formattedStorage =
    totalBytes >= 1024 * 1024
      ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(totalBytes / 1024).toFixed(1)} KB`;

  const handleBulkDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const uploadIds = selectedUploads.map((u) => u.id);
      await api.post("/admin/uploads/bulk-delete", {
        upload_ids: uploadIds,
        permanent: true,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Bulk deletion failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                Delete Selected Submissions
              </h3>
              <p className="text-xs text-muted-foreground">
                Permanently delete multiple submissions in a single operation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Summary Card */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-muted-foreground">Selected Submissions:</span>
            <span className="font-extrabold text-foreground text-sm font-mono">
              {selectedUploads.length} items
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Estimated Storage Reclaimed:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {formattedStorage}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground pt-1">
            Affects submissions from students across sections:{" "}
            <span className="font-medium text-foreground">
              {Array.from(new Set(selectedUploads.map((u) => u.section_name))).join(", ")}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-[11px] text-destructive space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Irreversible Action</span>
          </div>
          <p className="leading-relaxed">
            This action cannot be undone. Associated files will be permanently purged from the storage volume and ChromaDB.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground transition flex items-center gap-1.5 shadow"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Delete {selectedUploads.length} Submissions</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 3. DELETE ALL SUBMISSIONS (HIGH-RISK ACTION)
// =========================================================================
interface DeleteAllSubmissionsModalProps {
  isOpen: boolean;
  totalSubmissions: number;
  totalStorageMb: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteAllSubmissionsModal({
  isOpen,
  totalSubmissions,
  totalStorageMb,
  onClose,
  onSuccess,
}: DeleteAllSubmissionsModalProps) {
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isPhraseValid =
    confirmationPhrase.trim().toUpperCase() === "DELETE ALL SUBMISSIONS";

  const handleDeleteAll = async () => {
    if (!isPhraseValid) {
      setError("Please type exactly 'DELETE ALL SUBMISSIONS' to confirm.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post("/admin/uploads/delete-all", {
        confirmation_phrase: confirmationPhrase.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Delete all failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-card border-2 border-destructive/40 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-destructive text-destructive-foreground animate-pulse">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-destructive tracking-tight">
                High-Risk: Delete All Submissions
              </h3>
              <p className="text-xs text-muted-foreground">
                Permanent institutional purge of all student submissions and files.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 space-y-2 text-xs">
          <div className="flex items-center justify-between font-bold text-foreground">
            <span>Total Submissions to Purge:</span>
            <span className="text-destructive font-mono text-sm">{totalSubmissions} files</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Storage to Reclaim:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              ~{totalStorageMb} MB
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/60">
            <strong>What will NOT be deleted:</strong> User accounts, Faculty accounts, Evaluator allocations, Assignments definitions, and Section structures remain intact.
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span>Type confirmation phrase:</span>
            <code className="text-xs px-1.5 py-0.5 rounded bg-muted text-destructive font-mono">
              DELETE ALL SUBMISSIONS
            </code>
          </label>
          <input
            type="text"
            value={confirmationPhrase}
            onChange={(e) => setConfirmationPhrase(e.target.value)}
            placeholder="Type DELETE ALL SUBMISSIONS"
            className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border text-xs text-foreground font-mono outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive transition"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={!isPhraseValid || loading}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground transition flex items-center gap-1.5 shadow disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Permanently Delete All Submissions</span>
          </button>
        </div>
      </div>
    </div>
  );
}
