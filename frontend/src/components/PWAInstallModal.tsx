import React, { useState } from 'react';
import { Download, Share, PlusSquare, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.js';

export const PWAInstallModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [installing, setInstalling] = useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    setInstalling(true);
    try {
      await install();
      onClose();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#121319] p-6 shadow-2xl text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3.5 mb-4">
          <img src="/apple-touch-icon.png" alt="AbyssGPT" className="w-12 h-12 rounded-xl shadow-md border border-white/10" />
          <div>
            <h3 className="text-base font-bold text-white leading-tight">Install AbyssGPT</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Full app experience on your phone</p>
          </div>
        </div>

        {isInstalled ? (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-2 mb-4">
            <Check size={16} />
            <span>AbyssGPT is already installed on this device.</span>
          </div>
        ) : isInstallable ? (
          <div>
            <p className="text-xs text-neutral-300 leading-relaxed mb-5">
              Add AbyssGPT to your home screen to use it as a standalone, fast native app without browser bars.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-neutral-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={installing}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition"
              >
                <Download size={14} />
                <span>{installing ? 'Installing…' : 'Install App'}</span>
              </button>
            </div>
          </div>
        ) : isIOS ? (
          <div>
            <p className="text-xs text-neutral-300 leading-relaxed mb-3.5">
              To install on your iPhone / iPad:
            </p>
            <ol className="text-xs text-neutral-300 space-y-2.5 mb-5 bg-white/5 p-3.5 rounded-xl border border-white/5">
              <li className="flex items-center gap-2">
                <Share size={14} className="text-indigo-400 shrink-0" />
                <span>1. Tap Safari’s <strong>Share</strong> button at bottom</span>
              </li>
              <li className="flex items-center gap-2">
                <PlusSquare size={14} className="text-indigo-400 shrink-0" />
                <span>2. Tap <strong>Add to Home Screen</strong></span>
              </li>
            </ol>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition"
            >
              Got it
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-neutral-300 leading-relaxed mb-4">
              To install on Android Chrome or Edge:
            </p>
            <div className="bg-white/5 p-3.5 rounded-xl border border-white/5 text-xs text-neutral-300 space-y-2 mb-5">
              <p>1. Tap browser menu (<strong>⋮</strong> three dots top-right).</p>
              <p>2. Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
