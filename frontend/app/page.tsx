import Link from "next/link";
import { ArrowRight, ShieldCheck, Database, Zap, BookOpen, UserCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 text-center overflow-hidden relative">
      
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary/10 rounded-full blur-[140px] -z-10 pointer-events-none"></div>

      <div className="space-y-6 max-w-4xl z-10 pt-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-2">
          <Zap className="w-3.5 h-3.5" /> Next-Gen AI Academic Integrity & Analysis
        </div>
        
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-foreground">
          Academic Integrity. <br className="hidden md:block"/> Powered by Deep AI.
        </h1>
        
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          MetaGuard delivers multi-dimensional assignment similarity analysis, real-time online source discovery, synchronized document comparison, and academic evaluation for students and faculty.
        </p>
        
        <div className="pt-6 flex flex-wrap items-center justify-center gap-4">
          <Link 
            href="/login" 
            className="px-8 py-3.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/25 flex items-center gap-2 text-sm"
          >
            <span>Access Portal</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link 
            href="/login" 
            className="px-6 py-3.5 bg-card text-foreground font-semibold rounded-xl border border-border hover:bg-muted transition-all text-sm shadow-sm"
          >
            Create Student or Faculty Account
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 mb-12 w-full max-w-5xl z-10 text-left">
        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/50 transition-all group">
          <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-2">14-Dimensional Similarity</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Evaluates binary hash, normalized content, TF-IDF lexical overlap, transformer embeddings, and cross-sentence alignments.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/50 transition-all group">
          <div className="p-3 w-fit rounded-xl bg-blue-500/10 text-blue-500 mb-4 group-hover:scale-110 transition-transform">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-2">Tavily Online Discovery</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Crawls live web sources and indexes with asynchronous batching to identify potential external matching passages.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/50 transition-all group">
          <div className="p-3 w-fit rounded-xl bg-emerald-500/10 text-emerald-500 mb-4 group-hover:scale-110 transition-transform">
            <UserCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-2">Five-Tier Role Access</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tailored dashboards and workflows for Students, Faculty, Evaluators, Heads of Department, and System Administrators.
          </p>
        </div>
      </div>
    </div>
  );
}
