"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Trash2,
  X,
  Loader2,
  User,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  Archive,
} from "lucide-react";
import api from "@/lib/api";

// =========================================================================
// 1. DELETE SINGLE USER MODAL
// =========================================================================
interface DeleteSingleUserModalProps {
  isOpen: boolean;
  user: any;
  currentUserId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteSingleUserModal({
  isOpen,
  user,
  currentUserId,
  onClose,
  onSuccess,
}: DeleteSingleUserModalProps) {
  const [preserveRecords, setPreserveRecords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const isSelf = user.id === currentUserId;

  const handleDelete = async () => {
    if (isSelf) {
      setError("Cannot delete your own administrator account.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.delete(
        `/admin/users/${user.id}?preserve_academic_records=${preserveRecords}`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to delete user account.");
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
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                Manage & Delete User
              </h3>
              <p className="text-xs text-muted-foreground">
                Remove account access or permanently purge account profile.
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

        {isSelf && (
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>This is your active administrator account. Self-deletion is disabled.</span>
          </div>
        )}

        {/* User Card */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-muted-foreground">User Name:</span>
            <span className="font-bold text-foreground">{user.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email Address:</span>
            <span className="font-mono text-foreground">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Role:</span>
            <span className="capitalize font-bold text-primary">{user.role}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Reg / Emp No:</span>
            <span className="font-mono text-muted-foreground">{user.registration_number || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Department & Section:</span>
            <span className="font-medium text-foreground">
              {user.department || "Computer Science"} &bull; {user.section_name || "N/A"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60 text-center">
            <div className="p-2 rounded-lg bg-card border border-border">
              <div className="font-bold text-foreground">{user.submissions_count ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">Submissions</div>
            </div>
            <div className="p-2 rounded-lg bg-card border border-border">
              <div className="font-bold text-foreground">{user.assignments_created_count ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">Created</div>
            </div>
            <div className="p-2 rounded-lg bg-card border border-border">
              <div className="font-bold text-foreground">{user.evaluations_count ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">Evaluations</div>
            </div>
          </div>
        </div>

        {/* Strategy Options */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-bold text-foreground">Academic Preservation Policy</label>
          <div className="space-y-2">
            <label
              onClick={() => setPreserveRecords(true)}
              className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                preserveRecords
                  ? "bg-primary/5 border-primary ring-1 ring-primary"
                  : "bg-card border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="preserve"
                checked={preserveRecords}
                onChange={() => setPreserveRecords(true)}
                className="mt-0.5 text-primary focus:ring-primary"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5 text-primary" />
                  <span>Preserve Academic Records (Recommended)</span>
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Archives and deactivates the user account. Prevents future login while preserving student submissions, grading evaluations, and plagiarism history intact.
                </p>
              </div>
            </label>

            <label
              onClick={() => setPreserveRecords(false)}
              className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                !preserveRecords
                  ? "bg-destructive/5 border-destructive ring-1 ring-destructive"
                  : "bg-card border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="preserve"
                checked={!preserveRecords}
                onChange={() => setPreserveRecords(false)}
                className="mt-0.5 text-destructive focus:ring-destructive"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-destructive flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Permanent Purge</span>
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Permanently deletes the user record and cleans all associated uploads, files, and evaluations from the database.
                </p>
              </div>
            </label>
          </div>
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
            disabled={isSelf || loading}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground transition flex items-center gap-1.5 shadow disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>{preserveRecords ? "Archive & Preserve" : "Permanently Delete"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 2. BULK DELETE USERS MODAL
// =========================================================================
interface BulkDeleteUsersModalProps {
  isOpen: boolean;
  selectedUsers: any[];
  currentUserId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkDeleteUsersModal({
  isOpen,
  selectedUsers,
  currentUserId,
  onClose,
  onSuccess,
}: BulkDeleteUsersModalProps) {
  const [preserveRecords, setPreserveRecords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || selectedUsers.length === 0) return null;

  // Filter out self
  const eligibleUsers = selectedUsers.filter((u) => u.id !== currentUserId);

  const handleBulkDelete = async () => {
    if (eligibleUsers.length === 0) {
      setError("No eligible users selected for deletion (administrator accounts protected).");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post("/admin/users/bulk-delete", {
        user_ids: eligibleUsers.map((u) => u.id),
        preserve_academic_records: preserveRecords,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Bulk user deletion failed.");
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
                Delete Selected Users
              </h3>
              <p className="text-xs text-muted-foreground">
                Process multiple accounts in a single batch.
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

        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-muted-foreground">Selected Accounts:</span>
            <span className="font-extrabold text-foreground font-mono text-sm">
              {eligibleUsers.length} users
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Roles affected:{" "}
            <span className="font-semibold text-foreground capitalize">
              {Array.from(new Set(eligibleUsers.map((u) => u.role))).join(", ")}
            </span>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <label className="text-xs font-bold text-foreground">Academic Preservation Policy</label>
          <div className="space-y-2">
            <label
              onClick={() => setPreserveRecords(true)}
              className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                preserveRecords
                  ? "bg-primary/5 border-primary ring-1 ring-primary"
                  : "bg-card border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="preserve_bulk"
                checked={preserveRecords}
                onChange={() => setPreserveRecords(true)}
                className="mt-0.5 text-primary focus:ring-primary"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5 text-primary" />
                  <span>Preserve Academic Records (Recommended)</span>
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Deactivates accounts while preserving submissions and grading history.
                </p>
              </div>
            </label>

            <label
              onClick={() => setPreserveRecords(false)}
              className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                !preserveRecords
                  ? "bg-destructive/5 border-destructive ring-1 ring-destructive"
                  : "bg-card border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="preserve_bulk"
                checked={!preserveRecords}
                onChange={() => setPreserveRecords(false)}
                className="mt-0.5 text-destructive focus:ring-destructive"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-destructive flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Permanent Purge</span>
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Permanently deletes accounts and associated upload files.
                </p>
              </div>
            </label>
          </div>
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
            disabled={loading || eligibleUsers.length === 0}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground transition flex items-center gap-1.5 shadow"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Process {eligibleUsers.length} Users</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 3. DELETE ALL USERS (HIGH-RISK ACTION)
// =========================================================================
interface DeleteAllUsersModalProps {
  isOpen: boolean;
  totalUsers: number;
  currentAdminEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteAllUsersModal({
  isOpen,
  totalUsers,
  currentAdminEmail,
  onClose,
  onSuccess,
}: DeleteAllUsersModalProps) {
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [preserveRecords, setPreserveRecords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isPhraseValid =
    confirmationPhrase.trim().toUpperCase() === "DELETE ALL USERS";

  const handleDeleteAll = async () => {
    if (!isPhraseValid) {
      setError("Please type exactly 'DELETE ALL USERS' to confirm.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post("/admin/users/delete-all", {
        confirmation_phrase: confirmationPhrase.trim(),
        preserve_academic_records: preserveRecords,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Delete all users failed.");
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
                High-Risk: Delete All Users
              </h3>
              <p className="text-xs text-muted-foreground">
                Institutional purge of non-administrator accounts.
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

        {/* Safeguard Notice */}
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Active Administrator Protected</div>
            <div className="text-[11px] text-muted-foreground">
              Your logged-in administrator account (<strong>{currentAdminEmail}</strong>) is permanently protected and will NOT be deleted.
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 space-y-2 text-xs">
          <div className="flex items-center justify-between font-bold text-foreground">
            <span>Accounts to Process:</span>
            <span className="text-destructive font-mono text-sm">{Math.max(0, totalUsers - 1)} users</span>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <label className="text-xs font-bold text-foreground">Academic Preservation Policy</label>
          <div className="space-y-2">
            <label
              onClick={() => setPreserveRecords(true)}
              className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                preserveRecords
                  ? "bg-primary/5 border-primary ring-1 ring-primary"
                  : "bg-card border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="preserve_all"
                checked={preserveRecords}
                onChange={() => setPreserveRecords(true)}
                className="mt-0.5 text-primary focus:ring-primary"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5 text-primary" />
                  <span>Preserve Academic Records (Recommended)</span>
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Deactivates all user accounts while preserving submissions and grading history.
                </p>
              </div>
            </label>

            <label
              onClick={() => setPreserveRecords(false)}
              className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                !preserveRecords
                  ? "bg-destructive/5 border-destructive ring-1 ring-destructive"
                  : "bg-card border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="preserve_all"
                checked={!preserveRecords}
                onChange={() => setPreserveRecords(false)}
                className="mt-0.5 text-destructive focus:ring-destructive"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-destructive flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Permanent Purge</span>
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Permanently deletes user accounts and purges all student submissions from storage.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span>Type confirmation phrase:</span>
            <code className="text-xs px-1.5 py-0.5 rounded bg-muted text-destructive font-mono">
              DELETE ALL USERS
            </code>
          </label>
          <input
            type="text"
            value={confirmationPhrase}
            onChange={(e) => setConfirmationPhrase(e.target.value)}
            placeholder="Type DELETE ALL USERS"
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
            <span>Process All Users</span>
          </button>
        </div>
      </div>
    </div>
  );
}
