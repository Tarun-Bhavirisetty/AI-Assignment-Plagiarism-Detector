import Link from "next/link";
import { ArrowRight, ShieldCheck, Database, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 text-center overflow-hidden relative">
      
      {/* Background gradients */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] -z-10 pointer-events-none"></div>

      <div className="space-y-6 max-w-4xl z-10">
        <div className="inline-block px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-4">
          Next-Generation AI Content Analysis
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
          Secure. Analyze. <br className="hidden md:block"/> Protect Your Uploads.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          MetaGuard intelligently monitors uploaded content, instantly detects exact and similar duplicates, extracts deep metadata, and provides real-time analytics.
        </p>
        
        <div className="pt-8 flex items-center justify-center space-x-4">
          <Link href="/login" className="px-8 py-4 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 hover:scale-105 transition-all shadow-[0_0_30px_rgba(99,102,241,0.4)] flex items-center">
            Get Started <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 w-full max-w-6xl z-10">
        <div className="p-6 rounded-2xl bg-card/40 backdrop-blur-xl border border-white/10 hover:border-primary/50 transition-colors">
          <ShieldCheck className="w-10 h-10 text-primary mb-4" />
          <h3 className="text-xl font-bold mb-2">Smart Detection</h3>
          <p className="text-muted-foreground">Uses SHA-256 for exact matches and Perceptual Hashing & Embeddings for similar content detection.</p>
        </div>
        <div className="p-6 rounded-2xl bg-card/40 backdrop-blur-xl border border-white/10 hover:border-primary/50 transition-colors">
          <Database className="w-10 h-10 text-primary mb-4" />
          <h3 className="text-xl font-bold mb-2">Deep Metadata</h3>
          <p className="text-muted-foreground">Extract resolution, device info, duration, and formats automatically upon upload.</p>
        </div>
        <div className="p-6 rounded-2xl bg-card/40 backdrop-blur-xl border border-white/10 hover:border-primary/50 transition-colors">
          <Zap className="w-10 h-10 text-primary mb-4" />
          <h3 className="text-xl font-bold mb-2">Fast Analytics</h3>
          <p className="text-muted-foreground">Visualize your data with real-time charts powered by our high-performance backend.</p>
        </div>
      </div>
    </div>
  );
}
