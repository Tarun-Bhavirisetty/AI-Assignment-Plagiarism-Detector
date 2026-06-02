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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-4xl h-[80vh] rounded-2xl border border-white/10 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <h2 className="text-xl font-bold flex items-center text-primary">
            <FileText className="w-6 h-6 mr-2" />
            Document Preview
          </h2>
          <div className="flex items-center space-x-3">
            <button 
              onClick={handleDownload}
              className="flex items-center px-4 py-2 bg-primary/20 text-primary hover:bg-primary/30 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Original
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Metadata Banner */}
        <div className="bg-black/60 border-b border-white/5 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground flex items-center"><FileText className="w-3 h-3 mr-1"/> File Name</p>
            <p className="font-medium truncate">{upload.file_name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center"><User className="w-3 h-3 mr-1"/> Student</p>
            <p className="font-medium truncate">{upload.uploaded_by_name} <span className="text-xs opacity-70">({upload.section_name})</span></p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center"><BookOpen className="w-3 h-3 mr-1"/> Assignment</p>
            <p className="font-medium truncate">{upload.assignment_title}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center"><Calendar className="w-3 h-3 mr-1"/> Uploaded On</p>
            <p className="font-medium truncate">{upload.upload_time}</p>
          </div>
        </div>

        {/* Document Content */}
        <div className="flex-1 overflow-hidden bg-black/20 relative">
          {upload.file_type === 'application/pdf' && pdfUrl ? (
            <iframe 
              src={pdfUrl} 
              className="w-full h-full border-none" 
              title="PDF Preview"
            />
          ) : (
            <div className="h-full overflow-y-auto p-6">
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 min-h-full">
                {upload.extracted_text ? (
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {upload.extracted_text}
                  </pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground mt-20">
                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                    <p>No text content available for this file type.</p>
                    <p className="text-xs mt-2 opacity-70">Images and unsupported formats cannot be previewed as text.</p>
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
