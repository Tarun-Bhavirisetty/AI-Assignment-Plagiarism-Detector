"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Loader2,
  User,
  FileText,
  CheckCircle,
  AlertTriangle,
  Info,
  BarChart3,
  Columns,
  ExternalLink,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Shield,
  Hash,
  Binary,
  Layers,
  BookOpen,
  Split,
  FileCheck,
  Image as ImageIcon,
  Globe,
  Download,
  Sparkles,
} from 'lucide-react';
import api from '@/lib/api';
import OnlineSourcePanel from '@/components/OnlineSourcePanel';
import MetricDetailDrawer, { MetricType } from '@/components/MetricDetailDrawer';

interface DuplicateCompareModalProps {
  uploadId: number;
  onClose: () => void;
}

export default function DuplicateCompareModal({ uploadId, onClose }: DuplicateCompareModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [matchedPdfUrl, setMatchedPdfUrl] = useState<string | null>(null);
  const [pdfUploadId, setPdfUploadId] = useState<number | null>(null);

  // View state: 'analytics' (14 Metric Cards) | 'split' (Split Document Viewer)
  const [activeView, setActiveView] = useState<'analytics' | 'split'>('analytics');
  // Selected metric for the slide-in drawer
  const [selectedMetric, setSelectedMetric] = useState<MetricType | null>(null);
  // Current evidence record index for split viewer navigation
  const [currentEvidenceIdx, setCurrentEvidenceIdx] = useState<number>(0);

  // Evaluation workflow state
  const [userRole, setUserRole] = useState<string | null>(null);
  const [evalMarks, setEvalMarks] = useState<string>('');
  const [evalStatus, setEvalStatus] = useState<string>('Evaluation Completed');
  const [evalDecision, setEvalDecision] = useState<string>('Cleared');
  const [evalComments, setEvalComments] = useState<string>('');
  const [evalSaving, setEvalSaving] = useState(false);
  const [evalSaved, setEvalSaved] = useState(false);

  useEffect(() => {
    setData(null);
    setLoading(true);
    setUploadedPdfUrl(null);
    setMatchedPdfUrl(null);
    setPdfUploadId(null);
    setSelectedMetric(null);
    setCurrentEvidenceIdx(0);
    setUserRole(localStorage.getItem('role'));

    const fetchComparison = async () => {
      try {
        const res = await api.get(`/compare/${uploadId}`);
        setData(res.data);
      } catch (err) {
        console.error("Comparison load error:", err);
      } finally {
        setLoading(false);
      }
    };

    const fetchEvaluation = async () => {
      try {
        const res = await api.get(`/evaluations/${uploadId}`);
        if (res.data) {
          if (res.data.marks !== null && res.data.marks !== undefined) setEvalMarks(String(res.data.marks));
          if (res.data.status) setEvalStatus(res.data.status);
          if (res.data.decision) setEvalDecision(res.data.decision);
          if (res.data.comments) setEvalComments(res.data.comments);
        }
      } catch (e) {
        console.error("Evaluation fetch error:", e);
      }
    };

    fetchComparison();
    fetchEvaluation();
  }, [uploadId]);

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    setEvalSaving(true);
    setEvalSaved(false);
    try {
      await api.post(`/evaluations/${uploadId}`, {
        marks: evalMarks ? parseFloat(evalMarks) : null,
        max_marks: 100.0,
        status: evalStatus,
        decision: evalDecision,
        comments: evalComments,
      });
      setEvalSaved(true);
      setTimeout(() => setEvalSaved(false), 2500);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to save evaluation.");
    } finally {
      setEvalSaving(false);
    }
  };

  useEffect(() => {
    if (!data) return;
    if (pdfUploadId === uploadId) return;

    const isPdf =
      data?.uploaded_document?.file_name?.toLowerCase().endsWith('.pdf') ||
      data?.uploaded_file?.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      api.get(`/admin/download/highlighted/${uploadId}?type=uploaded`, { responseType: 'blob' })
        .then(res => setUploadedPdfUrl(URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))))
        .catch(err => console.error("Failed PDF Load", err));

      if (data.reference_upload_id && data.reference_document?.file_name) {
        api.get(`/admin/download/highlighted/${uploadId}?type=matched`, { responseType: 'blob' })
          .then(res => setMatchedPdfUrl(URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))))
          .catch(err => console.error("Failed Matched PDF Load", err));
      } else {
        setMatchedPdfUrl("missing");
      }
      setPdfUploadId(uploadId);
    }
  }, [data, uploadId, pdfUploadId]);

  // Derived metrics for the 14 cards
  const metricsData = useMemo(() => {
    if (!data) return null;

    const overall = data.overall_similarity !== null && data.overall_similarity !== undefined
      ? Number(data.overall_similarity)
      : null;

    const breakdown = data.breakdown || {};
    const exactMatch = breakdown["Exact Match"] ?? (data.detection_method === 'exact_hash' ? 100 : 0);
    const normalized = breakdown["Normalized Content"] ?? (data.detection_method === 'exact_content' ? 100 : 0);
    const lexical = breakdown["Lexical Similarity"] ?? 0;
    const semantic = breakdown["Semantic Similarity"] ?? 0;
    const sentence = breakdown["Sentence Similarity"] ?? 0;
    const paragraph = breakdown["Paragraph Similarity"] ?? 0;

    // Page heatmap average
    const heatmap = data.page_heatmap || [];
    const pageAvg = heatmap.length > 0
      ? heatmap.reduce((acc: number, p: any) => acc + (p.similarity || 0), 0) / heatmap.length
      : null;

    // Match statistics
    const stats = data.match_statistics || {};
    const matchedSentences = stats["Matched Sentences"] ?? 0;
    const totalSentences = stats["Total Sentences"] ?? 0;
    const matchedParagraphs = stats["Matched Paragraphs"] ?? 0;
    const totalParagraphs = stats["Total Paragraphs"] ?? 0;
    const matchedPages = stats["Matched Pages"] ?? 0;
    const totalPages = stats["Total Pages"] ?? 0;

    const hasReference = Boolean(data.reference_document?.matched_student || data.reference_upload_id);
    const fileName = data.uploaded_document?.file_name || data.uploaded_file || "";
    const isImageFile = /\.(png|jpe?g|webp|bmp|gif)$/i.test(fileName);

    return {
      overall,
      exactMatch,
      normalized,
      lexical,
      semantic,
      sentence,
      paragraph,
      pageAvg,
      isImageFile,
      matchedSentences,
      totalSentences,
      matchedParagraphs,
      totalParagraphs,
      matchedPages,
      totalPages,
      hasReference,
    };
  }, [data]);

  // Helper function to get badge/border color based on score
  const getSeverityStyle = (score: number | null, isInverse = false) => {
    if (score === null || score === undefined || score < 0) {
      return {
        badge: "bg-muted text-muted-foreground border-border",
        bar: "bg-muted-foreground/30",
        text: "text-muted-foreground",
        label: "Unavailable",
      };
    }
    if (score >= 90) {
      return {
        badge: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
        bar: "bg-red-500",
        text: "text-red-600 dark:text-red-400",
        label: "Critical Match",
      };
    }
    if (score >= 60) {
      return {
        badge: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
        bar: "bg-yellow-500",
        text: "text-yellow-600 dark:text-yellow-400",
        label: "High Overlap",
      };
    }
    if (score >= 25) {
      return {
        badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
        bar: "bg-orange-500",
        text: "text-orange-600 dark:text-orange-400",
        label: "Moderate Overlap",
      };
    }
    return {
      badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      bar: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      label: "Clean / Low",
    };
  };

  const isAcademicStaff = userRole === 'evaluator' || userRole === 'faculty' || userRole === 'hod' || userRole === 'admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-background/80 backdrop-blur-md">
      <div className="bg-card text-card-foreground w-full max-w-[1440px] h-[94vh] rounded-2xl border border-border flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-border flex items-center justify-between bg-muted/30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2">
                Document Plagiarism Analysis
                {data?.uploaded_document?.section_name && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                    {data.uploaded_document.section_name}
                  </span>
                )}
              </h2>
              <p className="text-xs text-muted-foreground truncate max-w-md">
                {data?.uploaded_document?.file_name || data?.uploaded_file || `Upload #${uploadId}`}
                {data?.uploaded_document?.student_name && ` · ${data.uploaded_document.student_name}`}
              </p>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 bg-muted rounded-xl border border-border">
              <button
                onClick={() => setActiveView('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeView === 'analytics'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Interactive Analysis</span>
              </button>
              <button
                onClick={() => setActiveView('split')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeView === 'split'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Columns className="w-4 h-4" />
                <span>Split Document Viewer</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl border border-border transition-colors ml-2"
              title="Close modal (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading comprehensive analysis & evidence...</p>
            </div>
          ) : !data ? (
            <div className="flex-1 flex items-center justify-center text-destructive">
              Failed to load comparison data.
            </div>
          ) : (
            <>
              {/* TAB 1: INTERACTIVE ANALYTICS DASHBOARD */}
              {activeView === 'analytics' && (
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                  
                  {/* Top Hero Banner */}
                  <div className="bg-gradient-to-r from-muted/50 via-card to-muted/40 border border-border rounded-2xl p-4 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-sm">
                    <div className="flex items-center gap-5">
                      {/* Big Circular / Radial Gauge Indicator */}
                      <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-card border border-border shadow-inner p-3 shrink-0">
                        <div className="text-center">
                          <span className={`text-3xl font-black block leading-none ${
                            metricsData?.overall === null ? 'text-muted-foreground' :
                            metricsData!.overall >= 90 ? 'text-red-500' :
                            metricsData!.overall >= 60 ? 'text-yellow-500' :
                            metricsData!.overall >= 25 ? 'text-orange-500' :
                            'text-emerald-500'
                          }`}>
                            {metricsData?.overall !== null && metricsData?.overall !== undefined
                              ? `${metricsData.overall.toFixed(0)}%`
                              : 'N/A'}
                          </span>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mt-1 block">
                            Similarity
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-lg font-bold">
                            {data.uploaded_document?.assignment_title || "Assignment Submission"}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                            getSeverityStyle(metricsData?.overall ?? null).badge
                          }`}>
                            {getSeverityStyle(metricsData?.overall ?? null).label}
                          </span>
                          {data.detection_method && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                              {data.detection_method === 'exact_hash' ? 'Binary Hash Match' :
                               data.detection_method === 'exact_content' ? 'Normalized Content Match' :
                               data.detection_method === 'hybrid_st_tfidf' ? 'Hybrid AI (Transformer + TF-IDF)' :
                               data.detection_method === 'clean_verified' ? 'Verified Clean (Original)' :
                               data.detection_method === 'fallback_tfidf' ? 'Lexical TF-IDF' :
                               data.detection_method}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
                          <span>
                            <strong>Uploaded by:</strong> {data.uploaded_document?.student_name || "Student"}
                          </span>
                          <span>•</span>
                          <span>
                            <strong>Reference match:</strong>{" "}
                            {data.reference_document?.matched_student ? (
                              <span className="text-primary font-semibold">
                                {data.reference_document.matched_student} ({data.reference_document.section_name || "Internal DB"})
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">No Direct Internal Reference</span>
                            )}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground/90 max-w-2xl leading-relaxed">
                          {data.detection_method === 'exact_hash'
                            ? 'Critical duplicate: Binary-identical document hash matches an existing submission in the database.'
                            : data.detection_method === 'exact_content'
                            ? 'Critical match: Normalized content is 100% identical after formatting and whitespace normalization.'
                            : metricsData?.overall !== null && metricsData!.overall >= 80
                            ? 'Significant structural overlap and contextual semantic similarity identified across sentences and paragraphs.'
                            : metricsData?.overall !== null && metricsData!.overall >= 40
                            ? 'Moderate similarity detected. Portions of this submission share substantial lexical or semantic alignment.'
                            : 'Clean submission: No significant similarity detected across internal submissions.'}
                        </p>
                      </div>
                    </div>

                    {/* Quick Action Button to Split Viewer */}
                    <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
                      <button
                        onClick={() => setActiveView('split')}
                        className="px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 group"
                      >
                        <span>Open Split Document Viewer</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>

                  {/* 14 Interactive Metric Cards Section */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                          Comprehensive Similarity Metrics (14 Categories)
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Click any card to inspect full deep evidence, matched excerpts, and token alignments.
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        14 Active Analysis Dimensions
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      
                      {/* CARD 1: Overall Similarity */}
                      <MetricCard
                        title="1. Overall Similarity"
                        subtitle="Composite weighted score across all engines"
                        value={metricsData?.overall !== null ? `${metricsData!.overall.toFixed(0)}%` : "N/A"}
                        score={metricsData?.overall ?? null}
                        icon={<Shield className="w-5 h-5 text-indigo-500" />}
                        onClick={() => setSelectedMetric('overall')}
                      />

                      {/* CARD 2: Exact Match */}
                      <MetricCard
                        title="2. Exact Match"
                        subtitle="Binary SHA-256 hash identical check"
                        value={`${metricsData?.exactMatch.toFixed(0)}%`}
                        score={metricsData?.exactMatch ?? 0}
                        icon={<Hash className="w-5 h-5 text-red-500" />}
                        onClick={() => setSelectedMetric('exact_match')}
                      />

                      {/* CARD 3: Normalized Text */}
                      <MetricCard
                        title="3. Normalized Content"
                        subtitle="Stripped case, whitespace & punctuation"
                        value={`${metricsData?.normalized.toFixed(0)}%`}
                        score={metricsData?.normalized ?? 0}
                        icon={<Binary className="w-5 h-5 text-amber-500" />}
                        onClick={() => setSelectedMetric('normalized_text')}
                      />

                      {/* CARD 4: Lexical Similarity */}
                      <MetricCard
                        title="4. Lexical Similarity"
                        subtitle="TF-IDF n-gram token overlap"
                        value={`${metricsData?.lexical.toFixed(0)}%`}
                        score={metricsData?.lexical ?? 0}
                        icon={<Layers className="w-5 h-5 text-blue-500" />}
                        onClick={() => setSelectedMetric('lexical')}
                      />

                      {/* CARD 5: Semantic Similarity */}
                      <MetricCard
                        title="5. Semantic Similarity"
                        subtitle="Transformer embedding contextual match"
                        value={`${metricsData?.semantic.toFixed(0)}%`}
                        score={metricsData?.semantic ?? 0}
                        icon={<Sparkles className="w-5 h-5 text-purple-500" />}
                        onClick={() => setSelectedMetric('semantic')}
                      />

                      {/* CARD 6: Sentence Similarity */}
                      <MetricCard
                        title="6. Sentence Similarity"
                        subtitle="Cross-sentence alignment & match ratio"
                        value={`${metricsData?.sentence.toFixed(0)}%`}
                        score={metricsData?.sentence ?? 0}
                        icon={<Split className="w-5 h-5 text-pink-500" />}
                        onClick={() => setSelectedMetric('sentence')}
                      />

                      {/* CARD 7: Paragraph Similarity */}
                      <MetricCard
                        title="7. Paragraph Similarity"
                        subtitle="Structural block & paragraph alignment"
                        value={`${metricsData?.paragraph.toFixed(0)}%`}
                        score={metricsData?.paragraph ?? 0}
                        icon={<BookOpen className="w-5 h-5 text-cyan-500" />}
                        onClick={() => setSelectedMetric('paragraph')}
                      />

                      {/* CARD 8: Page Similarity */}
                      <MetricCard
                        title="8. Page Similarity"
                        subtitle="Page-by-page heatmap average"
                        value={metricsData?.pageAvg !== null ? `${metricsData!.pageAvg.toFixed(0)}%` : "N/A"}
                        score={metricsData?.pageAvg ?? null}
                        icon={<FileCheck className="w-5 h-5 text-teal-500" />}
                        onClick={() => setSelectedMetric('page')}
                      />

                      {/* CARD 9: Image Similarity */}
                      <MetricCard
                        title="9. Image Similarity"
                        subtitle="Perceptual hash (pHash) visual check"
                        value={metricsData?.isImageFile ? "Analyzed" : "N/A (Text)"}
                        score={0}
                        customSeverityBadge={
                          metricsData?.isImageFile
                            ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                            : "bg-muted text-muted-foreground border-border"
                        }
                        customSeverityLabel={metricsData?.isImageFile ? "Image Asset" : "Text Document"}
                        icon={<ImageIcon className="w-5 h-5 text-emerald-500" />}
                        onClick={() => setSelectedMetric('image')}
                      />

                      {/* CARD 10: Matched Sentences */}
                      <MetricCard
                        title="10. Matched Sentences"
                        subtitle="High-confidence sentence pairs"
                        value={`${metricsData?.matchedSentences} / ${metricsData?.totalSentences}`}
                        score={
                          metricsData?.totalSentences && metricsData.totalSentences > 0
                            ? (metricsData.matchedSentences / metricsData.totalSentences) * 100
                            : 0
                        }
                        icon={<FileText className="w-5 h-5 text-indigo-400" />}
                        onClick={() => setSelectedMetric('matched_sentences')}
                      />

                      {/* CARD 11: Matched Paragraphs */}
                      <MetricCard
                        title="11. Matched Paragraphs"
                        subtitle="Overlapping paragraph blocks"
                        value={`${metricsData?.matchedParagraphs} / ${metricsData?.totalParagraphs}`}
                        score={
                          metricsData?.totalParagraphs && metricsData.totalParagraphs > 0
                            ? (metricsData.matchedParagraphs / metricsData.totalParagraphs) * 100
                            : 0
                        }
                        icon={<Layers className="w-5 h-5 text-violet-400" />}
                        onClick={() => setSelectedMetric('matched_paragraphs')}
                      />

                      {/* CARD 12: Matched Pages */}
                      <MetricCard
                        title="12. Matched Pages"
                        subtitle="Pages containing overlap > 40%"
                        value={`${metricsData?.matchedPages} / ${metricsData?.totalPages}`}
                        score={
                          metricsData?.totalPages && metricsData.totalPages > 0
                            ? (metricsData.matchedPages / metricsData.totalPages) * 100
                            : 0
                        }
                        icon={<FileCheck className="w-5 h-5 text-amber-500" />}
                        onClick={() => setSelectedMetric('matched_pages')}
                      />

                      {/* CARD 13: Internal Submission Matches */}
                      <MetricCard
                        title="13. Internal Matches"
                        subtitle="Cross-matched submissions in institution"
                        value={metricsData?.hasReference ? "1 Match Found" : "0 Matches"}
                        score={metricsData?.hasReference ? (metricsData?.overall ?? 80) : 0}
                        customSeverityBadge={
                          metricsData?.hasReference
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        }
                        customSeverityLabel={metricsData?.hasReference ? "Reference Linked" : "Unique Submission"}
                        icon={<User className="w-5 h-5 text-sky-500" />}
                        onClick={() => setSelectedMetric('internal_matches')}
                      />

                      {/* CARD 14: Potential Online Sources */}
                      <MetricCard
                        title="14. Online Sources"
                        subtitle="Tavily live web crawler & index scan"
                        value="Web Scan"
                        score={null}
                        customSeverityBadge="bg-primary/10 text-primary border-primary/20"
                        customSeverityLabel="Tavily Discovery"
                        icon={<Globe className="w-5 h-5 text-primary" />}
                        onClick={() => setSelectedMetric('online_sources')}
                      />
                    </div>
                  </div>

                  {/* AI Summary Box & Academic Evaluation Form */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                    
                    {/* Left: AI Plagiarism Summary Box */}
                    <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-border pb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <h4 className="text-sm font-bold tracking-tight">AI Plagiarism Evaluation Summary</h4>
                        </div>
                        <span className="text-xs text-muted-foreground">Automated Analysis</span>
                      </div>

                      <div className="text-xs text-foreground/90 space-y-3 leading-relaxed">
                        <p className="p-3.5 rounded-xl bg-muted/40 border border-border">
                          {data.detection_method === 'exact_hash'
                            ? 'Binary-identical file copy detected. Both submissions share the exact same cryptographic hash.'
                            : data.detection_method === 'exact_content'
                            ? 'Normalized text is 100% identical. The documents share identical prose, potentially exported with different formatting.'
                            : metricsData?.overall !== null && metricsData!.overall >= 80
                            ? `High similarity detected (${metricsData!.overall.toFixed(0)}%). The submission shares substantial textual, sentence, and structural overlaps with the reference document.`
                            : metricsData?.overall !== null && metricsData!.overall >= 50
                            ? `Moderate similarity detected (${metricsData!.overall.toFixed(0)}%). Multiple shared phrases and paraphrased sections were identified.`
                            : `Low similarity detected (${metricsData?.overall !== null ? metricsData!.overall.toFixed(0) : '0'}%). The documents appear largely independent.`}
                        </p>

                        {data.ai_summary?.copied?.length > 0 && (
                          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300">
                            <strong>High Similarity Sections:</strong> {data.ai_summary.copied.join(", ")}
                          </div>
                        )}
                        {data.ai_summary?.similar?.length > 0 && (
                          <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                            <strong>Paraphrased / Overlapping Sections:</strong> {data.ai_summary.similar.join(", ")}
                          </div>
                        )}
                      </div>

                      {/* Embedded Online Source Panel */}
                      <div className="pt-2">
                        <OnlineSourcePanel uploadId={uploadId} />
                      </div>
                    </div>

                    {/* Right: Academic Evaluation Form (for Evaluator / Faculty / HOD / Admin) */}
                    <div className="bg-card border border-border rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                            <h4 className="text-sm font-bold tracking-tight">Academic Evaluation</h4>
                          </div>
                          {evalSaved && (
                            <span className="text-xs text-emerald-500 flex items-center gap-1 font-semibold">
                              <CheckCircle className="w-3.5 h-3.5" /> Saved
                            </span>
                          )}
                        </div>

                        {isAcademicStaff ? (
                          <form onSubmit={handleSaveEvaluation} className="space-y-3.5 text-xs">
                            <div>
                              <label className="text-muted-foreground block mb-1 font-medium">Marks Awarded (out of 100)</label>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="100"
                                placeholder="e.g. 85"
                                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                value={evalMarks}
                                onChange={(e) => setEvalMarks(e.target.value)}
                              />
                            </div>

                            <div>
                              <label className="text-muted-foreground block mb-1 font-medium">Review Status</label>
                              <select
                                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                value={evalStatus}
                                onChange={(e) => setEvalStatus(e.target.value)}
                              >
                                <option value="Ready for Review">Ready for Review</option>
                                <option value="Under Review">Under Review</option>
                                <option value="Evaluation Completed">Evaluation Completed</option>
                                <option value="Requires Further Review">Requires Further Review</option>
                              </select>
                            </div>

                            <div>
                              <label className="text-muted-foreground block mb-1 font-medium">Academic Integrity Decision</label>
                              <select
                                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                value={evalDecision}
                                onChange={(e) => setEvalDecision(e.target.value)}
                              >
                                <option value="Cleared">Cleared (Original Work)</option>
                                <option value="Needs Revision">Needs Revision</option>
                                <option value="Academic Overlap Flagged">Academic Overlap Flagged</option>
                              </select>
                            </div>

                            <div>
                              <label className="text-muted-foreground block mb-1 font-medium">Academic Remarks & Feedback</label>
                              <textarea
                                rows={3}
                                placeholder="Detailed constructive remarks for student..."
                                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                                value={evalComments}
                                onChange={(e) => setEvalComments(e.target.value)}
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={evalSaving}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all flex items-center justify-center shadow-md gap-1.5 mt-2 disabled:opacity-50"
                            >
                              {evalSaving ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Saving Review...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span>Save Evaluation & Remarks</span>
                                </>
                              )}
                            </button>
                          </form>
                        ) : (
                          <div className="p-4 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground space-y-2">
                            <p className="font-semibold text-foreground">Current Evaluation Record</p>
                            <p><strong>Marks:</strong> {evalMarks ? `${evalMarks} / 100` : "Not evaluated yet"}</p>
                            <p><strong>Status:</strong> {evalStatus}</p>
                            <p><strong>Decision:</strong> {evalDecision}</p>
                            {evalComments && (
                              <p className="pt-1 border-t border-border mt-1">
                                <strong>Feedback:</strong> {evalComments}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Modal Footer info */}
                      <div className="pt-4 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>Role: <strong className="capitalize text-foreground">{userRole || "Student"}</strong></span>
                        <span className="text-emerald-500 font-semibold">MetaGuard AI v2.5</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SPLIT DOCUMENT VIEWER */}
              {activeView === 'split' && (() => {
                const evidenceRecords = data?.evidence_records || [];
                const currentEv = evidenceRecords[currentEvidenceIdx] || null;
                const uploadPdfPageUrl = uploadedPdfUrl && currentEv?.uploaded_page
                  ? `${uploadedPdfUrl}#page=${currentEv.uploaded_page}`
                  : uploadedPdfUrl;
                const matchedPdfPageUrl = matchedPdfUrl && matchedPdfUrl !== "missing" && currentEv?.reference_page
                  ? `${matchedPdfUrl}#page=${currentEv.reference_page}`
                  : matchedPdfUrl;

                return (
                  <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
                    {/* Evidence Navigation & Legend Header */}
                    <div className="px-5 py-2.5 bg-card border-b border-border flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
                      {/* Evidence Color Legend */}
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Highlight Legend:</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/> Exact Match (Red)</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"/> Paraphrase (Yellow)</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"/> Moderate (Orange)</span>
                      </div>

                      {/* Matched Sentence Navigator */}
                      {evidenceRecords.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            Sentence <span className="font-bold text-foreground">{currentEvidenceIdx + 1}</span> of {evidenceRecords.length}
                            {currentEv?.uploaded_page ? ` (Page ${currentEv.uploaded_page})` : ""}
                          </span>
                          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-muted/50">
                            <button
                              type="button"
                              onClick={() => setCurrentEvidenceIdx((prev) => Math.max(0, prev - 1))}
                              disabled={currentEvidenceIdx === 0}
                              className="p-1 hover:bg-card rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                              title="Previous Matched Sentence"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCurrentEvidenceIdx((prev) => Math.min(evidenceRecords.length - 1, prev + 1))}
                              disabled={currentEvidenceIdx >= evidenceRecords.length - 1}
                              className="p-1 hover:bg-card rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                              title="Next Matched Sentence"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-[11px]">No matching sentences in evidence index</span>
                      )}
                    </div>

                    {/* Active Match Snippet Bar */}
                    {currentEv && (
                      <div className="px-5 py-2 bg-muted/40 border-b border-border/80 flex items-center justify-between text-xs shrink-0 gap-4">
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            currentEv.color === "red" ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20" :
                            currentEv.color === "yellow" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20" :
                            "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                          }`}>
                            {currentEv.match_type || "Match"} {currentEv.score ? `(${Math.round(currentEv.score)}%)` : ""}
                          </span>
                          <span className="text-foreground truncate font-medium italic">
                            &ldquo;{currentEv.matched_sentence}&rdquo;
                          </span>
                        </div>
                        <span className="text-muted-foreground text-[11px] shrink-0 font-mono">
                          {currentEv.location_status || `Page ${currentEv.uploaded_page}`}
                        </span>
                      </div>
                    )}

                    {/* Two-Column Split Document Viewer */}
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                      {/* Left Column: Reference Document */}
                      <div className="flex-1 border-r border-border flex flex-col overflow-hidden">
                        <div className="px-4 py-3 border-b border-border bg-muted/40 text-sm flex justify-between items-center gap-2 shrink-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-muted-foreground text-xs uppercase font-bold">Reference Match:</span>
                              {data.reference_document?.matched_student ? (
                                <span className="font-semibold text-primary">{data.reference_document.matched_student}</span>
                              ) : (
                                <span className="font-semibold text-muted-foreground italic">No Match Found</span>
                              )}
                              {data.reference_document?.section_name && (
                                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                                  {data.reference_document.section_name}
                                </span>
                              )}
                              {data.reference_document?.assignment_title && (
                                <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={data.reference_document.assignment_title}>
                                  {data.reference_document.assignment_title}
                                </span>
                              )}
                            </div>
                            {data.reference_document?.file_name && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5" title={data.reference_document.file_name}>
                                {data.reference_document.file_name}
                                {data.reference_document.upload_time && ` · ${data.reference_document.upload_time}`}
                              </p>
                            )}
                          </div>

                          {data.reference_upload_id && (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await api.get(`/admin/download/${data.reference_upload_id}`, { responseType: 'blob' });
                                  const url = window.URL.createObjectURL(new Blob([res.data]));
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.setAttribute('download', data.reference_document?.file_name || 'reference_doc');
                                  document.body.appendChild(link);
                                  link.click();
                                  link.remove();
                                } catch (err: any) {
                                  alert(err.response?.data?.detail || "Download failed");
                                }
                              }}
                              className="px-2.5 py-1.5 bg-card hover:bg-muted text-xs font-semibold text-foreground rounded-lg border border-border flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                              title="Download Reference Document"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>
                          )}
                        </div>

                        <div className="flex-1 p-3 overflow-hidden bg-background">
                          {data.uploaded_document?.file_name?.toLowerCase().endsWith('.pdf') || data.uploaded_file?.toLowerCase().endsWith('.pdf') ? (
                            !data.reference_upload_id || !data.reference_document?.file_name ? (
                              <div className="flex flex-col h-full items-center justify-center text-muted-foreground space-y-2 p-6 text-center">
                                <CheckCircle className="w-10 h-10 text-emerald-500" />
                                <p className="text-sm font-bold text-foreground">Verified Independent Submission</p>
                                <p className="text-xs max-w-xs text-muted-foreground">
                                  No matching peer reference document was detected in the repository. All content is verified clean and original.
                                </p>
                              </div>
                            ) : matchedPdfUrl === "missing" ? (
                              <div className="flex h-full items-center justify-center text-destructive text-sm font-semibold">
                                Reference Document Unavailable
                              </div>
                            ) : matchedPdfPageUrl ? (
                              <iframe src={matchedPdfPageUrl} className="w-full h-full rounded-xl border border-border bg-white" title="Reference Document Preview" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-muted-foreground">
                                <Loader2 className="w-6 h-6 animate-spin mr-2 text-primary" />
                                <span>Loading Reference PDF...</span>
                              </div>
                            )
                          ) : (
                            !data.reference_document?.file_name ? (
                              <div className="flex flex-col h-full items-center justify-center text-muted-foreground space-y-2 p-6 text-center">
                                <CheckCircle className="w-10 h-10 text-emerald-500" />
                                <p className="text-sm font-bold text-foreground">Verified Independent Submission</p>
                                <p className="text-xs max-w-xs text-muted-foreground">
                                  No matching peer reference document was detected in the repository.
                                </p>
                              </div>
                            ) : (
                              <div className="bg-card border border-border p-6 rounded-xl h-full overflow-y-auto text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                                {data.matched_highlighted?.map((chunk: any, i: number) => (
                                  <span
                                    key={i}
                                    className={`mr-1 px-1 rounded transition-colors ${
                                      chunk.color === 'red' ? 'bg-red-500/20 text-red-700 dark:text-red-300 font-medium' :
                                      chunk.color === 'yellow' ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' :
                                      chunk.color === 'orange' ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                                      'bg-transparent'
                                    }`}
                                  >
                                    {chunk.text}
                                  </span>
                                ))}
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      {/* Right Column: Uploaded Document */}
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="px-4 py-3 border-b border-border bg-muted/40 text-sm flex justify-between items-center gap-2 shrink-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-muted-foreground text-xs uppercase font-bold">Uploaded Submission:</span>
                              <span className="font-semibold text-foreground truncate max-w-[180px]" title={data.uploaded_document?.file_name || data.uploaded_file}>
                                {data.uploaded_document?.file_name || data.uploaded_file}
                              </span>
                              {data.uploaded_document?.section_name && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                                  {data.uploaded_document.section_name}
                                </span>
                              )}
                              {data.uploaded_document?.assignment_title && (
                                <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={data.uploaded_document.assignment_title}>
                                  {data.uploaded_document.assignment_title}
                                </span>
                              )}
                            </div>
                            {data.uploaded_document?.upload_time && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Submitted: {data.uploaded_document.upload_time}
                              </p>
                            )}
                          </div>

                          {data.uploaded_document?.id && (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await api.get(`/admin/download/${data.uploaded_document.id}`, { responseType: 'blob' });
                                  const url = window.URL.createObjectURL(new Blob([res.data]));
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.setAttribute('download', data.uploaded_document?.file_name || 'uploaded_doc');
                                  document.body.appendChild(link);
                                  link.click();
                                  link.remove();
                                } catch (err: any) {
                                  alert(err.response?.data?.detail || "Download failed");
                                }
                              }}
                              className="px-2.5 py-1.5 bg-card hover:bg-muted text-xs font-semibold text-foreground rounded-lg border border-border flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                              title="Download Uploaded Document"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>
                          )}
                        </div>

                        <div className="flex-1 p-3 overflow-hidden bg-background">
                          {data.uploaded_document?.file_name?.toLowerCase().endsWith('.pdf') || data.uploaded_file?.toLowerCase().endsWith('.pdf') ? (
                            uploadPdfPageUrl ? (
                              <iframe src={uploadPdfPageUrl} className="w-full h-full rounded-xl border border-border bg-white" title="Uploaded Document Preview" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-muted-foreground">
                                <Loader2 className="w-6 h-6 animate-spin mr-2 text-primary" />
                                <span>Loading Uploaded PDF...</span>
                              </div>
                            )
                          ) : (
                            <div className="bg-card border border-border p-6 rounded-xl h-full overflow-y-auto text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                              {data.uploaded_highlighted?.map((chunk: any, i: number) => (
                                <span
                                  key={i}
                                  className={`mr-1 px-1 rounded transition-colors ${
                                    chunk.color === 'red' ? 'bg-red-500/20 text-red-700 dark:text-red-300 font-medium' :
                                    chunk.color === 'yellow' ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' :
                                    chunk.color === 'orange' ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                                    'bg-transparent'
                                  }`}
                                >
                                  {chunk.text}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* Slide-In Deep Evidence Metric Drawer */}
          {selectedMetric && (
            <MetricDetailDrawer
              metric={selectedMetric}
              data={data}
              onClose={() => setSelectedMetric(null)}
              onSelectMetric={(m) => setSelectedMetric(m)}
              onOpenSplitViewer={() => {
                setSelectedMetric(null);
                setActiveView('split');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Reusable Clickable Metric Card Component
interface MetricCardProps {
  title: string;
  subtitle: string;
  value: string;
  score: number | null;
  icon: React.ReactNode;
  onClick: () => void;
  customSeverityBadge?: string;
  customSeverityLabel?: string;
}

function MetricCard({
  title,
  subtitle,
  value,
  score,
  icon,
  onClick,
  customSeverityBadge,
  customSeverityLabel,
}: MetricCardProps) {
  // Severity calculations
  const getSeverity = (val: number | null) => {
    if (val === null || val === undefined || val < 0) {
      return {
        badge: "bg-muted text-muted-foreground border-border",
        bar: "bg-muted-foreground/30",
        label: "Unavailable",
      };
    }
    if (val >= 80) {
      return {
        badge: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
        bar: "bg-red-500",
        label: "Critical",
      };
    }
    if (val >= 50) {
      return {
        badge: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
        bar: "bg-yellow-500",
        label: "High",
      };
    }
    if (val >= 25) {
      return {
        badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
        bar: "bg-orange-500",
        label: "Moderate",
      };
    }
    return {
      badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      bar: "bg-emerald-500",
      label: "Clean",
    };
  };

  const severity = getSeverity(score);
  const badgeClass = customSeverityBadge || severity.badge;
  const badgeLabel = customSeverityLabel || severity.label;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      className="group bg-card border border-border hover:border-primary/50 hover:shadow-lg rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between relative overflow-hidden"
    >
      {/* Top row: Icon + Severity Badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-xl bg-muted/60 border border-border group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      {/* Middle row: Title + Subtitle */}
      <div className="space-y-1 mb-3">
        <h5 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
          <span>{title}</span>
        </h5>
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
          {subtitle}
        </p>
      </div>

      {/* Score Value + Visual Bar */}
      <div className="pt-2 border-t border-border/60">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xl font-black text-foreground tracking-tight">
            {value}
          </span>
          <span className="text-[11px] font-semibold text-primary flex items-center gap-0.5 opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
            Inspect <ChevronRight className="w-3 h-3" />
          </span>
        </div>

        {/* Mini progress bar for percentage metrics */}
        {score !== null && score >= 0 && (
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${severity.bar} transition-all duration-500 rounded-full`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
