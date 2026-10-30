"use client";
import { Upload, Copy, FileCode2 } from 'lucide-react';

interface StatsProps {
  total: number;
  dupes: number;
  fileStats: Record<string, number>;
}

export default function DashboardCards({ total, dupes, fileStats = {} }: StatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-center space-x-4">
        <div className="p-4 bg-primary/10 rounded-xl text-primary">
          <Upload className="w-7 h-7" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase font-semibold">Total Uploads</p>
          <h4 className="text-3xl font-black text-foreground mt-1">{total}</h4>
        </div>
      </div>
      
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-center space-x-4">
        <div className="p-4 bg-orange-500/10 rounded-xl text-orange-500">
          <Copy className="w-7 h-7" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase font-semibold">High-Similarity Submissions</p>
          <h4 className="text-3xl font-black text-orange-500 mt-1">{dupes}</h4>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex items-start space-x-4">
        <div className="p-4 bg-emerald-500/10 rounded-xl text-emerald-500 mt-1">
          <FileCode2 className="w-7 h-7" />
        </div>
        <div className="flex-1">
          <p className="text-muted-foreground text-xs uppercase font-semibold mb-2">File Type Distribution</p>
          <div className="space-y-1.5">
            {Object.entries(fileStats).map(([type, count]) => (
              <div key={type} className="flex justify-between items-center text-xs">
                <span className="font-semibold text-foreground uppercase">{type} Files:</span>
                <span className="font-bold text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
