import React, { useState, useEffect } from 'react';
import {
  Shield,
  FileText,
  Image as ImageIcon,
  History as HistoryIcon,
  AlertCircle,
  CheckCircle2,
  Info,
  ArrowRight,
  Upload,
  Loader2,
  ChevronRight,
  Search,
  Zap,
  Lock,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import ReactMarkdown from 'react-markdown';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- API Base URL ---
const API_BASE = 'https://content-authenticity-verifier-production.up.railway.app';

// --- Types ---
type Page = 'landing' | 'text' | 'image' | 'video' | 'link' | 'profile' | 'prompt' | 'pricing' | 'history';

interface AnalysisResult {
  aiProbability: number;
  humanProbability: number;
  confidence: string;
  explanation: string;
  plagiarism?: {
    isPlagiarized: boolean;
    sources: string[];
    score: number;
  };
  credibility?: {
    rating: string;
    reason: string;
  };
  comparison?: {
    humanTraits: string;
    detectedTraits: string;
  };
  suspiciousSections?: {
    text: string;
    reason: string;
    severity: string;
  }[];
  watermarkDetected?: boolean;
  manipulatedRegions?: {
    region: string;
    issue: string;
    severity: string;
  }[];
  reverseSearch?: {
    found: boolean;
    similarSources: string[];
  };
  deepfakeSigns?: string[];
  sourceRating?: string;
  isFake?: boolean;
  isAIInfluencer?: boolean;
  botProbability?: number;
  redFlags?: string[];
  exif?: any;
}

interface HistoryItem {
  id: number;
  type: string;
  content: string;
  result: string;
  created_at: string;
}

// --- Components ---

const Navbar = ({ currentPage, setPage }: { currentPage: Page, setPage: (p: Page) => void }) => (
  <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
    <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <div
        className="flex items-center gap-2 cursor-pointer group"
        onClick={() => setPage('landing')}
      >
        <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center shadow-lg shadow-brand-primary/20 group-hover:scale-110 transition-transform">
          <Shield className="text-white w-6 h-6" />
        </div>
        <span className="text-xl font-bold brand-text-gradient tracking-tight">VERIFY</span>
      </div>

      <div className="hidden lg:flex items-center gap-6">
        {[
          { id: 'text', label: 'Text', icon: FileText },
          { id: 'image', label: 'Image', icon: ImageIcon },
          { id: 'video', label: 'Video', icon: Zap },
          { id: 'link', label: 'Link', icon: Globe },
          { id: 'profile', label: 'Profile', icon: Shield },
          { id: 'prompt', label: 'Prompt Lab', icon: Zap },
          { id: 'pricing', label: 'Pricing', icon: Lock },
          { id: 'history', label: 'History', icon: HistoryIcon },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id as Page)}
            className={cn(
              "flex items-center gap-2 text-sm font-bold transition-colors hover:text-brand-primary",
              currentPage === item.id ? "text-brand-primary" : "text-high"
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => setPage('text')}
        className="accent-gradient px-5 py-2 rounded-full text-sm font-bold text-white hover:opacity-90 transition-opacity shadow-lg shadow-brand-secondary/20"
      >
        Get Started
      </button>
    </div>
  </nav>
);

const HighlightedText = ({ text, suspiciousSections }: { text: string, suspiciousSections: any[] }) => {
  if (!suspiciousSections || suspiciousSections.length === 0) return <p className="text-high leading-relaxed whitespace-pre-wrap">{text}</p>;

  // Sort by length descending to handle overlapping matches properly
  const sortedSections = [...suspiciousSections].sort((a, b) => b.text.length - a.text.length);

  let parts: (string | React.ReactNode)[] = [text];

  sortedSections.forEach((section) => {
    const newParts: (string | React.ReactNode)[] = [];
    parts.forEach((part) => {
      if (typeof part !== 'string') {
        newParts.push(part);
        return;
      }

      const index = part.indexOf(section.text);
      if (index === -1) {
        newParts.push(part);
      } else {
        const before = part.substring(0, index);
        const match = part.substring(index, index + section.text.length);
        const after = part.substring(index + section.text.length);

        if (before) newParts.push(before);
        newParts.push(
          <span
            key={section.text + index + Math.random()}
            className={cn(
              "px-1 rounded cursor-help transition-all border-b-2",
              section.severity === 'High' ? "bg-rose-500/20 border-rose-500/50 hover:bg-rose-500/40" :
                section.severity === 'Medium' ? "bg-amber-500/20 border-amber-500/50 hover:bg-amber-500/40" :
                  "bg-blue-500/20 border-blue-500/50 hover:bg-blue-500/40"
            )}
            title={`${section.severity} Severity: ${section.reason}`}
          >
            {match}
          </span>
        );
        if (after) newParts.push(after);
      }
    });
    parts = newParts;
  });

  return <div className="text-high leading-relaxed whitespace-pre-wrap font-sans">{parts}</div>;
};

const ResultDisplay = ({ result, type, originalText }: { result: AnalysisResult, type: 'text' | 'image', originalText?: string }) => {
  const score = result.humanProbability ?? 0;
  const aiScore = result.aiProbability ?? 0;

  const verdictColor =
    aiScore >= 70 ? { bg: 'bg-rose-500/15', border: 'border-rose-500/40', text: 'text-rose-400', glow: 'shadow-rose-500/20', label: 'LIKELY AI / FAKE', dot: 'bg-rose-500' } :
      aiScore >= 40 ? { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-400', glow: 'shadow-amber-500/20', label: 'SUSPICIOUS', dot: 'bg-amber-500' } :
        { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', glow: 'shadow-emerald-500/20', label: 'LIKELY AUTHENTIC', dot: 'bg-emerald-500' };

  const confidenceStyle =
    result.confidence === 'High' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
      result.confidence === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
        'bg-rose-500/10 text-rose-400 border-rose-500/30';

  const downloadReport = () => {
    const report = `AUTHENTICITY REPORT\nGenerated: ${new Date().toLocaleString()}\n${'─'.repeat(40)}\nType: ${type.toUpperCase()}\nVerdict: ${verdictColor.label}\nAI Probability: ${aiScore}%\nAuthenticity: ${score}%\nConfidence: ${result.confidence}\n${'─'.repeat(40)}\nANALYSIS:\n${result.explanation?.replace(/\*\*/g, '')}`;
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `verify-report-${Date.now()}.txt`; a.click();
  };

  // Circular gauge parameters
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-5 mt-6">

      {/* ── Verdict Banner ── */}
      <div className={cn("rounded-2xl border px-5 py-3 flex items-center justify-between", verdictColor.bg, verdictColor.border)}>
        <div className="flex items-center gap-3">
          <div className={cn("w-2.5 h-2.5 rounded-full animate-pulse", verdictColor.dot)} />
          <span className={cn("font-black text-sm tracking-widest uppercase", verdictColor.text)}>{verdictColor.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border", confidenceStyle)}>
            {result.confidence} Confidence
          </span>
          <button onClick={downloadReport} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors">
            <FileText className="w-3.5 h-3.5" /> Report
          </button>
        </div>
      </div>

      {/* ── Main Score + Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* Gauge */}
        <div className="glass rounded-2xl p-6 flex flex-col items-center justify-center gap-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Authenticity Score</p>
          <div className="relative w-36 h-36">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
              <circle
                cx="60" cy="60" r={radius} fill="none"
                stroke={aiScore >= 70 ? '#f43f5e' : aiScore >= 40 ? '#f59e0b' : '#10b981'}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 6px ${aiScore >= 70 ? '#f43f5e' : aiScore >= 40 ? '#f59e0b' : '#10b981'})` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-white">{score}%</span>
              <span className="text-[9px] text-white/40 uppercase font-black tracking-wider">Human</span>
            </div>
          </div>
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#10b981]" /><span className="text-white/50 font-semibold">Authentic</span></div>
              <span className="font-black text-white">{score}%</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#D4AF37]" /><span className="text-white/50 font-semibold">AI-Generated</span></div>
              <span className="font-black text-white">{aiScore}%</span>
            </div>
          </div>
          {/* Bar */}
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#10b981] to-[#D4AF37] transition-all duration-1000"
              style={{ width: `${aiScore}%` }} />
          </div>
        </div>

        {/* Analysis Text */}
        <div className="glass rounded-2xl p-6 md:col-span-2 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-brand-primary" />
            </div>
            <h3 className="text-lg font-black text-white tracking-tight">Analysis Summary</h3>
          </div>
          <div className="text-sm text-white/70 leading-relaxed font-normal overflow-y-auto max-h-52 custom-scrollbar pr-1">
            <ReactMarkdown
              components={{
                strong: ({ children }) => <span className="text-white font-semibold">{children}</span>,
                p: ({ children }) => <p className="mb-2">{children}</p>,
                li: ({ children }) => <li className="ml-4 list-disc mb-1">{children}</li>,
              }}
            >
              {result.explanation}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* ── Text-specific cards ── */}
      {type === 'text' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {result.plagiarism && (
              <div className="glass rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-brand-primary" />
                  <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary">Plagiarism Check</h4>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-black text-white">{result.plagiarism.score}%</p>
                    <p className="text-xs text-white/40 font-medium">similarity match</p>
                  </div>
                  <span className={cn("px-3 py-1.5 rounded-xl text-xs font-bold",
                    result.plagiarism.isPlagiarized ? "bg-rose-500/15 text-rose-400 border border-rose-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30")}>
                    {result.plagiarism.isPlagiarized ? "⚠ Copied Content" : "✓ Original Content"}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${result.plagiarism.score}%`, background: result.plagiarism.isPlagiarized ? '#f43f5e' : '#10b981' }} />
                </div>
                {result.plagiarism.sources.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Potential Sources</p>
                    {result.plagiarism.sources.map((s, i) => (
                      <div key={i} className="text-xs text-brand-primary truncate hover:underline cursor-pointer">{s}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result.credibility && (
              <div className="glass rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-brand-primary" />
                  <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary">Source Credibility</h4>
                </div>
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-lg",
                    result.credibility.rating === 'Trusted' ? "bg-emerald-500/15" : result.credibility.rating === 'Risky' ? "bg-rose-500/15" : "bg-amber-500/15")}>
                    {result.credibility.rating === 'Trusted' ? '✓' : result.credibility.rating === 'Risky' ? '✗' : '⚠'}
                  </div>
                  <div>
                    <p className={cn("text-xl font-black",
                      result.credibility.rating === 'Trusted' ? "text-emerald-400" : result.credibility.rating === 'Risky' ? "text-rose-400" : "text-amber-400")}>
                      {result.credibility.rating}
                    </p>
                    <p className="text-[10px] text-white/30 font-medium">credibility rating</p>
                  </div>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{result.credibility.reason}</p>
              </div>
            )}
          </div>

          {result.comparison && (
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-brand-primary" />
                <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary">AI vs Human Writing Comparison</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">✓ Human Traits</p>
                  <p className="text-sm text-white/70 leading-relaxed">{result.comparison.humanTraits}</p>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">⚡ Detected Traits</p>
                  <p className="text-sm text-white/70 leading-relaxed">{result.comparison.detectedTraits}</p>
                </div>
              </div>
            </div>
          )}

          {result.suspiciousSections && result.suspiciousSections.length > 0 && (
            <>
              <div className="glass rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-brand-primary" />
                    <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary">Annotated Content</h4>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-white/30 font-bold uppercase">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> High</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Medium</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Low</span>
                  </div>
                </div>
                <div className="bg-black/30 p-4 rounded-xl border border-white/5 max-h-64 overflow-y-auto custom-scrollbar text-sm leading-relaxed">
                  <HighlightedText text={originalText || ""} suspiciousSections={result.suspiciousSections} />
                </div>
              </div>

              <div className="glass rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <h4 className="text-xs font-black uppercase tracking-widest text-rose-400">Flagged Patterns</h4>
                </div>
                <div className="space-y-3">
                  {result.suspiciousSections.map((section, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className={cn("mt-0.5 w-1.5 h-1.5 rounded-full shrink-0",
                        section.severity === 'High' ? 'bg-rose-500' : section.severity === 'Medium' ? 'bg-amber-500' : 'bg-blue-500')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/80 italic mb-1 truncate">"{section.text}"</p>
                        <p className="text-xs text-white/40">{section.reason}</p>
                      </div>
                      <span className={cn("shrink-0 text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                        section.severity === 'High' ? 'bg-rose-500/15 text-rose-400' : section.severity === 'Medium' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400')}>
                        {section.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Image-specific cards ── */}
      {type === 'image' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {result.manipulatedRegions && result.manipulatedRegions.length > 0 && (
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <h4 className="text-xs font-black uppercase tracking-widest text-rose-400">Manipulation Detected</h4>
              </div>
              <div className="space-y-2">
                {result.manipulatedRegions.map((region, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/5">
                    <div>
                      <p className="text-sm font-semibold text-white">{region.region}</p>
                      <p className="text-xs text-white/40">{region.issue}</p>
                    </div>
                    <span className={cn("text-[10px] font-black px-2 py-1 rounded-lg",
                      region.severity === 'High' ? "bg-rose-500/15 text-rose-400" : "bg-amber-500/15 text-amber-400")}>
                      {region.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.reverseSearch && (
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-brand-primary" />
                <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary">Reverse Image Search</h4>
              </div>
              <div className={cn("flex items-center gap-3 p-4 rounded-xl",
                result.reverseSearch.found ? "bg-rose-500/10 border border-rose-500/20" : "bg-emerald-500/10 border border-emerald-500/20")}>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-xl",
                  result.reverseSearch.found ? "bg-rose-500/15" : "bg-emerald-500/15")}>
                  {result.reverseSearch.found ? '⚠' : '✓'}
                </div>
                <div>
                  <p className={cn("font-black text-base", result.reverseSearch.found ? "text-rose-400" : "text-emerald-400")}>
                    {result.reverseSearch.found ? "Found Online" : "Unique Image"}
                  </p>
                  <p className="text-xs text-white/40">{result.reverseSearch.found ? "Image exists elsewhere" : "No matches found"}</p>
                </div>
              </div>
              {result.reverseSearch.similarSources.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase font-black text-white/30 tracking-wider">Similar Sources</p>
                  {result.reverseSearch.similarSources.map((s, i) => (
                    <div key={i} className="text-xs text-brand-primary truncate hover:underline cursor-pointer">{s}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};


// --- Main Pages ---

// --- Main Pages ---

const LandingPage = ({ setPage }: { setPage: (p: Page) => void }) => (
  <div className="pt-32 pb-20 px-4 max-w-7xl mx-auto space-y-32">
    {/* Hero Section */}
    <div className="text-center space-y-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="inline-flex items-center gap-2 px-6 py-2 rounded-full glass border-brand-primary/40 text-brand-primary text-sm font-black uppercase tracking-widest"
      >
        <Zap className="w-4 h-4" />
        AI-Powered Content Verification
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-6xl md:text-9xl font-black tracking-tighter leading-[0.85] text-high"
      >
        THE DIGITAL <br />
        <span className="brand-text-gradient">AUTHENTICITY</span> SHIELD
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-high text-xl md:text-2xl max-w-3xl mx-auto font-bold leading-relaxed"
      >
        Instantly verify if text, images, or videos are AI-generated.
        Audit social profiles and verify links across Instagram, YouTube, and Facebook.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap justify-center gap-6 pt-8"
      >
        <button
          onClick={() => setPage('text')}
          className="brand-gradient px-12 py-5 rounded-2xl text-white font-black text-lg shadow-[0_0_40px_rgba(56,189,248,0.3)] hover:scale-105 transition-transform"
        >
          START VERIFICATION
        </button>
        <button
          onClick={() => setPage('pricing')}
          className="glass px-12 py-5 rounded-2xl text-high font-black text-lg border-white/30 hover:bg-white/10 transition-all"
        >
          VIEW PRICING
        </button>
      </motion.div>
    </div>

    {/* Mission Section */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
      <div className="space-y-8">
        <div className="space-y-4">
          <h2 className="text-4xl md:text-6xl font-black text-high tracking-tight">OUR MISSION</h2>
          <div className="h-2 w-24 brand-gradient rounded-full" />
        </div>
        <p className="text-medium text-xl leading-relaxed font-medium">
          In an era where AI can mimic human creativity with terrifying precision, the truth is becoming a luxury. We are building <span className="text-brand-primary font-bold">VERIFY</span> to restore trust in the digital world.
        </p>
        <div className="space-y-6">
          {[
            { title: "The Problem", desc: "Deepfakes, AI-generated misinformation, and fake personas are eroding the fabric of digital trust." },
            { title: "What We Fight For", desc: "Digital integrity, content ownership, and the right to know if you are interacting with a human or an algorithm." },
            { title: "Why It Matters", desc: "Without authenticity, information loses value. We provide the forensic tools to protect the truth." }
          ].map((item, i) => (
            <div key={i} className="glass p-6 rounded-3xl border-white/10">
              <h3 className="text-brand-primary font-black text-lg uppercase tracking-widest mb-2">{item.title}</h3>
              <p className="text-medium font-bold">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="relative">
        <div className="absolute inset-0 brand-gradient blur-[120px] opacity-10 rounded-full" />
        <div className="glass p-12 rounded-[60px] border-white/20 relative z-10 space-y-8">
          <Shield className="w-20 h-20 text-brand-primary mx-auto" />
          <h3 className="text-3xl font-black text-center text-high">SECURE THE TRUTH</h3>
          <p className="text-medium text-center font-bold">
            Our forensic engines analyze patterns that the human eye misses. From facial inconsistencies in videos to linguistic signatures in text.
          </p>
        </div>
      </div>
    </div>

    {/* Founders Section */}
    <div className="space-y-16">
      <div className="text-center space-y-4">
        <h2 className="text-4xl md:text-6xl font-black text-high tracking-tight">THE FOUNDERS</h2>
        <p className="text-brand-primary font-black uppercase tracking-[0.3em]">The Minds Behind the Shield</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { name: "Arya Basak", desc: "Leading the charge in digital forensics and strategic growth." },
          { name: "Avinandhan Gupta", desc: "Architecting the core AI detection engines and security protocols." },
          { name: "Tithi Bhera", desc: "Crafting the user experience and ensuring forensic precision." }
        ].map((founder, i) => (
          <div key={i} className="glass p-10 rounded-[40px] border-white/20 hover:border-brand-primary/50 transition-all group">
            <div className="w-20 h-20 rounded-3xl brand-gradient flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Shield className="text-white w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-high mb-4">{founder.name}</h3>
            <p className="text-medium font-bold leading-relaxed">{founder.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const TextVerifier = () => {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('English');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [realtimeWarning, setRealtimeWarning] = useState<string | null>(null);

  // Real-time typing analysis (simplified)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (text.length > 100) {
        // Mock real-time warning logic
        const words = text.split(' ');
        const uniqueWords = new Set(words).size;
        if (uniqueWords / words.length < 0.4) {
          setRealtimeWarning("High repetition detected. Potential AI pattern.");
        } else {
          setRealtimeWarning(null);
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [text]);

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/detect/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto space-y-8">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight brand-text-gradient">TEXT VERIFICATION</h2>
          <p className="text-medium font-bold">Paste an article, essay, or news snippet to analyze its authenticity.</p>
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none cursor-pointer"
        >
          <option value="English" className="bg-[#1A1A1A] text-white">English</option>
          <option value="Hindi" className="bg-[#1A1A1A] text-white">Hindi</option>
          <option value="Bengali" className="bg-[#1A1A1A] text-white">Bengali</option>
          <option value="Spanish" className="bg-[#1A1A1A] text-white">Spanish</option>
        </select>
      </div>

      <div className="glass p-6 rounded-3xl space-y-4">
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste content here (min 50 words recommended)..."
            className="w-full h-64 bg-black/20 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/20 focus:outline-none focus:border-brand-primary/50 transition-colors resize-none"
          />
          <AnimatePresence>
            {realtimeWarning && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-4 left-4 right-4 bg-rose-500/90 backdrop-blur p-2 rounded-lg text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4" />
                {realtimeWarning}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-medium font-black font-mono">{text.length} characters</span>
          <button
            onClick={analyze}
            disabled={loading || !text.trim()}
            className="brand-gradient px-8 py-3 rounded-xl text-white font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            Analyze Content
          </button>
        </div>
      </div>

      {result && <ResultDisplay result={result} type="text" originalText={text} />}
    </div>
  );
};

const ImageVerifier = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [mode, setMode] = useState<'upload' | 'camera'>('upload');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  // Start camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (e: any) {
      setCameraError(e.name === 'NotAllowedError' ? 'Camera permission denied. Please allow access.' : 'Could not access camera: ' + e.message);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const captured = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setFile(captured);
      setPreview(URL.createObjectURL(blob));
      setResult(null);
      stopCamera();
    }, 'image/jpeg', 0.95);
  };

  // Cleanup on unmount
  React.useEffect(() => () => stopCamera(), []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); }
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/detect/image`, { method: 'POST', body: formData });
      const data = await res.json();
      setResult(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); };

  return (
    <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight brand-text-gradient">IMAGE VERIFICATION</h2>
        <p className="text-white/50 text-sm">Forensic-level detection of AI generation, deepfakes, and digital manipulation.</p>
      </div>

      {/* Mode Switcher */}
      <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-fit">
        {(['upload', 'camera'] as const).map(m => (
          <button key={m} onClick={() => { setMode(m); reset(); stopCamera(); }}
            className={cn("px-5 py-2 rounded-lg text-sm font-black transition-all capitalize flex items-center gap-2",
              mode === m ? "bg-brand-primary text-white shadow-lg" : "text-white/40 hover:text-white")}>
            {m === 'upload' ? <Upload className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            {m === 'upload' ? 'Upload File' : 'Live Camera'}
          </button>
        ))}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {/* Camera Mode */}
        {mode === 'camera' && (
          <div className="p-6 space-y-4">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
              {cameraActive ? (
                <>
                  <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                  {/* Scanning overlay */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-4 border-2 border-brand-primary/60 rounded-lg" />
                    <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-brand-primary rounded-tl-lg" />
                    <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-brand-primary rounded-tr-lg" />
                    <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-brand-primary rounded-bl-lg" />
                    <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-brand-primary rounded-br-lg" />
                    <motion.div
                      animate={{ top: ['10%', '90%', '10%'] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute left-4 right-4 h-0.5 bg-brand-primary/80 shadow-[0_0_8px_#38BDF8]"
                      style={{ position: 'absolute' }}
                    />
                  </div>
                </>
              ) : preview ? (
                <img src={preview} className="w-full h-full object-contain" alt="Captured" />
              ) : (
                <div className="text-center space-y-3 p-8">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
                    <Search className="w-8 h-8 text-white/20" />
                  </div>
                  <p className="text-white/40 text-sm">Click "Start Camera" to begin</p>
                  {cameraError && <p className="text-rose-400 text-xs bg-rose-500/10 px-3 py-2 rounded-lg">{cameraError}</p>}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              {!cameraActive && !preview && (
                <button onClick={startCamera} className="flex-1 brand-gradient py-3 rounded-xl text-white font-black flex items-center justify-center gap-2">
                  <Search className="w-5 h-5" /> Start Camera
                </button>
              )}
              {cameraActive && (
                <>
                  <button onClick={capturePhoto} className="flex-1 brand-gradient py-3 rounded-xl text-white font-black flex items-center justify-center gap-2">
                    <Shield className="w-5 h-5" /> Capture Photo
                  </button>
                  <button onClick={stopCamera} className="px-4 py-3 rounded-xl bg-white/5 text-white/60 hover:bg-rose-500/20 hover:text-rose-400 transition-all font-bold">
                    Cancel
                  </button>
                </>
              )}
              {preview && !cameraActive && (
                <>
                  <button onClick={analyze} disabled={loading}
                    className="flex-1 brand-gradient py-3 rounded-xl text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                    {loading ? 'Analyzing...' : 'Analyze This Photo'}
                  </button>
                  <button onClick={() => { reset(); startCamera(); }} className="px-4 py-3 rounded-xl bg-white/5 text-white/60 hover:text-white transition-all font-bold text-sm">
                    Retake
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Upload Mode */}
        {mode === 'upload' && (
          <div className="p-6 space-y-4">
            {!preview ? (
              <label htmlFor="img-upload" className="block">
                <div className="border-2 border-dashed border-white/10 hover:border-brand-primary/50 transition-colors rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer group">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-brand-primary/10 transition-all">
                    <Upload className="w-8 h-8 text-white/30 group-hover:text-brand-primary transition-colors" />
                  </div>
                  <p className="text-white/70 font-semibold mb-1">Drop image here or click to browse</p>
                  <p className="text-white/30 text-xs">PNG, JPG, WEBP, GIF — up to 10MB</p>
                </div>
                <input id="img-upload" type="file" className="hidden" onChange={onFileChange} accept="image/*" />
              </label>
            ) : (
              <div className="relative rounded-xl overflow-hidden">
                <img src={preview} className="w-full max-h-80 object-contain bg-black/30 rounded-xl" alt="Preview" />
                {loading && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4 rounded-xl">
                    <div className="relative">
                      <Shield className="w-12 h-12 text-brand-primary" />
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0 border-2 border-transparent border-t-brand-primary rounded-full"
                      />
                    </div>
                    <p className="text-white/70 text-sm font-black uppercase tracking-widest">Forensic Scan Running...</p>
                    <p className="text-white/30 text-xs">Analyzing pixels, edges, noise patterns</p>
                  </div>
                )}
                <button onClick={reset}
                  className="absolute top-3 right-3 bg-black/60 hover:bg-rose-500 p-2 rounded-full transition-colors text-white/70">
                  <AlertCircle className="w-4 h-4" />
                </button>
              </div>
            )}

            {preview && (
              <button onClick={analyze} disabled={loading || !file}
                className="w-full brand-gradient py-4 rounded-xl text-white font-black flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-[1.01] transition-transform">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                {loading ? 'Running Forensic Analysis...' : 'Run Full Forensic Scan'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <ResultDisplay result={result} type="image" />
        </motion.div>
      )}

      {!result && !loading && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
            <Info className="w-6 h-6 text-white/20" />
          </div>
          <p className="text-white/40 text-sm">Upload an image or use your camera — forensic results appear here</p>
          <div className="flex flex-wrap gap-3 justify-center pt-1">
            {['GAN/Diffusion Fingerprints', 'Pixel Noise Analysis', 'Edge Artifact Detection', 'Lighting Physics', 'Facial Geometry'].map(tag => (
              <span key={tag} className="text-[10px] bg-white/5 px-3 py-1 rounded-full text-white/30 font-bold uppercase tracking-wider">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};




const History = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // History endpoint not yet implemented in backend
    setLoading(false);
  }, []);

  return (
    <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black tracking-tight brand-text-gradient">ANALYSIS HISTORY</h2>
        <p className="text-medium font-bold">Review your past verifications and authenticity reports.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
        </div>
      ) : history.length === 0 ? (
        <div className="glass p-20 rounded-3xl text-center space-y-4">
          <HistoryIcon className="w-12 h-12 text-white/10 mx-auto" />
          <p className="text-high font-bold">No verification history found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((item) => {
            const result = JSON.parse(item.result);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass p-6 rounded-2xl flex items-center justify-between group hover:border-brand-primary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    item.type === 'text' ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"
                  )}>
                    {item.type === 'text' ? <FileText className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-white/90">{item.content}</h3>
                    <p className="text-xs text-white/30">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Score</p>
                    <p className="text-xl font-bold brand-text-gradient">{result.authenticityScore}%</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-brand-primary transition-colors" />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const VersionComparison = () => {
  const [text1, setText1] = useState('');
  const [text2, setText2] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const compare = async () => {
    setLoading(true);
    try {
      // Compare: run two separate text detections and compare results
      const [res1, res2] = await Promise.all([
        fetch(`${API_BASE}/api/detect/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text1 })
        }),
        fetch(`${API_BASE}/api/detect/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text2 })
        })
      ]);
      const [data1, data2] = await Promise.all([res1.json(), res2.json()]);
      const score1 = data1.humanProbability ?? 0;
      const score2 = data2.humanProbability ?? 0;
      setResult({
        winner: score1 >= score2 ? 'Version 1' : 'Version 2',
        reason: `Version 1 authenticity: ${score1}% | Version 2 authenticity: ${score2}%`,
        differences: [
          `Version 1 AI probability: ${data1.aiProbability ?? 0}%`,
          `Version 2 AI probability: ${data2.aiProbability ?? 0}%`,
          `Version 1 confidence: ${data1.confidence ?? 'N/A'}`,
          `Version 2 confidence: ${data2.confidence ?? 'N/A'}`,
        ]
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-20 px-4 max-w-6xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black tracking-tight brand-text-gradient">VERSION COMPARISON</h2>
        <p className="text-white/50">Compare two versions of content to see which is more authentic.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass p-6 rounded-3xl space-y-4">
          <h3 className="text-sm font-bold text-brand-primary uppercase tracking-widest">Version 1</h3>
          <textarea
            value={text1}
            onChange={(e) => setText1(e.target.value)}
            className="w-full h-64 bg-black/20 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-brand-primary/50 transition-colors resize-none"
          />
        </div>
        <div className="glass p-6 rounded-3xl space-y-4">
          <h3 className="text-sm font-bold text-brand-primary uppercase tracking-widest">Version 2</h3>
          <textarea
            value={text2}
            onChange={(e) => setText2(e.target.value)}
            className="w-full h-64 bg-black/20 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-brand-primary/50 transition-colors resize-none"
          />
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={compare}
          disabled={loading || !text1 || !text2}
          className="brand-gradient px-12 py-4 rounded-2xl text-white font-bold flex items-center gap-2 hover:scale-105 transition-transform"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          Compare Versions
        </button>
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-8 rounded-3xl space-y-6"
        >
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-bold">
              Winner: {result.winner}
            </div>
            <p className="text-white/80 font-medium">{result.reason}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Key Differences</p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.differences.map((diff: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
                  {diff}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </div>
  );
};

const SplashScreen = ({ onComplete }: { onComplete: () => void }) => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] bg-[#0A0A0A] flex flex-col items-center justify-center overflow-hidden"
    >
      <div className="relative">
        {/* Shield Icon Animation */}
        <motion.div
          initial={{ scale: 0, rotate: -180, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 20,
            duration: 1
          }}
          className="w-32 h-32 rounded-3xl brand-gradient flex items-center justify-center shadow-[0_0_60px_rgba(56,189,248,0.4)] relative z-10"
        >
          <Shield className="text-white w-16 h-16" />
        </motion.div>

        {/* Scanning Effect */}
        <motion.div
          initial={{ top: "-10%", opacity: 0 }}
          animate={{ top: "110%", opacity: [0, 1, 1, 0] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute left-[-30%] right-[-30%] h-0.5 bg-brand-primary shadow-[0_0_20px_#38BDF8] z-20"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="mt-12 text-center space-y-6"
      >
        <div className="space-y-2">
          <h1 className="text-4xl font-black brand-text-gradient tracking-tighter">VERIFY</h1>
          <p className="text-medium font-black text-[10px] uppercase tracking-[0.4em]">Digital Authenticity Shield</p>
        </div>

        <div className="w-64 h-1 bg-white/10 rounded-full mx-auto overflow-hidden relative">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 2, ease: "circOut" }}
            onAnimationComplete={() => setTimeout(onComplete, 500)}
            className="h-full brand-gradient shadow-[0_0_10px_#38BDF8]"
          />
        </div>

        <motion.p
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-medium font-black text-[9px] uppercase tracking-widest"
        >
          Initializing Forensic Engines...
        </motion.p>
      </motion.div>

      {/* Background Atmosphere */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-primary/5 blur-[150px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] mix-blend-overlay" />
      </div>
    </motion.div>
  );
};

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);
    try {
      // Quick chat using text detection as a proxy
      const res = await fetch(`${API_BASE}/api/detect/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userMsg })
      });
      const data = await res.json();
      const reply = data.explanation ?? data.summary ?? 'Analysis complete. Please use the dedicated analysis pages for detailed results.';
      setMessages(prev => [...prev, { role: 'ai', text: reply }]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="glass w-80 h-[450px] mb-4 rounded-3xl flex flex-col overflow-hidden shadow-2xl border-brand-primary/20"
          >
            <div className="brand-gradient p-4 flex items-center justify-between">
              <span className="font-black text-white text-sm tracking-widest">VERIFY AI</span>
              <button onClick={() => setIsOpen(false)} className="text-black/60 hover:text-black">
                <AlertCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/40">
              {messages.map((m, i) => (
                <div key={i} className={cn(
                  "max-w-[80%] p-3 rounded-2xl text-xs leading-relaxed",
                  m.role === 'user' ? "bg-brand-primary text-white ml-auto font-bold" : "bg-white/10 text-white/90 mr-auto"
                )}>
                  {m.text}
                </div>
              ))}
              {loading && <Loader2 className="w-4 h-4 animate-spin text-brand-primary mx-auto" />}
            </div>
            <div className="p-4 border-t border-white/10 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Ask anything..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-primary/50"
              />
              <button onClick={sendMessage} className="brand-gradient p-2 rounded-xl text-white">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full brand-gradient flex items-center justify-center shadow-2xl shadow-brand-primary/40 hover:scale-110 transition-transform"
      >
        <Shield className="text-white w-6 h-6" />
      </button>
    </div>
  );
};

const Pricing = () => (
  <div className="pt-32 pb-20 px-4 max-w-7xl mx-auto">
    <div className="text-center space-y-4 mb-16">
      <h2 className="text-4xl font-black brand-text-gradient tracking-tighter">CHOOSE YOUR SHIELD</h2>
      <p className="text-medium font-bold max-w-xl mx-auto">Professional forensic tools for individuals and enterprises.</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {[
        { name: 'Basic', price: 'Free', features: ['Text Analysis', 'Image Analysis', 'History (24h)', 'Standard Confidence'] },
        { name: 'Pro', price: '$29/mo', features: ['Video Deepfake Detection', 'Link Analysis', 'Prompt Lab Access', 'Full History', 'Priority Support'], popular: true },
        { name: 'Enterprise', price: 'Custom', features: ['API Integration', 'Bulk Processing', 'Custom ML Models', 'Dedicated Forensic Expert'] },
      ].map((plan, i) => (
        <div key={i} className={cn(
          "glass p-8 rounded-[40px] flex flex-col space-y-8 relative",
          plan.popular ? "border-brand-primary/50 scale-105 shadow-2xl shadow-brand-primary/10" : "border-white/5"
        )}>
          {plan.popular && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 brand-gradient px-4 py-1 rounded-full text-[10px] font-black text-white uppercase tracking-widest">Most Popular</div>}
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-high">{plan.name}</h3>
            <p className="text-4xl font-black brand-text-gradient">{plan.price}</p>
          </div>
          <ul className="space-y-4 flex-1">
            {plan.features.map((f, j) => (
              <li key={j} className="flex items-center gap-3 text-sm text-medium font-bold">
                <CheckCircle2 className="w-4 h-4 text-brand-primary" /> {f}
              </li>
            ))}
          </ul>
          <button className={cn(
            "w-full py-4 rounded-2xl font-bold transition-all",
            plan.popular ? "brand-gradient text-white" : "bg-white/5 text-white hover:bg-white/10"
          )}>
            Get Started
          </button>
        </div>
      ))}
    </div>
  </div>
);

const PromptLab = () => {
  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState<'text' | 'image'>('text');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const generate = async () => {
    setLoading(true);
    try {
      // Prompt lab: detect if the given prompt text looks AI-generated
      const res = await fetch(`${API_BASE}/api/detect/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt })
      });
      const data = await res.json();
      setResult({ text: data.explanation ?? 'Analysis complete.' });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black tracking-tight brand-text-gradient">PROMPT LAB</h2>
        <p className="text-medium font-bold">Generate high-quality AI content or test detection bypasses.</p>
      </div>
      <div className="glass p-8 rounded-[40px] space-y-6">
        <div className="flex gap-4">
          <button onClick={() => setType('text')} className={cn("flex-1 py-3 rounded-xl font-black text-sm transition-all", type === 'text' ? "brand-gradient text-white" : "bg-white/5 text-high")}>Text Generation</button>
          <button onClick={() => setType('image')} className={cn("flex-1 py-3 rounded-xl font-black text-sm transition-all", type === 'image' ? "brand-gradient text-white" : "bg-white/5 text-high")}>Image Generation</button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`Describe the ${type} you want to generate...`}
          className="w-full h-40 bg-black/40 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-brand-primary/50"
        />
        <button onClick={generate} disabled={loading || !prompt} className="w-full brand-gradient py-4 rounded-2xl text-white font-black flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
          Generate Content
        </button>
      </div>
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass p-8 rounded-[40px]">
          {type === 'image' ? (
            <img src={result.imageUrl} className="w-full rounded-2xl shadow-2xl" alt="Generated" />
          ) : (
            <div className="prose prose-invert max-w-none text-white/90 leading-relaxed">
              <ReactMarkdown>{result.text}</ReactMarkdown>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

const LinkVerifier = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const analyze = async () => {
    setLoading(true);
    try {
      // Link verifier: fetch page text and run text detection
      const res = await fetch(`${API_BASE}/api/detect/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `Verify the following URL for authenticity and fake news: ${url}`, url })
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black tracking-tight brand-text-gradient">LINK ANALYSIS</h2>
        <p className="text-medium font-bold">Paste a social media link (Instagram, YouTube, FB) to verify content authenticity.</p>
      </div>
      <div className="glass p-8 rounded-[40px] space-y-6">
        <div className="flex gap-4">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://instagram.com/p/..."
            className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-brand-primary/50"
          />
          <button onClick={analyze} disabled={loading || !url} className="brand-gradient px-8 rounded-2xl text-white font-black">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify"}
          </button>
        </div>
      </div>
      {result && <ResultDisplay result={result} type="text" />}
    </div>
  );
};

const ProfileVerifier = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const analyze = async () => {
    setLoading(true);
    try {
      // Extract username from URL
      const username = url.split('/').filter(Boolean).pop() ?? url;
      const platform = url.includes('instagram') ? 'instagram' : url.includes('facebook') ? 'facebook' : url.includes('twitter') || url.includes('x.com') ? 'twitter' : 'unknown';
      const res = await fetch(`${API_BASE}/api/detect/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, platform })
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black tracking-tight brand-text-gradient">PROFILE AUDIT</h2>
        <p className="text-medium font-bold">Audit social media profiles to detect AI influencers, bots, or fake personas.</p>
      </div>
      <div className="glass p-8 rounded-[40px] space-y-6">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Profile URL (e.g., https://instagram.com/username)"
          className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-brand-primary/50"
        />
        <button onClick={analyze} disabled={loading || !url} className="w-full brand-gradient py-4 rounded-2xl text-white font-black flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
          Audit Profile
        </button>
      </div>
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass p-8 rounded-[40px] space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black">{result.isAIInfluencer ? "AI Influencer Detected" : "Likely Human"}</h3>
            <div className="text-right">
              <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Bot Probability</p>
              <p className="text-3xl font-black brand-text-gradient">{result.botProbability}%</p>
            </div>
          </div>
          <p className="text-high font-bold leading-relaxed">{result.explanation}</p>
          {result.redFlags && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-rose-400 uppercase tracking-widest">Red Flags</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.redFlags.map((flag, i) => (
                  <div key={i} className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {flag}
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

const VideoVerifier = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/detect/video`, { method: 'POST', body: formData });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black tracking-tight brand-text-gradient">VIDEO DEEPFAKE DETECTION</h2>
        <p className="text-medium font-bold">Upload a video to detect facial manipulation and audio-visual desync.</p>
      </div>
      <div className="glass p-8 rounded-[40px] space-y-6">
        <div className="aspect-video rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-center p-8 hover:border-brand-primary/50 transition-colors cursor-pointer" onClick={() => document.getElementById('video-upload')?.click()}>
          <Upload className="w-12 h-12 text-white/20 mb-4" />
          <p className="text-high font-black text-lg">{file ? file.name : "Click to upload video"}</p>
          <input id="video-upload" type="file" className="hidden" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <button onClick={analyze} disabled={loading || !file} className="w-full brand-gradient py-4 rounded-2xl text-white font-black flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
          Run Deepfake Scan
        </button>
      </div>
      {result && <ResultDisplay result={result} type="image" />}
    </div>
  );
};

const AppRoot = () => {
  const [page, setPage] = useState<Page>('landing');
  const [showSplash, setShowSplash] = useState(true);

  return (
    <div className="min-h-screen">
      <AnimatePresence>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      </AnimatePresence>

      <Navbar currentPage={page} setPage={setPage} />

      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            {page === 'landing' && <LandingPage setPage={setPage} />}
            {page === 'text' && <TextVerifier />}
            {page === 'image' && <ImageVerifier />}
            {page === 'video' && <VideoVerifier />}
            {page === 'link' && <LinkVerifier />}
            {page === 'profile' && <ProfileVerifier />}
            {page === 'prompt' && <PromptLab />}
            {page === 'pricing' && <Pricing />}
            {page === 'history' && <History />}
          </motion.div>
        </AnimatePresence>
      </main>

      <Chatbot />

      <footer className="border-t border-white/5 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center">
              <Shield className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold brand-text-gradient">VERIFY</span>
          </div>

          <div className="flex items-center gap-8 text-sm text-high font-black">
            <a href="#" className="hover:text-brand-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-brand-primary transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-brand-primary transition-colors">API Documentation</a>
          </div>

          <p className="text-xs text-medium font-black">© 2026 Content Authenticity Verifier. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return <AppRoot />;
}
