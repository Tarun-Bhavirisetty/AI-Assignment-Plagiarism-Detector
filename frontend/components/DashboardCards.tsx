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
      <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
        <div className="p-4 bg-primary/20 rounded-xl">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        <div>
          <p className="text-muted-foreground text-sm font-medium">Total Uploads</p>
          <h4 className="text-3xl font-bold">{total}</h4>
        </div>
      </div>
      
      <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-center space-x-4">
        <div className="p-4 bg-orange-500/20 rounded-xl">
          <Copy className="w-8 h-8 text-orange-500" />
        </div>
        <div>
          <p className="text-muted-foreground text-sm font-medium">High-Similarity Submissions</p>
          <h4 className="text-3xl font-bold">{dupes}</h4>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-card/40 border border-white/10 flex items-start space-x-4">
        <div className="p-4 bg-emerald-500/20 rounded-xl mt-1">
          <FileCode2 className="w-8 h-8 text-emerald-500" />
        </div>
        <div className="flex-1">
          <p className="text-muted-foreground text-sm font-medium mb-2">File Type Statistics</p>
          <div className="space-y-1">
            {Object.entries(fileStats).map(([type, count]) => (
              <div key={type} className="flex justify-between items-center text-sm">
                <span className="font-semibold">{type} Files:</span>
                <span className="text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
