import { useState, useEffect } from 'react';
import { X, Loader2, User, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
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
    if (data?.uploaded_file?.toLowerCase().endsWith('.pdf')) {
      api.get(`/admin/download/highlighted/${uploadId}?type=uploaded`, { responseType: 'blob' })
        .then(res => setUploadedPdfUrl(URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))))
        .catch(err => console.error("Failed PDF Load", err));
        
      api.get(`/admin/download/highlighted/${uploadId}?type=matched`, { responseType: 'blob' })
        .then(res => setMatchedPdfUrl(URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))))
        .catch(err => console.error("Failed Matched PDF Load", err));
    }
  }, [data, uploadId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-6xl h-[85vh] rounded-2xl border border-white/10 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <h2 className="text-xl font-bold flex items-center">
            <AlertTriangle className="w-6 h-6 text-yellow-500 mr-2" />
            Duplicate Assignment Analysis
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
              {/* Summary Banner */}
              <div className="absolute top-0 left-0 right-0 p-4 flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-black/90 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 shadow-xl pointer-events-auto flex items-center space-x-6">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Similarity</p>
                    <p className={`font-bold text-lg ${data.similarity_score >= 90 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {data.similarity_score?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div className="w-px h-8 bg-white/20"></div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Type</p>
                    <p className="font-semibold text-sm">{data.duplicate_type}</p>
                  </div>
                  <div className="w-px h-8 bg-white/20"></div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Time</p>
                    <p className="font-semibold text-sm text-gray-300">{data.upload_time}</p>
                  </div>
                  <div className="w-px h-8 bg-white/20"></div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Assignment</p>
                    <p className="font-semibold text-sm text-blue-300">{data.assignment_title || "N/A"}</p>
                  </div>
                </div>

                <div className="mt-3 bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 pointer-events-auto flex items-center space-x-4 text-xs font-medium">
                  <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-red-500/80 mr-1.5"></span> Exact Copied Text</span>
                  <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-yellow-500/80 mr-1.5"></span> Paraphrased / Similar</span>
                  <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-transparent border border-white/20 mr-1.5"></span> Unique Content</span>
                </div>
              </div>

              {/* Left: Original / Matched */}
              <div className="flex-1 border-r border-white/10 bg-black/20 flex flex-col pt-20">
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center"><User className="w-4 h-4 mr-1"/> Matched Student</p>
                    <p className="font-semibold text-lg text-blue-400">{data.matched_student}</p>
                  </div>
                  {data.ai_summary && (
                    <div className="text-[10px] md:text-xs text-right space-y-0.5 bg-black/40 p-2 rounded border border-white/5 max-w-[200px]">
                      <p className="text-muted-foreground font-semibold mb-1">AI Plagiarism Summary</p>
                      {data.ai_summary.copied?.length > 0 && <p className="text-red-400 truncate">Copied: {data.ai_summary.copied.join(", ")}</p>}
                      {data.ai_summary.similar?.length > 0 && <p className="text-yellow-400 truncate">Similar: {data.ai_summary.similar.join(", ")}</p>}
                      {data.ai_summary.unique?.length > 0 && <p className="text-emerald-400 truncate">Unique: {data.ai_summary.unique.join(", ")}</p>}
                    </div>
                  )}
                </div>
                <div className="flex-1 p-6 overflow-hidden">
                  {data.uploaded_file?.toLowerCase().endsWith('.pdf') ? (
                    matchedPdfUrl ? (
                      <iframe src={matchedPdfUrl} className="w-full h-full rounded-xl border-none bg-white" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mr-2"/> Loading PDF...</div>
                    )
                  ) : (
                    <div className="bg-blue-500/10 border border-blue-500/30 p-6 rounded-xl h-full overflow-y-auto">
                    <h3 className="flex items-center text-blue-300 font-semibold mb-4 border-b border-blue-500/30 pb-2">
                      <FileText className="w-5 h-5 mr-2" />
                      Matched Assignment Content
                    </h3>
                    <div className="text-sm leading-relaxed text-blue-100 whitespace-pre-wrap">
                      {data.matched_highlighted ? data.matched_highlighted.map((chunk: any, i: number) => (
                        <span key={i} className={`mr-1 px-1 rounded transition-colors ${
                          chunk.color === 'red' ? 'bg-red-500/40 text-red-100 font-medium' :
                          chunk.color === 'yellow' ? 'bg-yellow-500/40 text-yellow-100' :
                          'bg-transparent'
                        }`}>
                          {chunk.text}
                        </span>
                      )) : (
                        <span className="bg-blue-500/30 text-blue-50 px-1 rounded">{data.matched_content}</span>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              </div>

              {/* Right: Uploaded */}
              <div className="flex-1 bg-black/20 flex flex-col pt-20">
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                  {data.page_heatmap?.length > 0 && (
                    <div className="text-xs space-y-1 bg-black/40 p-2 rounded border border-white/5 flex flex-wrap gap-1 max-w-[250px]">
                       <p className="text-muted-foreground font-semibold flex items-center w-full">Page Heatmap</p>
                       {data.page_heatmap.map((p: any) => (
                          <div key={p.page} title={`Page ${p.page}: ${p.similarity.toFixed(0)}% similar`} 
                            className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] ${p.similarity >= 80 ? 'bg-red-500/80 text-white' : p.similarity >= 40 ? 'bg-yellow-500/80 text-black' : 'bg-emerald-500/80 text-white'}`}>
                            P{p.page}
                          </div>
                       ))}
                    </div>
                  )}
                  <div className="text-right ml-auto">
                    <p className="text-sm text-muted-foreground flex items-center justify-end"><User className="w-4 h-4 mr-1"/> Uploaded By (Current)</p>
                    <p className="font-semibold text-lg text-emerald-400">
                      {data.section_name ? `(${data.section_name})` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{data.uploaded_file}</p>
                  </div>
                </div>
                <div className="flex-1 p-6 overflow-hidden">
                  {data.uploaded_file?.toLowerCase().endsWith('.pdf') ? (
                    uploadedPdfUrl ? (
                      <iframe src={uploadedPdfUrl} className="w-full h-full rounded-xl border-none bg-white" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mr-2"/> Loading PDF...</div>
                    )
                  ) : (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-xl h-full overflow-y-auto">
                    <h3 className="flex items-center text-emerald-300 font-semibold mb-4 border-b border-emerald-500/30 pb-2">
                      <FileText className="w-5 h-5 mr-2" />
                      Uploaded Assignment Content
                    </h3>
                    <div className="text-sm leading-relaxed text-emerald-100 whitespace-pre-wrap">
                       {data.uploaded_highlighted ? data.uploaded_highlighted.map((chunk: any, i: number) => (
                        <span key={i} className={`mr-1 px-1 rounded transition-colors ${
                          chunk.color === 'red' ? 'bg-red-500/40 text-red-100 font-medium' :
                          chunk.color === 'yellow' ? 'bg-yellow-500/40 text-yellow-100' :
                          'bg-transparent'
                        }`}>
                          {chunk.text}
                        </span>
                      )) : (
                        <span className="bg-emerald-500/30 text-emerald-50 px-1 rounded">{data.original_content}</span>
                      )}
                    </div>
                  </div>
                  )}
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
