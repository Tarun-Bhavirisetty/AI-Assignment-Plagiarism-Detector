import UploadBox from "@/components/UploadBox";
import { ShieldCheck } from "lucide-react";

export default function UploadPage() {
  return (
    <div className="container mx-auto px-4 py-12 min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto mb-8 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-primary/20 rounded-full mb-4">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Secure Upload & Analysis</h1>
        <p className="text-muted-foreground">
          Upload any document, image, or video. Our AI engine will extract metadata and verify authenticity in real-time.
        </p>
      </div>
      
      <UploadBox />
    </div>
  );
}
