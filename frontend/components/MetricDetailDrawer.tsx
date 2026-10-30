"use client";

import React, { useEffect } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileText,
  Hash,
  Binary,
  Layers,
  BookOpen,
  Split,
  FileCheck,
  Image,
  Globe,
  ExternalLink,
  Download,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react";
import OnlineSourcePanel from "./OnlineSourcePanel";

export type MetricType =
  | "overall"
  | "exact_match"
  | "normalized_text"
  | "lexical"
  | "semantic"
  | "sentence"
  | "paragraph"
  | "page"
  | "image"
  | "matched_sentences"
  | "matched_paragraphs"
  | "matched_pages"
  | "internal_matches"
  | "online_sources";

interface MetricDetailDrawerProps {
  metric: MetricType;
  data: any;
  onClose: () => void;
  onSelectMetric: (metric: MetricType) => void;
  onOpenSplitViewer: () => void;
}

const METRIC_ORDER: MetricType[] = [
  "overall",
  "exact_match",
  "normalized_text",
  "lexical",
  "semantic",
  "sentence",
  "paragraph",
  "page",
  "image",
  "matched_sentences",
  "matched_paragraphs",
  "matched_pages",
  "internal_matches",
  "online_sources",
];

const METRIC_TITLES: Record<MetricType, string> = {
  overall: "Overall Similarity Analysis",
  exact_match: "Exact Match (SHA-256 Check)",
  normalized_text: "Normalized Content Similarity",
  lexical: "Lexical & Token Overlap Analysis",
  semantic: "Deep Semantic Embedding Similarity",
  sentence: "Sentence-Level Similarity Breakdown",
  paragraph: "Paragraph-Level Similarity Breakdown",
  page: "Page-by-Page Similarity Heatmap",
  image: "Image & Visual Perceptual Hashing",
  matched_sentences: "Matched Sentences Inventory",
  matched_paragraphs: "Matched Paragraphs Inventory",
  matched_pages: "Matched Pages Breakdown",
  internal_matches: "Internal Submission References",
  online_sources: "Potential Online Sources (Tavily)",
};

export default function MetricDetailDrawer({
  metric,
  data,
  onClose,
  onSelectMetric,
  onOpenSplitViewer,
}: MetricDetailDrawerProps) {
  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const currentIndex = METRIC_ORDER.indexOf(metric);
  const prevMetric = currentIndex > 0 ? METRIC_ORDER[currentIndex - 1] : null;
  const nextMetric = currentIndex < METRIC_ORDER.length - 1 ? METRIC_ORDER[currentIndex + 1] : null;

  const overallScore = data.overall_similarity !== null && data.overall_similarity !== undefined ? Number(data.overall_similarity) : null;
  const breakdown = data.breakdown || {};
  const stats = data.match_statistics || {};
  const heatmap = data.page_heatmap || [];
  const uploadedHighlighted = data.uploaded_highlighted || [];
  const matchedHighlighted = data.matched_highlighted || [];

  // Filter high & medium matched sentences
  const flaggedSentences = uploadedHighlighted.filter(
    (item: any) => item.color === "red" || item.color === "yellow" || item.color === "orange"
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all duration-300">
      {/* Click outside to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Container */}
      <div className="w-full max-w-2xl bg-card border-l border-border h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-250 text-foreground">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Metric #{currentIndex + 1} of 14
            </span>
            <h3 className="text-lg font-bold text-foreground truncate">{METRIC_TITLES[metric]}</h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => prevMetric && onSelectMetric(prevMetric)}
              disabled={!prevMetric}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted transition-colors"
              title="Previous metric"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => nextMetric && onSelectMetric(nextMetric)}
              disabled={!nextMetric}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted transition-colors"
              title="Next metric"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 ml-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Close panel (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {/* ================= 1. OVERALL SIMILARITY ================= */}
          {metric === "overall" && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Aggregated Similarity Score</p>
                  <p
                    className={`text-4xl font-extrabold mt-1 ${
                      overallScore === null
                        ? "text-muted-foreground"
                        : overallScore >= 60
                        ? "text-red-500"
                        : overallScore >= 30
                        ? "text-amber-500"
                        : "text-emerald-500"
                    }`}
                  >
                    {overallScore !== null ? `${overallScore.toFixed(0)}%` : "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.detection_method === "exact_hash"
                      ? "Binary Exact Copy (Identical byte-for-byte)"
                      : data.detection_method === "exact_content"
                      ? "Content Exact Copy (Identical normalized text)"
                      : data.detection_method === "hybrid_st_tfidf"
                      ? "Neural Semantic + Lexical Model"
                      : data.detection_method === "fallback_tfidf"
                      ? "Lexical N-Gram Model"
                      : "First/Reference Upload"}
                  </p>
                </div>
                <div className="text-right">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 capitalize">
                    {data.duplicate_type || "Analyzed"}
                  </span>
                </div>
              </div>

              {/* Weighting formula */}
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-primary" />
                  <span>Aggregation Formula & Weighting</span>
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  MetaGuard calculates the authoritative overall similarity using a multi-layer aggregation formula:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground">Sentence Similarity:</span>{" "}
                    <strong className="text-foreground">40%</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground">Paragraph Similarity:</span>{" "}
                    <strong className="text-foreground">35%</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground">Normalized Content:</span>{" "}
                    <strong className="text-foreground">15%</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground">Lexical Overlap:</span>{" "}
                    <strong className="text-foreground">10%</strong>
                  </div>
                </div>
              </div>

              {/* Summary note */}
              {data.ai_summary && (
                <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Analysis Summary</h4>
                  <p className="text-xs text-foreground/90 leading-relaxed italic">
                    {overallScore !== null && overallScore >= 90
                      ? `Very high textual overlap detected (${overallScore.toFixed(0)}%). The submission closely matches the reference document across sentences, paragraphs, and content.`
                      : overallScore !== null && overallScore >= 60
                      ? `Significant similarity detected (${overallScore.toFixed(0)}%). Substantial portions match or paraphrase the reference document.`
                      : overallScore !== null && overallScore >= 30
                      ? `Moderate similarity detected (${overallScore.toFixed(0)}%). Some sections overlap with the reference document.`
                      : "Low similarity detected. The document appears largely independent."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ================= 2. EXACT MATCH ================= */}
          {metric === "exact_match" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Binary SHA-256 Hash Match</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {breakdown["Exact Match"] !== undefined ? `${breakdown["Exact Match"].toFixed(0)}%` : "0%"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <Hash className="w-6 h-6" />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">Exact Binary Hash Verification:</strong> MetaGuard computes the cryptographic SHA-256 checksum of every uploaded file at upload time.
                </p>
                <p>
                  If two files produce identical SHA-256 hashes, they are 100% bit-for-bit exact copies. If the files have different hashes but identical content, the Normalized Content analyzer detects them.
                </p>
              </div>

              {breakdown["Exact Match"] === 100 ? (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Cryptographic exact file match confirmed. Both files share identical binary hashes.</span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>No exact binary duplicate hash detected. Files differ at the binary level.</span>
                </div>
              )}
            </div>
          )}

          {/* ================= 3. NORMALIZED TEXT ================= */}
          {metric === "normalized_text" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Normalized Character 4-Gram Overlap</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {breakdown["Normalized Content"] !== undefined ? `${breakdown["Normalized Content"].toFixed(0)}%` : "N/A"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <FileCheck className="w-6 h-6" />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">Text Normalization Engine:</strong> Text is stripped of punctuation, whitespace variations, invisible zero-width characters, and converted to lowercase.
                </p>
                <p>
                  This analyzer computes character 4-gram sliding window intersections, detecting copy-pasted content even if fonts, spacing, or paragraph layouts have been modified.
                </p>
              </div>
            </div>
          )}

          {/* ================= 4. LEXICAL SIMILARITY ================= */}
          {metric === "lexical" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">TF-IDF Lexical Similarity</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {breakdown["Lexical Similarity"] !== undefined ? `${breakdown["Lexical Similarity"].toFixed(0)}%` : "N/A"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <BookOpen className="w-6 h-6" />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">Lexical Token Matching:</strong> Evaluates word token overlap, term frequency-inverse document frequency (TF-IDF), and n-gram overlap between both submissions.
                </p>
                <p>
                  High lexical similarity indicates direct vocabulary sharing, identical phrasing, or unoriginal technical wording.
                </p>
              </div>
            </div>
          )}

          {/* ================= 5. SEMANTIC SIMILARITY ================= */}
          {metric === "semantic" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Neural Embedding Similarity</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {breakdown["Semantic Similarity"] !== undefined && breakdown["Semantic Similarity"] >= 0
                      ? `${breakdown["Semantic Similarity"].toFixed(0)}%`
                      : "N/A"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <Binary className="w-6 h-6" />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">AI Semantic Model:</strong> Uses deep dense vector embeddings from Sentence Transformers.
                </p>
                <p>
                  Detects sophisticated paraphrasing, synonym substitution, and idea reproduction where different words were used to convey identical meaning.
                </p>
              </div>
            </div>
          )}

          {/* ================= 6. SENTENCE SIMILARITY ================= */}
          {metric === "sentence" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Sentence Similarity Overlap</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {breakdown["Sentence Similarity"] !== undefined ? `${breakdown["Sentence Similarity"].toFixed(0)}%` : "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Matched: {stats["Matched Sentences"] ?? 0} of {stats["Total Sentences"] ?? 0} total sentences
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <Split className="w-6 h-6" />
                </div>
              </div>

              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Top Flagged Sentences ({flaggedSentences.length})
              </h4>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {flaggedSentences.length > 0 ? (
                  flaggedSentences.map((s: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl text-xs border ${
                        s.color === "red"
                          ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300"
                          : s.color === "yellow"
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-300"
                          : "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-300"
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold mb-1">
                        <span>Sentence #{idx + 1}</span>
                        <span>{s.score ? `${(s.score * 100).toFixed(0)}% match` : "Flagged"}</span>
                      </div>
                      <p className="italic leading-relaxed">&ldquo;{s.text}&rdquo;</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No sentences flagged above threshold.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= 7. PARAGRAPH SIMILARITY ================= */}
          {metric === "paragraph" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Paragraph Similarity</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {breakdown["Paragraph Similarity"] !== undefined ? `${breakdown["Paragraph Similarity"].toFixed(0)}%` : "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Matched: {stats["Matched Paragraphs"] ?? 0} of {stats["Total Paragraphs"] ?? 0} paragraphs
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <Layers className="w-6 h-6" />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">Structural Flow Matching:</strong> Compares multi-sentence paragraph blocks across the submission and reference document.
                </p>
                <p>
                  High paragraph similarity signals identical flow of arguments, copied report sections, or systematic structural copying.
                </p>
              </div>
            </div>
          )}

          {/* ================= 8. PAGE SIMILARITY ================= */}
          {metric === "page" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Page Distribution Heatmap</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {stats["Matched Pages"] !== undefined ? `${stats["Matched Pages"]} / ${stats["Total Pages"]}` : "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Pages with detected similarity</p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <FileText className="w-6 h-6" />
                </div>
              </div>

              <div className="space-y-2.5">
                {heatmap.length > 0 ? (
                  heatmap.map((p: any) => (
                    <div key={p.page} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3 text-xs">
                      <span className="w-16 font-semibold text-muted-foreground">Page {p.page}</span>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            p.similarity >= 80 ? "bg-red-500" : p.similarity >= 40 ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${p.similarity}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-bold text-foreground">{p.similarity.toFixed(0)}%</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No page distribution data available.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= 9. IMAGE SIMILARITY ================= */}
          {metric === "image" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Perceptual Hashing (pHash)</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">N/A</p>
                  <p className="text-xs text-muted-foreground mt-1">Text / PDF Document Submission</p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <Image className="w-6 h-6" />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">Perceptual Image Analysis:</strong> Applied automatically to image submissions (PNG, JPG, WEBP).
                </p>
                <p>
                  Perceptual hashing (pHash) generates a fingerprint based on frequency distribution, resisting resizing, cropping, compression, and watermarking.
                </p>
                <p className="italic text-foreground">
                  Note: This submission is a PDF/text document, so perceptual image analysis was gracefully skipped and marked N/A.
                </p>
              </div>
            </div>
          )}

          {/* ================= 10. MATCHED SENTENCES ================= */}
          {metric === "matched_sentences" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Matched vs Total Sentences</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {stats["Matched Sentences"] ?? 0} / {stats["Total Sentences"] ?? 0}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <Split className="w-6 h-6" />
                </div>
              </div>

              {/* Color Legend */}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-card border border-border text-xs">
                <span className="font-semibold text-muted-foreground uppercase text-[10px]">Evidence Colors:</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/> Exact Match (Red)</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"/> Semantic Paraphrase (Yellow)</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"/> Moderate Overlap (Orange)</span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {data?.evidence_records && data.evidence_records.length > 0 ? (
                  data.evidence_records.map((ev: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-xl border border-border bg-card text-xs space-y-2">
                      <div className="flex items-center justify-between text-muted-foreground font-semibold">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            ev.color === "red" ? "bg-red-500" : ev.color === "yellow" ? "bg-yellow-500" : "bg-orange-500"
                          }`} />
                          <span className="font-mono text-foreground">Match #{idx + 1}</span>
                          {ev.uploaded_page && (
                            <span className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-semibold text-foreground">
                              Page {ev.uploaded_page}
                            </span>
                          )}
                        </div>
                        <span className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                          ev.color === "red" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                          ev.color === "yellow" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
                          "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                        }`}>
                          {ev.match_type || "Match"} ({ev.score ? Math.round(ev.score) : 100}%)
                        </span>
                      </div>
                      
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase">Uploaded Excerpt:</p>
                        <p className="text-foreground leading-relaxed pl-2 border-l-2 border-primary/40 italic">
                          &ldquo;{ev.matched_sentence}&rdquo;
                        </p>
                      </div>

                      {ev.reference_sentence && (
                        <div className="space-y-1 pt-1 border-t border-border/50">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase">Reference Match:</p>
                          <p className="text-muted-foreground leading-relaxed pl-2 border-l-2 border-muted italic">
                            &ldquo;{ev.reference_sentence}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                ) : flaggedSentences.length > 0 ? (
                  flaggedSentences.map((s: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-xl border border-border bg-card text-xs space-y-1">
                      <div className="flex items-center justify-between text-muted-foreground font-semibold">
                        <span>Excerpt #{idx + 1}</span>
                        <span className={s.color === "red" ? "text-red-500" : "text-amber-500"}>
                          {s.score ? `${(s.score * 100).toFixed(0)}% match` : "Exact match"}
                        </span>
                      </div>
                      <p className="text-foreground leading-relaxed">&ldquo;{s.text}&rdquo;</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No matched sentences recorded.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= 11. MATCHED PARAGRAPHS ================= */}
          {metric === "matched_paragraphs" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Matched vs Total Paragraphs</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {stats["Matched Paragraphs"] ?? 0} / {stats["Total Paragraphs"] ?? 0}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <Layers className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Represents paragraph blocks evaluated above the similarity threshold (&ge; 60% overlap).
              </p>
            </div>
          )}

          {/* ================= 12. MATCHED PAGES ================= */}
          {metric === "matched_pages" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-muted-foreground">Matched vs Total Pages</p>
                  <p className="text-3xl font-extrabold mt-1 text-foreground">
                    {stats["Matched Pages"] ?? 0} / {stats["Total Pages"] ?? 0}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                  <FileText className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pages with sentence or paragraph level overlap detected in the document heatmap.
              </p>
            </div>
          )}

          {/* ================= 13. INTERNAL SUBMISSION MATCHES ================= */}
          {metric === "internal_matches" && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border">
                <p className="text-xs uppercase font-semibold text-muted-foreground">Primary Internal Reference Match</p>
                {data.reference_document?.file_name ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-foreground">
                        {data.reference_document.matched_student || "Student Match"}
                      </span>
                      {data.reference_document.section_name && (
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-semibold text-xs border border-blue-500/20">
                          {data.reference_document.section_name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      File: <strong className="text-foreground">{data.reference_document.file_name}</strong>
                    </p>
                    {data.reference_document.assignment_title && (
                      <p className="text-xs text-muted-foreground">
                        Assignment: <strong className="text-foreground">{data.reference_document.assignment_title}</strong>
                      </p>
                    )}
                    {data.reference_document.upload_time && (
                      <p className="text-xs text-muted-foreground">
                        Uploaded: <strong className="text-foreground">{data.reference_document.upload_time}</strong>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2 italic">
                    No internal student reference match found for this submission.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onOpenSplitViewer}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 flex items-center justify-center gap-2 shadow-sm"
                >
                  <Split className="w-4 h-4" />
                  <span>Open Side-by-Side Split Document Viewer</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= 14. POTENTIAL ONLINE SOURCES ================= */}
          {metric === "online_sources" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300 text-xs leading-relaxed space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <Globe className="w-4 h-4" />
                  <span>External Source Discovery Notice</span>
                </p>
                <p>
                  Searches the open web for distinct academic passages using the Tavily API. Results reflect potential matching references and must be verified manually.
                </p>
              </div>

              <OnlineSourcePanel uploadId={data.upload_id} />
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between">
          <button
            onClick={onOpenSplitViewer}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5"
          >
            <Split className="w-3.5 h-3.5" />
            <span>Switch to Side-by-Side Document Viewer</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted text-muted-foreground"
          >
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
}
