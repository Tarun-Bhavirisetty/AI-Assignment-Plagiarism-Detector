import { useState, useCallback } from "react";
import api from "@/lib/api";

interface SourceResult {
  id: number;
  source_url: string;
  source_title: string | null;
  source_domain: string | null;
  matched_assignment_excerpt: string | null;
  matched_source_excerpt: string | null;
  match_method: string | null;
  similarity_score: number | null;
  source_published_date: string | null;
  searched_at: string | null;
}

interface DiscoveryResponse {
  status: string;
  job_id: number | null;
  results: SourceResult[];
  message?: string;
  queries_sent?: number;
  error_message?: string;
  created_at?: string;
}

interface OnlineSourcePanelProps {
  uploadId: number;
}

const METHOD_CONFIG: Record<string, { label: string; color: string }> = {
  exact_phrase: { label: "Exact Phrase", color: "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20" },
  lexical_overlap: { label: "Lexical Overlap", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20" },
  snippet_based: { label: "Snippet Match", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20" },
  snippet_unavailable: { label: "No Snippet", color: "bg-muted text-muted-foreground border border-border" },
};

export default function OnlineSourcePanel({ uploadId }: OnlineSourcePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const fetchResults = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        let resp;
        if (force) {
          resp = await api.post(`/submissions/${uploadId}/source-discovery?force=true`);
        } else {
          resp = await api.get(`/submissions/${uploadId}/source-discovery`);
        }
        setData(resp.data as DiscoveryResponse);
      } catch (e: unknown) {
        const axiosErr = e as { response?: { data?: { detail?: string } } };
        setError(axiosErr.response?.data?.detail || "Failed to fetch results");
      } finally {
        setLoading(false);
      }
    },
    [uploadId]
  );

  const handleToggle = () => {
    if (!isOpen) {
      setIsOpen(true);
      if (!data) fetchResults(false);
    } else {
      setIsOpen(false);
    }
  };

  const toggleExpand = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const isUnavailable = data?.status === "unavailable";
  const isFailed = data?.status === "failed";
  const isCompleted = data?.status === "completed";
  const isRunning = data?.status === "processing" || data?.status === "pending";
  const notStarted = !data || data.status === "not_started";
  const hasResults = isCompleted && Array.isArray(data?.results) && data!.results.length > 0;

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      {/* Toggle header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors py-1"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <span>🌐</span>
          <span>Online Sources</span>
          {hasResults && (
            <span className="px-2 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 rounded-full text-[11px] font-semibold">
              {data!.results.length} found
            </span>
          )}
          {isUnavailable && (
            <span className="px-2 py-0.5 bg-muted text-muted-foreground border border-border rounded-full text-[11px] font-normal lowercase">
              not configured
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="space-y-3 pb-1">
          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Searches the web for passages from this submission. Results indicate{" "}
            <em>potential</em> matches — review carefully before drawing conclusions.
          </p>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isUnavailable && (notStarted || isFailed || isCompleted) && (
              <button
                onClick={() => fetchResults(true)}
                disabled={loading}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                {loading
                  ? "Searching…"
                  : notStarted
                  ? "Run Source Discovery"
                  : "Re-run Search"}
              </button>
            )}
            {isRunning && !loading && (
              <button
                onClick={() => fetchResults(false)}
                className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-lg border border-border transition-colors"
              >
                Refresh
              </button>
            )}
            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="animate-spin h-3 w-3 border border-primary border-t-transparent rounded-full" />
                Searching…
              </div>
            )}
          </div>

          {/* Status messages */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
              ⚠️ {error}
            </div>
          )}

          {isUnavailable && (
            <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 leading-relaxed">
              <strong>Not configured.</strong> Set{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded border border-border font-mono text-[11px]">TAVILY_API_KEY</code> on the
              server to enable online source discovery.{" "}
              <a
                href="https://tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium hover:text-amber-800 dark:hover:text-amber-200"
              >
                Free at tavily.com
              </a>{" "}
              — 1,000 searches/month, no credit card.
            </div>
          )}

          {isFailed && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
              Search failed: {data?.error_message || data?.message || "Unknown error"}
            </div>
          )}

          {isRunning && (
            <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-center gap-2">
              <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span>Analysis in progress… querying external web sources...</span>
            </div>
          )}

          {isCompleted && !hasResults && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              ✅ No matching online sources found for this submission.
            </div>
          )}

          {/* Results list */}
          {hasResults && (
            <div className="space-y-2">
              {data!.results.map((result, idx) => {
                const methodInfo =
                  METHOD_CONFIG[result.match_method ?? ""] ?? {
                    label: result.match_method ?? "Unknown",
                    color: "bg-muted text-muted-foreground border border-border",
                  };
                const scorePercent =
                  result.similarity_score !== null
                    ? Math.round(result.similarity_score * 100)
                    : null;
                const isExpanded = expandedIds.has(result.id);

                return (
                  <div
                    key={result.id}
                    className="border border-border rounded-xl overflow-hidden bg-card shadow-sm"
                  >
                    {/* Result header */}
                    <div className="px-3.5 py-2.5 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${methodInfo.color}`}
                            >
                              {methodInfo.label}
                            </span>
                            {scorePercent !== null && (
                              <span
                                className={`text-xs font-bold ${
                                  scorePercent >= 60
                                    ? "text-red-500"
                                    : scorePercent >= 30
                                    ? "text-orange-500"
                                    : "text-yellow-600 dark:text-yellow-400"
                                }`}
                              >
                                {scorePercent}% overlap
                              </span>
                            )}
                          </div>
                          <a
                            href={result.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-primary hover:underline break-all leading-snug block"
                          >
                            {result.source_title || result.source_url}
                          </a>
                          {result.source_domain && (
                            <span className="block text-[11px] text-muted-foreground mt-0.5">
                              {result.source_domain}
                              {result.source_published_date && ` · ${result.source_published_date}`}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => toggleExpand(result.id)}
                          className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap p-1 rounded hover:bg-muted"
                          title="Toggle excerpts"
                        >
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                    </div>

                    {/* Expanded excerpts */}
                    {isExpanded && (
                      <div className="border-t border-border px-3.5 py-2.5 space-y-2.5 bg-muted/30">
                        {result.matched_assignment_excerpt && (
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">
                              From submission:
                            </p>
                            <p className="text-xs text-foreground italic border-l-2 border-primary pl-2.5 leading-relaxed bg-card p-2 rounded-r-lg border border-l-0 border-border">
                              &ldquo;{result.matched_assignment_excerpt}&rdquo;
                            </p>
                          </div>
                        )}
                        {result.matched_source_excerpt && (
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">
                              From source:
                            </p>
                            <p className="text-xs text-foreground italic border-l-2 border-amber-500 pl-2.5 leading-relaxed bg-card p-2 rounded-r-lg border border-l-0 border-border">
                              &ldquo;{result.matched_source_excerpt}&rdquo;
                            </p>
                          </div>
                        )}
                        <a
                          href={result.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1 mt-1"
                        >
                          <span>View original source</span>
                          <span>↗</span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}

              {data!.created_at && (
                <p className="text-[11px] text-muted-foreground">
                  Last searched: {new Date(data!.created_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
