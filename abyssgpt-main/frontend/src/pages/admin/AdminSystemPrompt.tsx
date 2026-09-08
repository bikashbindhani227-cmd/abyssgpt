import React, { useState, useEffect } from 'react';
import { Terminal, Save, RotateCcw, Check, AlertCircle, Play } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { SectionCard, Skeleton, Spinner } from '../../components/ui.js';

export const AdminSystemPrompt: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test prompt section
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    apiRequest<{ systemPrompt: string }>('/api/admin/system-prompt')
      .then((data) => setPrompt(data.systemPrompt))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load prompt'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/admin/system-prompt', {
        method: 'PUT',
        body: JSON.stringify({ systemPrompt: prompt }),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save system prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset system prompt to default?')) return;
    setSaving(true);
    try {
      const data = await apiRequest<{ systemPrompt: string }>('/api/admin/system-prompt/reset', {
        method: 'POST',
      });
      setPrompt(data.systemPrompt);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrompt = async () => {
    if (!testInput.trim() || testing) return;
    setTesting(true);
    setTestOutput('');
    try {
      const res = await apiRequest<{ reply: string }>('/api/admin/system-prompt/test', {
        method: 'POST',
        body: JSON.stringify({
          systemPrompt: prompt,
          userMessage: testInput.trim(),
        }),
      });
      setTestOutput(res.reply);
    } catch (err: unknown) {
      setTestOutput(err instanceof Error ? `Error: ${err.message}` : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">System Prompt Editor</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            The AI persona, instruction guidelines, and reasoning constraints
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleReset} disabled={saving || loading} className="btn btn-soft btn-sm">
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to default</span>
          </button>

          <button onClick={handleSave} disabled={saving || loading} className="btn btn-primary btn-sm">
            {success ? <Check className="h-3.5 w-3.5" /> : saving ? <Spinner size={13} /> : <Save className="h-3.5 w-3.5" />}
            <span>{success ? 'Saved' : saving ? 'Saving…' : 'Save prompt'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card card-pad space-y-4">
          <Skeleton className="skeleton-text" style={{ width: '32%' }} />
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="skeleton-text" style={{ width: `${94 - i * 6}%` }} />
          ))}
        </div>
      ) : (
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Terminal size={15} style={{ color: 'var(--accent)' }} />
              <span>Active prompt instructions</span>
            </span>
          }
          action={<span className="tabular text-xs text-ink-3">{prompt.length.toLocaleString()} chars</span>}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={14}
            aria-label="System prompt instructions"
            className="field font-mono text-xs leading-relaxed"
            style={{ minHeight: 300, resize: 'vertical' }}
            placeholder="Enter system prompt instructions here…"
          />
        </SectionCard>
      )}

      <SectionCard
        title="Test prompt execution"
        description="Send a query through the reasoning model using the editor content above, without saving."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTestPrompt()}
            placeholder="e.g. “Who are you and what are your rules?”"
            aria-label="Test query"
            className="field flex-1"
            style={{ height: 38, fontSize: 13 }}
          />
          <button
            onClick={handleTestPrompt}
            disabled={testing || !testInput.trim()}
            className="btn btn-soft"
            style={{ height: 38, fontSize: 13 }}
          >
            {testing ? <Spinner size={13} /> : <Play className="h-3.5 w-3.5" />}
            <span>{testing ? 'Testing…' : 'Test'}</span>
          </button>
        </div>

        {testOutput && (
          <div
            className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line p-3.5 font-mono text-xs leading-relaxed text-ink-2"
            role="status"
          >
            {testOutput}
          </div>
        )}
      </SectionCard>
    </div>
  );
};
