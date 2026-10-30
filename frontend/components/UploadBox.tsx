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
      setError(err.response?.data?.message || err.response?.data?.detail || "Upload failed: Unable to process the document.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-muted-foreground">Section / Class *</label>
          <input
            type="text"
            list="section-options"
            placeholder="e.g. CSE-A, AIML-B"
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-xs text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
            disabled={uploading || !!result}
          />
          <datalist id="section-options">
            {sections.map(s => <option key={s.id} value={s.name} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-muted-foreground">Assignment Title *</label>
          <input
            type="text"
            placeholder="e.g. DBMS Assignment 3"
            value={assignmentTitle}
            onChange={(e) => setAssignmentTitle(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-xs text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
            disabled={uploading || !!result}
          />
        </div>
      </div>

      <div 
        className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl transition-all duration-300 shadow-sm ${
          dragActive ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/30'
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
        <UploadCloud className={`w-14 h-14 mb-4 ${dragActive ? 'text-primary scale-110' : 'text-muted-foreground/60'} transition-transform duration-300`} />
        <h3 className="text-base font-bold mb-1 text-foreground">Drag & Drop your file here</h3>
        <p className="text-muted-foreground text-xs">or click to browse document, code, or images (Max 50MB)</p>
      </div>

      {file && (
        <div className="mt-6 p-4 bg-card rounded-2xl border border-border flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <FileIcon className="w-5 h-5" />
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-foreground truncate">{file.name}</p>
              <p className="text-[11px] text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            {!result && !uploading && (
               <button onClick={() => setFile(null)} className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors">
                 <X className="w-4 h-4" />
               </button>
            )}
            {!result && (
              <button 
                onClick={handleUpload}
                disabled={uploading}
                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center shadow-md shadow-primary/20"
              >
                {uploading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processing...</> : 'Analyze Content'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold rounded-2xl flex items-center">
          <AlertTriangle className="w-4 h-4 mr-2.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
            <h4 className="text-lg font-bold mb-4 flex items-center text-foreground">
              Upload Analysis Results
            </h4>
            
            <div className="p-4 rounded-xl border mb-6 border-emerald-500/30 bg-emerald-500/10 flex items-start">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mr-3 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mb-0.5">Upload & Indexing Successful</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Your submission has been securely ingested, hashed, and indexed into the ChromaDB vector database.
                </p>
              </div>
            </div>

            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1.5">
              Extracted Document Metadata
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(result.metadata || {}).map(([key, value]) => (
                <div key={key} className="bg-muted/40 border border-border p-3 rounded-xl">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{key.replace('_', ' ')}</p>
                  <p className="text-xs font-bold text-foreground truncate mt-0.5" title={String(value)}>{String(value)}</p>
                </div>
              ))}
              {Object.keys(result.metadata || {}).length === 0 && (
                <p className="text-xs text-muted-foreground col-span-full">No metadata extracted for this file type.</p>
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
                 className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl border border-border transition-colors shadow-sm"
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
