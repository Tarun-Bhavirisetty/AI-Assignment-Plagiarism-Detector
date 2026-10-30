"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import DashboardCards from "@/components/DashboardCards";
import Charts from "@/components/Charts";
import DuplicateCompareModal from "@/components/DuplicateCompareModal";
import DocumentPreviewModal from "@/components/DocumentPreviewModal";
import { CreateAssignmentModal } from "@/components/CreateAssignmentModal";
import { AssignmentsManagementView } from "@/components/AssignmentsManagementView";
import api from "@/lib/api";
import {
  Loader2,
  Plus,
  Trash2,
  Search,
  Filter,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Users,
  GraduationCap,
  BookOpen,
  Award,
  Shield,
  Layers,
  FileText,
  AlertTriangle,
  CheckCircle,
  Eye,
  Download,
  ExternalLink,
  ArrowRight,
  Clock,
  BarChart3,
  GitBranch,
} from "lucide-react";

export default function Dashboard() {
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  const [selectedUploadId, setSelectedUploadId] = useState<number | null>(null);
  const [previewUpload, setPreviewUpload] = useState<any>(null);
  const [isCreateAssignmentOpen, setIsCreateAssignmentOpen] = useState(false);
  const [assignmentRefreshTrigger, setAssignmentRefreshTrigger] = useState(0);

  const [sections, setSections] = useState<any[]>([]);
  const [newSection, setNewSection] = useState("");

  const [allUploads, setAllUploads] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterAssignment, setFilterAssignment] = useState("");

  // Three-Tier Roles & Users State
  const [users, setUsers] = useState<any[]>([]);
  const [evaluators, setEvaluators] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedEvaluator, setSelectedEvaluator] = useState("");
  const [selectedAssignSection, setSelectedAssignSection] = useState("");
  const [assignmentMsg, setAssignmentMsg] = useState({ text: "", type: "" });
  const [roleUpdatingId, setRoleUpdatingId] = useState<number | null>(null);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("all");

  // Expandable Accordion Panel State
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({
    users: true,
    submissions: true,
    feed: true,
    assignments: true,
    allocation: false,
    analytics: false,
  });

  const togglePanel = (panel: string) => {
    setOpenPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const fetchSections = async () => {
    try {
      const res = await api.get("/sections");
      setSections(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUploads = async () => {
    try {
      const res = await api.get("/admin/uploads");
      setAllUploads(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get("/admin/users");
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEvaluators = async () => {
    try {
      const res = await api.get("/evaluators");
      setEvaluators(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAssignments = async () => {
    try {
      const res = await api.get("/evaluator-sections");
      setAssignments(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await api.get("/analytics");
      setData(res.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        router.push("/login");
      } else {
        setError("Failed to load dashboard data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("token") || "";
    const role = localStorage.getItem("role");
    setToken(storedToken);

    if (!storedToken) {
      router.push("/login");
    } else if (role !== "admin") {
      router.push("/user-dashboard");
    } else {
      fetchAnalytics();
      fetchSections();
      fetchUploads();
      fetchUsers();
      fetchEvaluators();
      fetchAssignments();
    }
  }, [router]);

  const handleUpdateUserRole = async (
    userId: number,
    newRole: string,
    department: string
  ) => {
    setRoleUpdatingId(userId);
    try {
      await api.put(`/admin/users/${userId}/role`, {
        role: newRole,
        department,
      });
      fetchUsers();
      fetchEvaluators();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to update role");
    } finally {
      setRoleUpdatingId(null);
    }
  };

  const handleAssignEvaluator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvaluator || !selectedAssignSection) return;
    setAssignmentMsg({ text: "", type: "" });
    try {
      await api.post("/evaluator-sections", {
        evaluator_id: parseInt(selectedEvaluator),
        section_id: parseInt(selectedAssignSection),
      });
      setAssignmentMsg({
        text: "Evaluator mapped to section successfully!",
        type: "success",
      });
      setSelectedEvaluator("");
      setSelectedAssignSection("");
      fetchAssignments();
    } catch (err: any) {
      setAssignmentMsg({
        text: err.response?.data?.detail || "Assignment failed",
        type: "error",
      });
    }
  };

  const handleRemoveAssignment = async (evaluatorId: number, sectionId: number) => {
    if (!confirm("Are you sure you want to remove this assignment?")) return;
    try {
      await api.delete(`/evaluator-sections/${evaluatorId}/${sectionId}`);
      fetchAssignments();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to remove assignment");
    }
  };

  const handleAddSection = async () => {
    if (!newSection.trim()) return;
    try {
      await api.post("/sections", { name: newSection });
      setNewSection("");
      fetchSections();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSection = async (id: number) => {
    if (!confirm("Are you sure you want to delete this section?")) return;
    try {
      await api.delete(`/sections/${id}`);
      fetchSections();
      fetchAssignments();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReprocess = async () => {
    try {
      setLoading(true);
      await api.post("/admin/reprocess");
      await fetchAnalytics();
      await fetchUploads();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id: number, fileName: string) => {
    try {
      const res = await api.get(`/admin/download/${id}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
    } catch (err) {
      console.error("Download failed", err);
      alert("Failed to download file");
    }
  };

  // Role Counts for User & Role Access
  const roleCounts = useMemo(() => {
    const counts = { student: 0, faculty: 0, evaluator: 0, hod: 0, admin: 0 };
    users.forEach((u) => {
      const r = (u.role || "").toLowerCase();
      if (r in counts) {
        counts[r as keyof typeof counts]++;
      }
    });
    return counts;
  }, [users]);

  // Section Stats for All Submissions
  const sectionCardsData = useMemo(() => {
    return sections.map((sec) => {
      const secUploads = allUploads.filter((u) => u.section_name === sec.name);
      const totalSubs = secUploads.length;
      const highOverlap = secUploads.filter(
        (u) => (u.similarity_score || 0) >= 80 || u.is_duplicate
      ).length;
      const pendingEval = secUploads.filter(
        (u) => !u.evaluation_status || u.evaluation_status === "Pending Evaluation"
      ).length;
      const completedEval = secUploads.filter(
        (u) => u.evaluation_status === "Evaluation Completed"
      ).length;
      const enrolledStudents = users.filter(
        (u) => u.role === "student" && u.section_name === sec.name
      ).length;

      return {
        id: sec.id,
        name: sec.name,
        department: sec.department || "Computer Science",
        enrolledStudents,
        totalSubs,
        highOverlap,
        pendingEval,
        completedEval,
      };
    });
  }, [sections, allUploads, users]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    if (selectedRoleFilter === "all") return users;
    return users.filter(
      (u) => (u.role || "").toLowerCase() === selectedRoleFilter.toLowerCase()
    );
  }, [users, selectedRoleFilter]);

  // Filtered Uploads
  const filteredUploads = useMemo(() => {
    return allUploads.filter((u) => {
      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        (u.file_name && u.file_name.toLowerCase().includes(query)) ||
        (u.uploaded_by_name && u.uploaded_by_name.toLowerCase().includes(query)) ||
        (u.assignment_title && u.assignment_title.toLowerCase().includes(query));
      const matchSection = filterSection ? u.section_name === filterSection : true;
      const matchAssignment = filterAssignment
        ? u.assignment_title === filterAssignment
        : true;
      return matchSearch && matchSection && matchAssignment;
    });
  }, [allUploads, searchQuery, filterSection, filterAssignment]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center text-destructive">
        {error || "Failed to load data"}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Administrator Control Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Institutional Integrity & Administration
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Institutional oversight, role delegation, section-scoped assignment tracking, and directional plagiarism intelligence.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsCreateAssignmentOpen(true)}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" />
            <span>Create Assignment</span>
          </button>
          <button
            onClick={handleReprocess}
            className="px-3.5 py-2 bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reprocess Uploads</span>
          </button>
        </div>
      </div>

      {/* Top 3 Stat Cards */}
      <DashboardCards
        total={data.total_uploads}
        dupes={data.duplicate_uploads}
        fileStats={data.file_types}
      />

      {/* ========================================================================= */}
      {/* PANEL 1: USER & ROLE ACCESS MANAGEMENT (FIVE ROLES) */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-6">
        <div
          onClick={() => togglePanel("users")}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                User & Role Access Management (Five Roles)
              </h2>
              <p className="text-xs text-muted-foreground">
                Manage accounts and delegate permissions across Student, Faculty, Evaluator, HOD, and Administrator.
              </p>
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            {openPanels.users ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {openPanels.users && (
          <div className="space-y-6 pt-2 animate-in fade-in-50 duration-150">
            {/* 5 Interactive Role Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { role: "student", label: "Students", count: roleCounts.student, icon: GraduationCap, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
                { role: "faculty", label: "Faculty", count: roleCounts.faculty, icon: BookOpen, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
                { role: "evaluator", label: "Evaluators", count: roleCounts.evaluator, icon: Award, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
                { role: "hod", label: "HODs", count: roleCounts.hod, icon: Layers, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/20" },
                { role: "admin", label: "Administrators", count: roleCounts.admin, icon: Shield, color: "text-rose-500", bg: "bg-rose-500/10 border-rose-500/20" },
              ].map((item) => {
                const isSelected = selectedRoleFilter === item.role;
                const Icon = item.icon;
                return (
                  <button
                    key={item.role}
                    onClick={() =>
                      setSelectedRoleFilter(isSelected ? "all" : item.role)
                    }
                    className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden ${
                      isSelected
                        ? "ring-2 ring-primary border-primary bg-primary/5 shadow-sm"
                        : "bg-muted/20 border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">{item.label}</span>
                      <Icon className={`w-4 h-4 ${item.color}`} />
                    </div>
                    <div className="mt-2 text-2xl font-extrabold text-foreground font-mono">
                      {item.count}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {isSelected ? "Filtering active (Click to reset)" : "Click to view roster"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Filter Pill */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
              <span>
                Showing <strong className="text-foreground">{filteredUsers.length}</strong> of {users.length} users
                {selectedRoleFilter !== "all" && (
                  <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 capitalize">
                    {selectedRoleFilter} only
                  </span>
                )}
              </span>
              {selectedRoleFilter !== "all" && (
                <button
                  onClick={() => setSelectedRoleFilter("all")}
                  className="text-primary hover:underline font-semibold text-xs"
                >
                  Clear role filter
                </button>
              )}
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground text-[11px] uppercase font-bold tracking-wider">
                  <tr>
                    <th className="py-3 px-4 font-semibold">User</th>
                    <th className="py-3 px-3 font-semibold">Reg / Emp No</th>
                    <th className="py-3 px-3 font-semibold">Department & Section</th>
                    <th className="py-3 px-3 font-semibold">Verification</th>
                    <th className="py-3 px-3 font-semibold">Role</th>
                    <th className="py-3 pr-4 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((u: any) => (
                    <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground text-sm">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-foreground">
                        {u.registration_number || "—"}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">
                        <div>{u.department || "Computer Science"}</div>
                        {u.section_name && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-foreground border border-border mt-0.5">
                            {u.section_name}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {u.is_verified ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Verified
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <select
                          defaultValue={u.role}
                          id={`role-select-${u.id}`}
                          className="px-2.5 py-1.5 bg-card border border-border rounded-xl text-xs text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition capitalize"
                        >
                          <option value="student">Student</option>
                          <option value="faculty">Faculty</option>
                          <option value="evaluator">Evaluator</option>
                          <option value="hod">HOD</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <button
                          onClick={() => {
                            const sel = document.getElementById(
                              `role-select-${u.id}`
                            ) as HTMLSelectElement;
                            if (sel)
                              handleUpdateUserRole(
                                u.id,
                                sel.value,
                                u.department || "Computer Science"
                              );
                          }}
                          disabled={roleUpdatingId === u.id}
                          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl border border-primary/20 transition shadow-sm disabled:opacity-50"
                        >
                          {roleUpdatingId === u.id ? "Saving..." : "Update"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No users found in this role category.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PANEL 2: ALL SUBMISSIONS & DOCUMENTS (SECTION-SCOPED VIEW) */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-6">
        <div
          onClick={() => togglePanel("submissions")}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                All Submissions & Document Repository
              </h2>
              <p className="text-xs text-muted-foreground">
                Section-scoped cohort analytics, submission lineage, and direct evidence comparison.
              </p>
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            {openPanels.submissions ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {openPanels.submissions && (
          <div className="space-y-6 pt-2 animate-in fade-in-50 duration-150">
            {/* Dynamic Section Cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Academic Section Cohorts
                </span>
                {filterSection && (
                  <button
                    onClick={() => setFilterSection("")}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    Reset section filter
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {sectionCardsData.map((sec) => {
                  const isSelected = filterSection === sec.name;
                  return (
                    <div
                      key={sec.id}
                      onClick={() =>
                        setFilterSection(isSelected ? "" : sec.name)
                      }
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "ring-2 ring-primary border-primary bg-primary/5 shadow-sm"
                          : "bg-muted/20 border-border hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                          {sec.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {sec.enrolledStudents} student{sec.enrolledStudents !== 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/60 text-center">
                        <div>
                          <div className="text-base font-extrabold text-foreground font-mono">
                            {sec.totalSubs}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Submitted</div>
                        </div>
                        <div>
                          <div className={`text-base font-extrabold font-mono ${sec.highOverlap > 0 ? "text-rose-500" : "text-foreground"}`}>
                            {sec.highOverlap}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Overlap ≥80%</div>
                        </div>
                        <div>
                          <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                            {sec.completedEval}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Evaluated</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-3 pt-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by student name, file name, or assignment title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <select
                  value={filterSection}
                  onChange={(e) => setFilterSection(e.target.value)}
                  className="px-3 py-2 bg-card border border-border rounded-xl text-xs text-foreground outline-none min-w-[130px]"
                >
                  <option value="">All Sections</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterAssignment}
                  onChange={(e) => setFilterAssignment(e.target.value)}
                  className="px-3 py-2 bg-card border border-border rounded-xl text-xs text-foreground outline-none min-w-[150px]"
                >
                  <option value="">All Coursework</option>
                  {Array.from(new Set(allUploads.map((u) => u.assignment_title)))
                    .filter(Boolean)
                    .map((a) => (
                      <option key={a as string} value={a as string}>
                        {a as string}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Submissions Table */}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase tracking-wider font-bold text-[11px]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Student</th>
                    <th className="px-5 py-3 font-semibold">Section</th>
                    <th className="px-5 py-3 font-semibold">Coursework</th>
                    <th className="px-5 py-3 font-semibold">File & Version</th>
                    <th className="px-5 py-3 font-semibold">Submitted</th>
                    <th className="px-5 py-3 font-semibold text-center">Similarity</th>
                    <th className="px-5 py-3 font-semibold text-center">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUploads.map((upload) => {
                    const sim = upload.similarity_score || 0;
                    return (
                      <tr
                        key={upload.id}
                        className="hover:bg-muted/30 transition-colors group cursor-pointer"
                        onClick={() => setPreviewUpload(upload)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-foreground">{upload.uploaded_by_name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{upload.registration_number || upload.uploaded_by_email}</div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground font-medium">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted border border-border">
                            {upload.section_name}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-primary">
                          {upload.assignment_title}
                        </td>
                        <td className="px-5 py-3.5 text-foreground">
                          <div className="font-medium group-hover:text-primary transition-colors flex items-center gap-1.5">
                            <span className="truncate max-w-[160px]" title={upload.file_name}>{upload.file_name}</span>
                            {upload.version > 1 && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                v{upload.version}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-[11px]">
                          {upload.upload_time}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                              sim >= 80
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                : sim > 30
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            }`}
                          >
                            {sim.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span
                            className={`px-2 py-0.5 text-[10px] rounded-full font-bold border ${
                              upload.evaluation_status === "Evaluation Completed"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : upload.evaluation_status === "Resubmission Requested"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                            }`}
                          >
                            {upload.evaluation_status || "Pending"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right space-x-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUpload(upload);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-muted hover:bg-muted/80 rounded-lg border border-border text-foreground transition"
                            title="Preview file"
                          >
                            Preview
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(upload.id, upload.file_name);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 rounded-lg border border-primary/20 transition"
                            title="Download file"
                          >
                            Download
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUploadId(upload.id);
                            }}
                            className="px-2.5 py-1 text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-lg border border-amber-500/20 transition"
                            title="Inspect similarity & evidence"
                          >
                            Compare
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUploads.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                        No submissions match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PANEL 3: GLOBAL DUPLICATE DETECTION FEED (DIRECTIONAL) */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-6">
        <div
          onClick={() => togglePanel("feed")}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                Global Duplicate Detection Feed (Directional Intelligence)
              </h2>
              <p className="text-xs text-muted-foreground">
                Directional assessment: <span className="font-semibold text-foreground">New Submission &rarr; Matched Historical Reference</span>. Reference documents remain pristine and unmodified.
              </p>
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            {openPanels.feed ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {openPanels.feed && (
          <div className="space-y-4 pt-2 animate-in fade-in-50 duration-150">
            {data.duplicate_records && data.duplicate_records.length > 0 ? (
              <div className="space-y-3.5">
                {data.duplicate_records.map((record: any, idx: number) => {
                  const targetUploadId = record.new_upload_id || record.id;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedUploadId(targetUploadId)}
                      className="p-5 bg-muted/20 hover:bg-muted/40 rounded-2xl border border-border hover:border-primary/50 transition-all cursor-pointer group shadow-sm"
                    >
                      {/* Top Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5 pb-3 border-b border-border/60">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${
                              record.similarity_score === 100
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                            }`}
                          >
                            {record.duplicate_type || "Duplicate"} ({record.similarity_score}%)
                          </span>

                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                            Direction: NEW &rarr; REFERENCE
                          </span>
                        </div>

                        <span className="text-[11px] text-muted-foreground font-mono">
                          {record.upload_time || record.comparison_timestamp}
                        </span>
                      </div>

                      {/* Directional Split Comparison Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        {/* Left: Newly Uploaded Submission */}
                        <div className="p-3.5 rounded-xl bg-card border border-border/80 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                            <span>Newly Uploaded Submission (Flagged)</span>
                          </div>
                          <div className="font-extrabold text-foreground text-sm">
                            {record.uploaded_by_name}
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {record.uploaded_by} &bull; Section: <strong className="text-foreground">{record.section_name}</strong>
                          </div>
                          <div className="text-[11px] text-muted-foreground pt-1 truncate">
                            File: <strong className="text-foreground">{record.file_name}</strong>
                          </div>
                        </div>

                        {/* Right: Matched Historical Reference */}
                        <div className="p-3.5 rounded-xl bg-card border border-border/80 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>Historical Reference Document (Unmodified)</span>
                          </div>
                          <div className="font-extrabold text-foreground text-sm">
                            {record.reference_student_name || record.matched_with || "Historical Original"}
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {record.reference_student_email || "Archived Submission"} &bull; Section: <strong className="text-foreground">{record.reference_section_name || "Reference Cohort"}</strong>
                          </div>
                          <div className="text-[11px] text-muted-foreground pt-1 truncate">
                            File: <strong className="text-foreground">{record.reference_file_name || "reference_doc"}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="pt-3.5 mt-3.5 border-t border-border flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Coursework:</span>
                          <span className="font-semibold text-foreground">
                            {record.assignment_title || record.file_name}
                          </span>
                        </div>

                        <span className="text-primary font-bold inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          <span>Inspect Evidence & Navigation</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground space-y-1">
                <CheckCircle className="w-8 h-8 mx-auto text-emerald-500/40 mb-2" />
                <p className="text-sm font-semibold text-foreground">No duplicate submissions detected globally</p>
                <p className="text-xs">All uploaded assignments currently reflect clean integrity scores.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PANEL 4: ASSIGNMENT MANAGEMENT */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-6">
        <div
          onClick={() => togglePanel("assignments")}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                Assignment Lifecycle & Section Allocation
              </h2>
              <p className="text-xs text-muted-foreground">
                Create coursework, configure strict submission deadlines, toggle late acceptance, and inspect completion analytics.
              </p>
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            {openPanels.assignments ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {openPanels.assignments && (
          <div className="pt-2 animate-in fade-in-50 duration-150">
            <AssignmentsManagementView
              userRole="admin"
              token={token}
              onCreateClick={() => setIsCreateAssignmentOpen(true)}
              refreshTrigger={assignmentRefreshTrigger}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PANEL 5: FACULTY & EVALUATOR SECTION ALLOCATION */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-6">
        <div
          onClick={() => togglePanel("allocation")}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                Faculty & Evaluator Section Allocation
              </h2>
              <p className="text-xs text-muted-foreground">
                Define academic sections and map evaluator review purviews.
              </p>
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            {openPanels.allocation ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {openPanels.allocation && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 animate-in fade-in-50 duration-150">
            {/* Academic Sections */}
            <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-4">
              <h3 className="text-sm font-bold text-foreground">Manage Academic Sections</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSection}
                  onChange={(e) => setNewSection(e.target.value)}
                  placeholder="Enter section name (e.g. CSE-A)"
                  className="flex-1 px-3 py-2 rounded-xl bg-card border border-border text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
                <button
                  onClick={handleAddSection}
                  className="px-3.5 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 flex items-center transition shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </button>
              </div>

              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {sections.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2.5 bg-card rounded-xl border border-border text-xs font-medium text-foreground"
                  >
                    <span>{s.name}</span>
                    <button
                      onClick={() => handleDeleteSection(s.id)}
                      className="text-destructive hover:opacity-80 p-1"
                      title="Delete section"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {sections.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No sections registered.
                  </p>
                )}
              </div>
            </div>

            {/* Evaluator Mapping Form */}
            <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-4">
              <h3 className="text-sm font-bold text-foreground">Assign Evaluator to Section</h3>
              {assignmentMsg.text && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-semibold border ${
                    assignmentMsg.type === "success"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
                  }`}
                >
                  {assignmentMsg.text}
                </div>
              )}
              <form onSubmit={handleAssignEvaluator} className="flex flex-col gap-2.5 text-xs">
                <select
                  required
                  className="px-3 py-2 bg-card border border-border rounded-xl text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                  value={selectedEvaluator}
                  onChange={(e) => setSelectedEvaluator(e.target.value)}
                >
                  <option value="">-- Choose Evaluator --</option>
                  {evaluators.map((ev: any) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} ({ev.email})
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <select
                    required
                    className="flex-1 px-3 py-2 bg-card border border-border rounded-xl text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                    value={selectedAssignSection}
                    onChange={(e) => setSelectedAssignSection(e.target.value)}
                  >
                    <option value="">-- Choose Section --</option>
                    {sections.map((sec: any) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-xs hover:bg-primary/90 transition shadow-sm"
                  >
                    Assign
                  </button>
                </div>
              </form>

              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                {assignments.map((as: any) => (
                  <div
                    key={as.id}
                    className="flex items-center justify-between p-2.5 bg-card rounded-xl border border-border text-xs"
                  >
                    <div>
                      <span className="font-bold text-foreground">{as.evaluator_name}</span>
                      <span className="text-muted-foreground mx-1">&rarr;</span>
                      <span className="text-primary font-bold">{as.section_name}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveAssignment(as.evaluator_id, as.section_id)}
                      className="text-destructive hover:opacity-80 p-1"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {assignments.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No evaluator allocations configured.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PANEL 6: ANALYTICS & INSTITUTIONAL REPORTS */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-6">
        <div
          onClick={() => togglePanel("analytics")}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                Analytics & Plagiarism Distribution
              </h2>
              <p className="text-xs text-muted-foreground">
                Distribution graphs and duplicate incidence patterns across assignment cohorts.
              </p>
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            {openPanels.analytics ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {openPanels.analytics && (
          <div className="pt-2 animate-in fade-in-50 duration-150">
            <div className="max-w-2xl">
              <h3 className="text-sm font-bold text-foreground mb-4">
                Plagiarism Severity Distribution
              </h3>
              <Charts stats={data.duplicate_trends || {}} />
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedUploadId && (
        <DuplicateCompareModal
          uploadId={selectedUploadId}
          onClose={() => setSelectedUploadId(null)}
        />
      )}

      {previewUpload && (
        <DocumentPreviewModal
          upload={previewUpload}
          onClose={() => setPreviewUpload(null)}
        />
      )}

      <CreateAssignmentModal
        isOpen={isCreateAssignmentOpen}
        onClose={() => setIsCreateAssignmentOpen(false)}
        onSuccess={() => {
          setIsCreateAssignmentOpen(false);
          setAssignmentRefreshTrigger((prev) => prev + 1);
        }}
        token={token}
      />
    </div>
  );
}
