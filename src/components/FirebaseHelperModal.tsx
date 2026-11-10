import React from 'react';
import { X, ExternalLink, CheckCircle, ShieldCheck, Globe, Smartphone } from 'lucide-react';

interface FirebaseHelperModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
}

export const FirebaseHelperModal: React.FC<FirebaseHelperModalProps> = ({
  isOpen,
  onClose,
  projectId = 'carbide-channel-c7cdj',
}) => {
  if (!isOpen) return null;

  const authConsoleUrl = `https://console.firebase.google.com/project/${projectId}/authentication/providers`;
  const hostingConsoleUrl = `https://console.firebase.google.com/project/${projectId}/hosting`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative space-y-5">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 text-[var(--color-text-dim)] hover:text-[var(--color-text-main)] rounded-full hover:bg-[var(--color-surface-subtle)] min-h-[36px] min-w-[36px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-black font-display uppercase tracking-wider text-[var(--color-text-main)] flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-[var(--color-primary)]" />
            <span>Firebase & Free Hosting Setup</span>
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Complete guide for Firebase Console configuration and publishing.
          </p>
        </div>

        {/* 1. Firebase Anonymous Auth */}
        <div className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center space-x-2">
            <Smartphone className="w-5 h-5 text-[var(--color-primary)]" />
            <h3 className="text-sm font-bold font-display uppercase text-[var(--color-text-main)]">
              1. Enable Anonymous Auth in Firebase Console
            </h3>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            Anonymous Authentication allows players to join from their phone without creating an account or typing passwords:
          </p>
          <ol className="list-decimal list-inside text-xs text-[var(--color-text-main)] space-y-1.5 pl-1 font-medium">
            <li>
              Open{' '}
              <a
                href={authConsoleUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-primary)] font-bold underline inline-flex items-center"
              >
                Firebase Authentication Console <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </li>
            <li>Click on the <strong>"Sign-in method"</strong> tab.</li>
            <li>Click <strong>"Anonymous"</strong> under Native providers.</li>
            <li>Toggle <strong>"Enable"</strong> and click <strong>"Save"</strong>.</li>
          </ol>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
            ✓ The app includes an automatic local device session fallback so you can already test and play right away!
          </p>
        </div>

        {/* 2. Free Hosting Options */}
        <div className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center space-x-2">
            <Globe className="w-5 h-5 text-[var(--color-primary)]" />
            <h3 className="text-sm font-bold font-display uppercase text-[var(--color-text-main)]">
              2. Free Hosting Options (Play Worldwide)
            </h3>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            To publish this app so any friend with a phone link can join:
          </p>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
              <span className="font-bold text-[var(--color-primary)] block">Option A: Firebase Hosting (Recommended Free Option)</span>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Included 100% free with your Firebase project on the Spark plan with custom domain and automatic SSL.
              </p>
              <pre className="text-[10px] font-mono bg-black/10 dark:bg-black/30 p-1.5 rounded mt-1.5 overflow-x-auto text-[var(--color-text-main)]">
                npm run build{'\n'}npx firebase deploy --only hosting
              </pre>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
              <span className="font-bold text-[var(--color-primary)] block">Option B: Vercel or Netlify (Zero Config)</span>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Connect your repository or run <code className="font-mono font-bold">npx vercel</code>. Free fast global CDN with instant shareable HTTPS links.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full min-h-[44px] py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-bold text-sm uppercase tracking-wider hover:bg-[var(--color-primary-hover)] transition cursor-pointer"
        >
          Got it, Close
        </button>
      </div>
    </div>
  );
};
