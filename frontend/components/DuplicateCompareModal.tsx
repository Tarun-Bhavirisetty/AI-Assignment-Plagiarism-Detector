import { useState, useEffect } from 'react';
import { X, Loader2, User, FileText, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import api from '@/lib/api';

export default function DuplicateCompareModal({ uploadId, onClose }: { uploadId: number; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [matchedPdfUrl, setMatchedPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchComparison = async () => {
      try {
        const res = await api.get(`/compare/${uploadId}`);
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchComparison();
  }, [uploadId]);

  useEffect(() => {
    if (data?.uploaded_document?.file_name?.toLowerCase().endsWith('.pdf') || data?.uploaded_file?.toLowerCase().endsWith('.pdf')) {
      api.get(`/admin/download/highlighted/${uploadId}?type=uploaded`, { responseType: 'blob' })
        .then(res => setUploadedPdfUrl(URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))))
        .catch(err => console.error("Failed PDF Load", err));
        
      if (data.reference_upload_id) {
        api.get(`/admin/download/highlighted/${uploadId}?type=matched`, { responseType: 'blob' })
          .then(res => setMatchedPdfUrl(URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))))
          .catch(err => console.error("Failed Matched PDF Load", err));
      } else {
        setMatchedPdfUrl("missing");
      }
    }
  }, [data, uploadId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-7xl h-[95vh] rounded-2xl border border-white/10 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <h2 className="text-xl font-bold flex items-center">
            <AlertTriangle className="w-6 h-6 text-yellow-500 mr-2" />
            DOCUMENT COMPARISON
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : data ? (
            <>
              {/* Left Panel: Analytics Sidebar */}
              <div className="w-full md:w-80 bg-black/30 border-r border-white/10 overflow-y-auto p-4 flex flex-col space-y-6 scrollbar-thin scrollbar-thumb-white/10">
                
                {/* Overall Similarity */}
                <div className="text-center p-4 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-sm text-muted-foreground uppercase font-semibold mb-2">Overall Similarity</p>
                  <p className={`font-bold text-5xl ${data.overall_similarity >= 90 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {data.overall_similarity?.toFixed(0) || 0}%
                  </p>
                </div>

                {/* Similarity Breakdown */}
                {data.breakdown && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase text-muted-foreground border-b border-white/10 pb-1">Similarity Breakdown</h3>
                    {Object.entries(data.breakdown).map(([key, val]: any) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">{key}</span>
                        <span className="font-medium">
                          {val < 0 ? <span className="text-gray-500 text-xs">Unavailable</span> : `${val.toFixed(0)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Match Statistics */}
                {data.match_statistics && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase text-muted-foreground border-b border-white/10 pb-1">Evidence</h3>
                    {Object.entries(data.match_statistics).map(([key, val]: any) => {
                      if (key.startsWith("Total")) return null; // We will format as X / Y
                      const baseKey = key.replace("Matched ", "");
                      const totalVal = data.match_statistics[`Total ${baseKey}`];
                      return (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <span className="text-gray-300">Matched {baseKey}</span>
                          <span className="font-medium text-emerald-300">
                            {val} / {totalVal}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* AI Summary */}
                {data.ai_summary && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase text-muted-foreground border-b border-white/10 pb-1">AI Plagiarism Summary</h3>
                    <p className="text-xs text-gray-300 leading-relaxed border border-white/10 p-3 rounded-lg bg-black/20">
                      {data.overall_similarity >= 90 ? 
                        "Very high textual similarity was detected between the two submissions. The normalized document content significantly matches the reference submission." :
                        data.overall_similarity >= 50 ?
                        "Moderate textual similarity was detected, indicating potential paraphrasing or shared source material." :
                        "Low similarity detected. The documents appear largely independent."
                      }
                    </p>
                    {data.ai_summary.copied?.length > 0 && <p className="text-xs text-red-400">Copied Sections: {data.ai_summary.copied.join(", ")}</p>}
                    {data.ai_summary.similar?.length > 0 && <p className="text-xs text-yellow-400">Similar Sections: {data.ai_summary.similar.join(", ")}</p>}
                  </div>
                )}

                {/* Page Heatmap */}
                {data.page_heatmap?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase text-muted-foreground border-b border-white/10 pb-1">Page Similarity</h3>
                    <div className="space-y-2">
                      {data.page_heatmap.map((p: any) => (
                        <div key={p.page} className="flex items-center text-xs">
                          <span className="w-12 text-gray-400">Page {p.page}</span>
                          <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden mx-2 relative">
                            <div 
                              className={`absolute top-0 left-0 bottom-0 ${p.similarity >= 80 ? 'bg-red-500' : p.similarity >= 40 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                              style={{ width: `${p.similarity}%` }}
                            ></div>
                          </div>
                          <span className="w-10 text-right">{p.similarity.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Legend */}
                <div className="space-y-2 mt-auto pt-4 border-t border-white/10">
                   <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Legend</h3>
                   <div className="text-xs space-y-1.5">
                     <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-red-500/80 mr-2"></span> Exact Match</div>
                     <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-yellow-500/80 mr-2"></span> Semantic / Paraphrased</div>
                     <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-orange-500/80 mr-2"></span> Moderate Similarity</div>
                     <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-transparent border border-white/20 mr-2"></span> Unique Content</div>
                   </div>
                </div>
              </div>

              {/* Right Panel: Split Document Viewer */}
              <div className="flex-1 flex flex-col md:flex-row bg-black/20">
                {/* Reference PDF */}
                <div className="flex-1 border-r border-white/10 flex flex-col">
                  <div className="px-4 py-3 border-b border-white/10 bg-black/40 text-sm flex justify-between items-center">
                    <div>
                      <span className="text-muted-foreground">Reference Match: </span>
                      <span className="font-semibold text-blue-400">{data.reference_document?.matched_student || data.matched_student || "Unknown"}</span>
                    </div>
                  </div>
                  <div className="flex-1 p-4">
                    {data.uploaded_document?.file_name?.toLowerCase().endsWith('.pdf') || data.uploaded_file?.toLowerCase().endsWith('.pdf') ? (
                      matchedPdfUrl === "missing" ? (
                        <div className="flex h-full items-center justify-center text-red-400">Reference Document Unavailable</div>
                      ) : matchedPdfUrl ? (
                        <iframe src={matchedPdfUrl} className="w-full h-full rounded-xl border-none bg-white" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mr-2"/> Loading PDF...</div>
                      )
                    ) : (
                      <div className="bg-blue-500/10 border border-blue-500/30 p-6 rounded-xl h-full overflow-y-auto text-sm leading-relaxed text-blue-100 whitespace-pre-wrap">
                        {data.matched_highlighted?.map((chunk: any, i: number) => (
                          <span key={i} className={`mr-1 px-1 rounded transition-colors ${
                            chunk.color === 'red' ? 'bg-red-500/40 text-red-100 font-medium' :
                            chunk.color === 'yellow' ? 'bg-yellow-500/40 text-yellow-100' :
                            chunk.color === 'orange' ? 'bg-orange-500/40 text-orange-100' :
                            'bg-transparent'
                          }`}>{chunk.text}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Uploaded PDF */}
                <div className="flex-1 flex flex-col">
                  <div className="px-4 py-3 border-b border-white/10 bg-black/40 text-sm flex justify-between items-center">
                    <div>
                      <span className="text-muted-foreground">Uploaded Assignment: </span>
                      <span className="font-semibold text-emerald-400">{data.uploaded_document?.file_name || data.uploaded_file}</span>
                    </div>
                  </div>
                  <div className="flex-1 p-4">
                    {data.uploaded_document?.file_name?.toLowerCase().endsWith('.pdf') || data.uploaded_file?.toLowerCase().endsWith('.pdf') ? (
                      uploadedPdfUrl ? (
                        <iframe src={uploadedPdfUrl} className="w-full h-full rounded-xl border-none bg-white" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mr-2"/> Loading PDF...</div>
                      )
                    ) : (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-xl h-full overflow-y-auto text-sm leading-relaxed text-emerald-100 whitespace-pre-wrap">
                        {data.uploaded_highlighted?.map((chunk: any, i: number) => (
                          <span key={i} className={`mr-1 px-1 rounded transition-colors ${
                            chunk.color === 'red' ? 'bg-red-500/40 text-red-100 font-medium' :
                            chunk.color === 'yellow' ? 'bg-yellow-500/40 text-yellow-100' :
                            chunk.color === 'orange' ? 'bg-orange-500/40 text-orange-100' :
                            'bg-transparent'
                          }`}>{chunk.text}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-red-400">
              Failed to load comparison data.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
