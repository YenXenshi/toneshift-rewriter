import React, { useState, useRef, useEffect } from 'react';
import {
  Smile,
  Briefcase,
  Zap,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  ClipboardPaste,
  Trash2,
  Share2,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

type Tone = 'friendly' | 'professional' | 'short';

interface ToneOption {
  id: Tone;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
  borderClass: string;
  badgeClass: string;
}

const TONES: ToneOption[] = [
  {
    id: 'friendly',
    label: 'Friendly',
    sublabel: 'Warm & approachable',
    icon: Smile,
    activeClass: 'bg-amber-500 text-white shadow-md shadow-amber-500/25',
    borderClass: 'border-amber-500/30',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'professional',
    label: 'Professional',
    sublabel: 'Polite & workplace-ready',
    icon: Briefcase,
    activeClass: 'bg-blue-600 text-white shadow-md shadow-blue-600/25',
    borderClass: 'border-blue-500/30',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'short',
    label: 'Short',
    sublabel: 'Crisp & to the point',
    icon: Zap,
    activeClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25',
    borderClass: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
];

const PRESETS = [
  {
    label: 'Late for meeting',
    text: 'hey sorry running super late traffic is totally blocked start without me will jump in as soon as i can',
  },
  {
    label: 'Asking for deadline',
    text: 'need a couple more days on the deck got pulled into client fires can we push review to friday',
  },
  {
    label: 'Declining request',
    text: 'cant do this right now schedule is completely packed maybe next quarter or someone else can take it',
  },
];

export default function App() {
  const [inputMessage, setInputMessage] = useState('');
  const [selectedTone, setSelectedTone] = useState<Tone>('friendly');
  const [rewrittenMessage, setRewrittenMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);
  const [resultTone, setResultTone] = useState<Tone>('friendly');

  const resultRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      setShareSupported(true);
    }
  }, []);

  const handleRewrite = async (toneToUse: Tone = selectedTone) => {
    const trimmed = inputMessage.trim();
    if (!trimmed) {
      setError('Please paste or type a rough message first.');
      textareaRef.current?.focus();
      return;
    }

    setIsLoading(true);
    setError(null);
    setCopied(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000);

    try {
      const response = await fetch('/api/rewrite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmed,
          tone: toneToUse,
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (!response.ok) {
        let serverMessage = '';
        if (isJson) {
          try {
            const errorData = await response.json();
            serverMessage = errorData.error || errorData.message || '';
          } catch {
            serverMessage = '';
          }
        } else {
          serverMessage = 'The server returned an unexpected non-JSON response (such as a proxy error or server warmup page).';
        }

        const messageToShow = serverMessage
          ? `HTTP ${response.status}: ${serverMessage}`
          : `HTTP ${response.status}: The server was unable to process the request.`;

        throw new Error(messageToShow);
      }

      if (!isJson) {
        throw new Error(`HTTP ${response.status}: Expected JSON response from server, but received non-JSON content.`);
      }

      const data = await response.json();

      setRewrittenMessage(data.rewritten);
      setResultTone(data.tone || toneToUse);

      // Smooth scroll to result on mobile
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('The request timed out after 60 seconds. Please try again.');
      } else {
        setError(err.message || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!rewrittenMessage) return;
    try {
      await navigator.clipboard.writeText(rewrittenMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback if clipboard API fails
      const el = document.createElement('textarea');
      el.value = rewrittenMessage;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputMessage(text);
        setError(null);
      }
    } catch {
      // If permission is denied or unsupported, focus textarea
      textareaRef.current?.focus();
    }
  };

  const handleShare = async () => {
    if (!rewrittenMessage) return;
    try {
      await navigator.share({
        title: 'Rewritten Message',
        text: rewrittenMessage,
      });
    } catch (err) {
      // Ignore user aborts
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRewrite();
    }
  };

  const inputWordCount = inputMessage.trim() ? inputMessage.trim().split(/\s+/).length : 0;
  const resultWordCount = rewrittenMessage.trim() ? rewrittenMessage.trim().split(/\s+/).length : 0;
  const currentToneObj = TONES.find((t) => t.id === selectedTone) || TONES[0];
  const resultToneObj = TONES.find((t) => t.id === resultTone) || TONES[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white sticky top-0 z-20 shadow-xs">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
                ToneShift
              </h1>
              <p className="text-xs text-slate-500 font-medium">AI Message Rewriter</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200/60 text-xs text-slate-600 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">100% Private •</span> Zero Storage
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 sm:py-7 flex flex-col gap-5">
        {/* Step 1: Input Box */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between mb-2.5">
            <label
              htmlFor="rough-message"
              className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                1
              </span>
              Rough Message
            </label>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePaste}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
                title="Paste from clipboard"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Paste</span>
              </button>

              {inputMessage && (
                <button
                  type="button"
                  onClick={() => {
                    setInputMessage('');
                    setError(null);
                    textareaRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-rose-600 px-1.5 py-1 rounded-md hover:bg-rose-50 transition-colors"
                  title="Clear text"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="sr-only sm:not-sr-only">Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <textarea
              id="rough-message"
              ref={textareaRef}
              rows={4}
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Paste your rough message or quick draft here... (e.g. 'can u look at the draft asap thx')"
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/15 transition-all"
            />
          </div>

          {/* Quick Preset Samples */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 mr-0.5">Try:</span>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setInputMessage(preset.text);
                  setError(null);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900 transition-colors border border-slate-200/60"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
            <span>{inputWordCount} {inputWordCount === 1 ? 'word' : 'words'}</span>
            <span className="hidden sm:inline">Press ⌘ + Enter to rewrite</span>
          </div>
        </section>

        {/* Step 2: Tone Selection */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
              2
            </span>
            Choose Tone
          </label>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {TONES.map((tone) => {
              const Icon = tone.icon;
              const isSelected = selectedTone === tone.id;

              return (
                <button
                  key={tone.id}
                  type="button"
                  onClick={() => setSelectedTone(tone.id)}
                  className={`flex flex-col items-center sm:items-start text-center sm:text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? `${tone.activeClass} border-transparent scale-[1.02]`
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                    <Icon
                      className={`w-4 h-4 ${
                        isSelected ? 'text-white' : 'text-slate-600'
                      }`}
                    />
                    <span className="text-xs sm:text-sm font-semibold">{tone.label}</span>
                  </div>
                  <span
                    className={`text-[10px] sm:text-xs leading-snug line-clamp-1 ${
                      isSelected ? 'text-white/85' : 'text-slate-500'
                    }`}
                  >
                    {tone.sublabel}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Rewrite Button */}
          <div className="mt-4">
            <button
              type="button"
              disabled={isLoading || !inputMessage.trim()}
              onClick={() => handleRewrite(selectedTone)}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm sm:text-base text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-600/20 hover:shadow-lg hover:shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Rewriting in {currentToneObj.label} tone...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Rewrite as {currentToneObj.label}</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Error Notification */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 flex items-start gap-3 text-rose-800"
          >
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-rose-900">Unable to rewrite message</p>
              <p className="mt-0.5 text-rose-700">{error}</p>
              <button
                type="button"
                onClick={() => handleRewrite(selectedTone)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-900 hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Rewritten Message Box */}
        {(rewrittenMessage || isLoading) && (
          <section
            ref={resultRef}
            className="bg-white rounded-2xl border border-indigo-200/90 shadow-sm p-4 sm:p-5 relative transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                    3
                  </span>
                  Rewritten Message
                </label>
                {!isLoading && (
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${resultToneObj.badgeClass}`}
                  >
                    {resultToneObj.label}
                  </span>
                )}
              </div>

              {rewrittenMessage && !isLoading && (
                <div className="flex items-center gap-1.5">
                  {shareSupported && (
                    <button
                      type="button"
                      onClick={handleShare}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                      title="Share message"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Share</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                      copied
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Output Display or Loading Placeholder */}
            {isLoading ? (
              <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col items-center justify-center gap-3 text-slate-500">
                <div className="w-7 h-7 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                <p className="text-xs font-medium text-slate-600 animate-pulse">
                  Refining with Gemini in {currentToneObj.label.toLowerCase()} tone...
                </p>
              </div>
            ) : (
              <div>
                <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 text-sm sm:text-base text-slate-800 leading-relaxed font-normal whitespace-pre-wrap select-all">
                  {rewrittenMessage}
                </div>

                {/* Tone Switcher directly below output */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400 font-medium mr-1">
                      Try another tone:
                    </span>
                    {TONES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTone(t.id);
                          handleRewrite(t.id);
                        }}
                        className={`text-xs px-2 py-0.5 rounded-md border font-medium transition-colors ${
                          resultTone === t.id
                            ? 'bg-slate-200/80 text-slate-800 border-slate-300'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="text-xs text-slate-400 font-medium">
                    {resultWordCount} words
                    {inputWordCount > 0 && resultWordCount > 0 && (
                      <span className="ml-1 text-slate-500">
                        ({Math.round(((resultWordCount - inputWordCount) / inputWordCount) * 100) > 0 ? '+' : ''}
                        {Math.round(((resultWordCount - inputWordCount) / inputWordCount) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-4">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              <strong>Zero-storage guarantee:</strong> Messages are processed ephemerally and never saved, logged, or stored.
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}
