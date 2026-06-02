"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardCards from '@/components/DashboardCards';
import Charts from '@/components/Charts';
import DuplicateCompareModal from '@/components/DuplicateCompareModal';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import api from '@/lib/api';
import { Loader2, Plus, Trash2, Search, Filter } from 'lucide-react';

export default function Dashboard() {
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedUploadId, setSelectedUploadId] = useState<number | null>(null);
  const [previewUpload, setPreviewUpload] = useState<any>(null);

  const [sections, setSections] = useState<any[]>([]);
  const [newSection, setNewSection] = useState('');
  
  const [allUploads, setAllUploads] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterAssignment, setFilterAssignment] = useState('');

  const fetchSections = async () => {
    try {
      const res = await api.get('/sections');
      setSections(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUploads = async () => {
    try {
      const res = await api.get('/admin/uploads');
      setAllUploads(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get('/analytics');
        setData(res.data);
      } catch (err: any) {
        if (err.response?.status === 401) {
          router.push('/login');
        } else {
          setError('Failed to load dashboard data.');
        }
      } finally {
        setLoading(false);
      }
    };

    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (!token) {
      router.push('/login');
    } else if (role !== 'admin') {
      router.push('/user-dashboard');
    } else {
      fetchAnalytics();
      fetchSections();
      fetchUploads();
    }
  }, [router]);

  const handleAddSection = async () => {
    if (!newSection.trim()) return;

    try {
      await api.post('/sections', {
        name: newSection.trim(),
      });

      setNewSection('');
      fetchSections();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSection = async (id: number) => {
    try {
      await api.delete(`/sections/${id}`);
      fetchSections();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownload = async (id: number, filename: string) => {
    try {
      const res = await api.get(`/admin/download/${id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
    } catch (err) {
      console.error('Download failed', err);
      alert('Failed to download file');
    }
  };

  const handleReprocess = async () => {
    try {
      setLoading(true);
      await api.post('/admin/reprocess_uploads');
      alert('Successfully reprocessed old uploads');
      fetchUploads();
    } catch (err) {
      console.error(err);
      alert('Reprocess failed');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="container mx-auto px-4 py-8">

      <h1 className="text-4xl font-bold mb-2 text-primary">
        Global Admin Analytics
      </h1>

      <p className="text-muted-foreground mb-8">
        System-wide overview of uploads, duplicates, sections, and assignments.
      </p>

      <DashboardCards
        total={data.total_uploads}
        dupes={data.duplicate_uploads}
        fileStats={data.file_type_stats || {}}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
          <h3 className="text-xl font-semibold mb-6">
            File Type Distribution
          </h3>

          <Charts stats={data.file_type_stats || {}} />
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
          <h3 className="text-xl font-semibold mb-6">
            Section Upload Activity
          </h3>

          <Charts stats={data.section_stats || {}} />
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
          <h3 className="text-xl font-semibold mb-6">
            Assignment Analytics
          </h3>

          <Charts stats={data.assignment_stats || {}} />
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
          <h3 className="text-xl font-semibold mb-6">
            Top Copied Assignments
          </h3>
          <Charts stats={(data.top_copied_assignments || []).reduce((acc: any, curr: any) => ({...acc, [curr.name]: curr.count}), {})} />
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
          <h3 className="text-xl font-semibold mb-6">
            Most Flagged Students
          </h3>
          <Charts stats={(data.most_flagged_students || []).reduce((acc: any, curr: any) => ({...acc, [curr.name]: curr.count}), {})} />
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
          <h3 className="text-xl font-semibold mb-6">
            Section Plagiarism Average (%)
          </h3>
          <Charts stats={data.section_plagiarism_stats || {}} />
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10">
          <h3 className="text-xl font-semibold mb-6">
            Duplicate Trends (Recent Days)
          </h3>
          <Charts stats={data.duplicate_trends || {}} />
        </div>

        <div className="p-6 rounded-2xl bg-card/40 border border-white/10">

          <h3 className="text-xl font-semibold mb-6">
            Manage Sections
          </h3>

          <div className="flex gap-2 mb-4">

            <input
              type="text"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              placeholder="Enter Section Name"
              className="flex-1 px-4 py-2 rounded-lg bg-black/40 border border-white/10 outline-none focus:border-primary"
            />

            <button
              onClick={handleAddSection}
              className="px-4 py-2 bg-primary rounded-lg hover:bg-primary/90 flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </button>
          </div>

          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">

            {sections.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5"
              >
                <span>{s.name}</span>

                <button
                  onClick={() => handleDeleteSection(s.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No sections available.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-card/40 border border-white/10">

        <h3 className="text-2xl font-semibold mb-6">
          Global Duplicate Detection Feed
        </h3>

        {data.duplicate_records &&
        data.duplicate_records.length > 0 ? (

          <div className="space-y-4">

            {data.duplicate_records.map((record: any, idx: number) => (

              <div
                key={idx}
                onClick={() => setSelectedUploadId(record.id)}
                className="p-4 bg-black/40 rounded-xl border border-white/5 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
              >

                <div className="flex items-center justify-between mb-3">

                  <span
                    className={`text-xs px-2 py-1 rounded-full border font-semibold ${
                      record.similarity_score === 100
                        ? 'bg-orange-500/20 text-orange-400 border-orange-500/50'
                        : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                    }`}
                  >
                    {record.duplicate_type} ({record.similarity_score}%)
                  </span>

                  <span className="text-xs text-muted-foreground">
                    {record.upload_time}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Uploaded By
                    </p>

                    <p className="font-medium text-emerald-400">
                      {record.uploaded_by_name} (
                      {record.section_name || 'No Section'})
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Matched With
                    </p>

                    <p className="font-medium text-blue-400">
                      {record.matched_with}
                    </p>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-white/5 flex items-center justify-between">

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Assignment
                    </p>

                    <p className="font-medium">
                      {record.assignment_title || record.file_name}
                    </p>
                  </div>

                  <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Click to Compare →
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            No duplicate uploads detected globally.
          </div>
        )}
      </div>

      <div className="mt-8 p-6 rounded-2xl bg-card/40 border border-white/10">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-semibold">All Uploads & Documents</h3>
          <button
            onClick={handleReprocess}
            className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 flex items-center text-sm font-medium transition-colors"
          >
            Reprocess Uploads
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search by student or file name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-4">
            <div className="relative">
              <Filter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <select 
                value={filterSection} 
                onChange={(e) => setFilterSection(e.target.value)}
                className="pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg outline-none focus:border-primary appearance-none min-w-[150px]"
              >
                <option value="">All Sections</option>
                {sections.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <select 
                value={filterAssignment} 
                onChange={(e) => setFilterAssignment(e.target.value)}
                className="pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg outline-none focus:border-primary appearance-none min-w-[150px]"
              >
                <option value="">All Assignments</option>
                {Array.from(new Set(allUploads.map(u => u.assignment_title))).filter(Boolean).map(a => (
                  <option key={a as string} value={a as string}>{a as string}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/20">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/40 border-b border-white/5 text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-medium">Student</th>
                <th className="px-6 py-4 font-medium">Section</th>
                <th className="px-6 py-4 font-medium">Assignment</th>
                <th className="px-6 py-4 font-medium">File Name</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium text-right">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {allUploads.filter(u => {
                const matchSearch = u.file_name.toLowerCase().includes(searchQuery.toLowerCase()) || u.uploaded_by_name.toLowerCase().includes(searchQuery.toLowerCase());
                const matchSection = filterSection ? u.section_name === filterSection : true;
                const matchAssignment = filterAssignment ? u.assignment_title === filterAssignment : true;
                return matchSearch && matchSection && matchAssignment;
              }).map((upload) => (
                <tr 
                  key={upload.id} 
                  onClick={() => setPreviewUpload(upload)}
                  className="hover:bg-primary/5 cursor-pointer transition-colors group"
                >
                  <td className="px-6 py-4 font-medium">{upload.uploaded_by_name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{upload.section_name}</td>
                  <td className="px-6 py-4 text-blue-300">{upload.assignment_title}</td>
                  <td className="px-6 py-4 text-muted-foreground group-hover:text-primary transition-colors">{upload.file_name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{upload.upload_time}</td>
                  <td className="px-6 py-4 text-right">
                    {upload.is_duplicate ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">Duplicate</span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Clean</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPreviewUpload(upload); }}
                      className="px-3 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 rounded transition-colors"
                    >
                      Preview
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownload(upload.id, upload.file_name); }}
                      className="px-3 py-1 text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 rounded transition-colors"
                    >
                      Download
                    </button>
                    {upload.is_duplicate && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedUploadId(upload.id); }}
                        className="px-3 py-1 text-xs font-medium bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded transition-colors"
                      >
                        Compare
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {allUploads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No uploads found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  );
}