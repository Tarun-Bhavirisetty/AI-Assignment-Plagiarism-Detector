import { X, FileText, User, Calendar, BookOpen, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function DocumentPreviewModal({ upload, onClose }: { upload: any; onClose: () => void }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (upload?.file_type === 'application/pdf') {
      api.get(`/admin/download/${upload.id}`, { responseType: 'blob' })
        .then(res => {
          setPdfUrl(URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })));
        })
        .catch(err => console.error("Failed to load PDF", err));
    }
  }, [upload]);

  const handleDownload = async () => {
    try {
      const res = await api.get(`/admin/download/${upload.id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', upload.file_name);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
    } catch (err) {
      console.error('Download failed', err);
      alert('Failed to download file');
    }
  };

  if (!upload) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div className="bg-card text-foreground w-full max-w-4xl h-[80vh] rounded-2xl border border-border flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
          <h2 className="text-lg font-bold flex items-center text-primary">
            <FileText className="w-5 h-5 mr-2" />
            Document Preview
          </h2>
          <div className="flex items-center space-x-3">
            <button 
              onClick={handleDownload}
              className="flex items-center px-3.5 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-xl text-xs font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download Original
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Metadata Banner */}
        <div className="bg-muted/20 border-b border-border p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm shrink-0">
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center uppercase font-semibold"><FileText className="w-3 h-3 mr-1"/> File Name</p>
            <p className="font-semibold text-foreground truncate mt-0.5">{upload.file_name}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center uppercase font-semibold"><User className="w-3 h-3 mr-1"/> Student</p>
            <p className="font-semibold text-foreground truncate mt-0.5">{upload.uploaded_by_name} <span className="text-xs opacity-70">({upload.section_name})</span></p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center uppercase font-semibold"><BookOpen className="w-3 h-3 mr-1"/> Assignment</p>
            <p className="font-semibold text-foreground truncate mt-0.5">{upload.assignment_title}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center uppercase font-semibold"><Calendar className="w-3 h-3 mr-1"/> Uploaded On</p>
            <p className="font-semibold text-foreground truncate mt-0.5">{upload.upload_time}</p>
          </div>
        </div>

        {/* Document Content */}
        <div className="flex-1 overflow-hidden bg-background relative">
          {upload.file_type === 'application/pdf' && pdfUrl ? (
            <iframe 
              src={pdfUrl} 
              className="w-full h-full border-none bg-white" 
              title="PDF Preview"
            />
          ) : (
            <div className="h-full overflow-y-auto p-6">
              <div className="bg-muted/30 border border-border rounded-xl p-6 min-h-full">
                {upload.extracted_text ? (
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                    {upload.extracted_text}
                  </pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground mt-20">
                    <FileText className="w-16 h-16 mb-4 opacity-30 text-muted-foreground" />
                    <p className="font-semibold text-foreground">No text content available for this file type.</p>
                    <p className="text-xs mt-1 text-muted-foreground">Images and unsupported formats cannot be previewed as text.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
