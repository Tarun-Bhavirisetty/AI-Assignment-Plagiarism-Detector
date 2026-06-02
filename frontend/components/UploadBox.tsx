"use client";
import { useState, useCallback, useEffect } from 'react';
import { UploadCloud, File as FileIcon, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import api from '@/lib/api';

export default function UploadBox() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [sectionName, setSectionName] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await api.get('/sections');
        setSections(res.data);
      } catch (err) {
        console.error("Failed to load sections", err);
      }
    };
    fetchSections();
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
      setError(null);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!sectionName.trim()) {
      setError("Please enter or select a Section/Class");
      return;
    }
    if (!assignmentTitle.trim()) {
      setError("Please enter an Assignment Title");
      return;
    }
    
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("section_name", sectionName.trim());
    formData.append("assignment_title", assignmentTitle.trim());

    try {
      const res = await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1 text-muted-foreground">Section / Class *</label>
          <input
            type="text"
            list="section-options"
            placeholder="e.g. CSE-A, AIML-B"
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-card/40 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            disabled={uploading || !!result}
          />
          <datalist id="section-options">
            {sections.map(s => <option key={s.id} value={s.name} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-muted-foreground">Assignment Title *</label>
          <input
            type="text"
            placeholder="e.g. DBMS Assignment 3"
            value={assignmentTitle}
            onChange={(e) => setAssignmentTitle(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-card/40 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            disabled={uploading || !!result}
          />
        </div>
      </div>

      <div 
        className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl transition-all duration-300 ${
          dragActive ? 'border-primary bg-primary/10' : 'border-white/20 bg-card/40 hover:bg-card/60'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          type="file" 
          onChange={handleChange} 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <UploadCloud className={`w-16 h-16 mb-4 ${dragActive ? 'text-primary scale-110' : 'text-gray-400'} transition-transform duration-300`} />
        <h3 className="text-xl font-semibold mb-2">Drag & Drop your file here</h3>
        <p className="text-muted-foreground text-sm">or click to browse (Max 50MB)</p>
      </div>

      {file && (
        <div className="mt-6 p-4 bg-card/60 rounded-xl border border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-4 overflow-hidden">
            <div className="p-2 bg-primary/20 text-primary rounded-lg">
              <FileIcon className="w-6 h-6" />
            </div>
            <div className="truncate">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {!result && !uploading && (
               <button onClick={() => setFile(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                 <X className="w-5 h-5 text-gray-400" />
               </button>
            )}
            {!result && (
              <button 
                onClick={handleUpload}
                disabled={uploading}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center shadow-lg shadow-primary/20"
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Analyze'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-destructive/20 border border-destructive/50 text-red-200 rounded-xl flex items-center">
          <AlertTriangle className="w-5 h-5 mr-3" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
            <h4 className="text-xl font-semibold mb-6 flex items-center">
              Upload Results
            </h4>
            
            <div className="p-6 rounded-xl border mb-6 border-emerald-500/50 bg-emerald-500/10 flex items-start">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mr-4 mt-1" />
              <div>
                <h3 className="text-xl font-bold mb-1">Upload Successful</h3>
                <p className="text-muted-foreground text-sm">
                  Your file has been safely securely stored and analyzed by MetaGuard.
                </p>
              </div>
            </div>

            <h4 className="text-lg font-semibold mb-4 border-b border-white/10 pb-2">Extracted Metadata</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(result.metadata || {}).map(([key, value]) => (
                <div key={key} className="bg-black/30 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{key.replace('_', ' ')}</p>
                  <p className="text-sm font-medium truncate" title={String(value)}>{String(value)}</p>
                </div>
              ))}
              {Object.keys(result.metadata || {}).length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">No metadata extracted for this file type.</p>
              )}
            </div>
            
            <div className="mt-6 flex justify-end">
               <button 
                 onClick={() => {
                   setResult(null);
                   setFile(null);
                   setSectionName('');
                   setAssignmentTitle('');
                 }}
                 className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
               >
                 Upload Another Assignment
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
