import React, { useState } from 'react';
import {
  Send,
  Bot,
  AlertCircle,
  Sparkles,
  Terminal,
  Clock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Check,
  Brain,
} from 'lucide-react';
import { apiService, ApiError } from '../services/api';
import { ChatResponse, FeedbackRating, SystemStatusState } from '../types';

interface PlaygroundPageProps {
  systemStatus: SystemStatusState;
}

export const PlaygroundPage: React.FC<PlaygroundPageProps> = ({ systemStatus }) => {
  const [prompt, setPrompt] = useState<string>('');
  const [systemInstruction, setSystemInstruction] = useState<string>('');
  const [showSystemInstruction, setShowSystemInstruction] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ChatResponse | null>(null);

  // Phase 3 Feedback Collection state
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null);
  const [feedbackComment, setFeedbackComment] = useState<string>('');
  const [feedbackCorrection, setFeedbackCorrection] = useState<string>('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const { agent, health, isLoading: isStatusLoading, checkStatus } = systemStatus;
  const isBackendHealthy = health?.status === 'healthy';
  const isAgentConfigured = isBackendHealthy && (agent?.configured ?? false);
  const activeModel = agent?.model || (isBackendHealthy ? 'Gemini Provider' : 'Unavailable');

  const handleFeedbackSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!feedbackRating || isSubmittingFeedback || feedbackSubmitted) return;

    if (feedbackRating === 'correction' && !feedbackCorrection.trim()) {
      setFeedbackError('Please provide a correction before submitting.');
      return;
    }

    setIsSubmittingFeedback(true);
    setFeedbackError(null);

    try {
      await apiService.submitFeedback({
        task_id: response?.task_id || undefined,
        rating: feedbackRating,
        comment: feedbackComment.trim() || undefined,
        correction: feedbackRating === 'correction' ? feedbackCorrection.trim() : undefined,
      });
      setFeedbackSubmitted(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFeedbackError(err.message);
      } else if (err instanceof Error) {
        setFeedbackError(err.message);
      } else {
        setFeedbackError('Failed to record feedback. Please retry.');
      }
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isLoading) {
      return;
    }

    if (!isBackendHealthy) {
      setError(`Cannot reach backend service at ${apiService.getBaseUrl()}. Please ensure the backend is running.`);
      return;
    }

    if (!isAgentConfigured) {
      setError('AI provider is not configured on the backend. Please check backend/.env configuration.');
      return;
    }

    setIsLoading(true);
    setError(null);
    // Reset feedback for new generation
    setFeedbackRating(null);
    setFeedbackComment('');
    setFeedbackCorrection('');
    setFeedbackSubmitted(false);
    setFeedbackError(null);

    try {
      const result = await apiService.executeChat({
        prompt: trimmedPrompt,
        system_instruction: showSystemInstruction && systemInstruction.trim() ? systemInstruction.trim() : undefined,
      });
      setResponse(result);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while communicating with the agent.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Dynamic Infrastructure / Configuration Status Banner */}
      {!isBackendHealthy ? (
        <div
          className="card"
          style={{
            borderLeft: '3px solid var(--status-rose)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <AlertCircle size={20} style={{ color: 'var(--status-rose)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                  Backend Disconnected
                </h4>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Cannot reach SafeLoop backend at <code>{apiService.getBaseUrl()}</code>.
                  Ensure the FastAPI backend is running locally.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => checkStatus()}
              disabled={isStatusLoading}
              style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
              title="Retry connection to backend"
            >
              <RefreshCw size={13} className={isStatusLoading ? 'animate-spin' : ''} />
              <span>{isStatusLoading ? 'Checking...' : 'Retry Connection'}</span>
            </button>
          </div>
        </div>
      ) : !isAgentConfigured ? (
        <div
          className="card"
          style={{
            borderLeft: '3px solid var(--status-amber)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <AlertCircle size={20} style={{ color: 'var(--status-amber)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                AI Provider Not Configured
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                The backend service is healthy, but the AI provider is not ready. Configure provider credentials in <code>backend/.env</code> on the server to enable live task execution.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            borderLeft: '3px solid var(--status-emerald)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <CheckCircle2 size={20} style={{ color: 'var(--status-emerald)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                Gemini Integration Active
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Connected to official <code>google-genai</code> SDK using model <code>{activeModel}</code>.
                Inference latency, task identifiers, and telemetry are tracked on each call.
              </p>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
        {/* Prompt Input Form */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Terminal size={18} style={{ color: 'var(--accent-cyan)' }} />
              Agent Prompt Input
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Model: {activeModel}
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="prompt-input" className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Task Instruction or Query</span>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-cyan)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                  onClick={() => setShowSystemInstruction(!showSystemInstruction)}
                >
                  {showSystemInstruction ? 'Hide System Instruction' : '+ Add System Instruction'}
                </button>
              </label>

              {showSystemInstruction && (
                <textarea
                  id="system-instruction-input"
                  className="form-textarea"
                  style={{ minHeight: '60px', marginBottom: '0.5rem', borderColor: 'var(--border-subtle)' }}
                  placeholder="Optional system context (e.g., 'You are SafeLoop AI, an autonomous system engineer with strict safety boundaries.')..."
                  value={systemInstruction}
                  onChange={(e) => setSystemInstruction(e.target.value)}
                  disabled={isLoading}
                  rows={2}
                />
              )}

              <textarea
                id="prompt-input"
                className="form-textarea"
                placeholder="Enter prompt instructions for the agent (e.g., 'Explain the role of regression testing in agentic continuous improvement'). Press Ctrl+Enter to send."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={4}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {!isBackendHealthy
                  ? 'Backend disconnected - click Retry Connection above'
                  : !isAgentConfigured
                  ? 'AI provider not configured in backend/.env'
                  : 'Press Ctrl+Enter to send'}
              </span>

              <button
                id="btn-send-prompt"
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || !prompt.trim() || !isAgentConfigured || !isBackendHealthy}
                title={
                  !isBackendHealthy
                    ? 'Backend service is offline - click Retry above'
                    : !isAgentConfigured
                    ? 'AI provider is not configured in backend/.env'
                    : !prompt.trim()
                    ? 'Enter a prompt first'
                    : `Execute prompt with ${activeModel}`
                }
              >
                {isLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>Send Task</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Response Area */}
        <div className="card" style={{ minHeight: '280px', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <span className="card-title">
              <Bot size={18} style={{ color: 'var(--accent-cyan)' }} />
              Agent Output Telemetry
            </span>
            {response && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className="brand-badge" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Clock size={11} />
                  <span>{response.latency_ms} ms</span>
                </span>
                <span className="brand-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-emerald)' }}>
                  {response.model}
                </span>
                {response.memory_retrieval_applied && (
                  <span
                    className="brand-badge"
                    style={{ background: 'rgba(6, 182, 212, 0.12)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    title={`Adaptive Memory Applied: ${response.retrieved_memory_ids?.join(', ')}`}
                  >
                    <Brain size={11} />
                    <span>Memory Injected ({response.retrieved_memory_ids?.length || 0})</span>
                  </span>
                )}
                {response.task_id && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {response.task_id}
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {isLoading ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '2rem' }}>
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    Executing task with {activeModel}...
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Streaming model inference via backend gateway
                  </p>
                </div>
              </div>
            ) : error ? (
              <div
                style={{
                  margin: '1rem',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--status-rose-bg)',
                  border: '1px solid rgba(244, 63, 94, 0.25)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                }}
              >
                <AlertCircle size={20} style={{ color: 'var(--status-rose)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '0.875rem', color: 'var(--status-rose)', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Agent Execution Error
                  </h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                    {error}
                  </p>
                  <button
                    type="button"
                    style={{
                      marginTop: '0.5rem',
                      background: 'none',
                      border: 'none',
                      color: 'var(--status-rose)',
                      fontSize: '0.75rem',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                    onClick={() => setError(null)}
                  >
                    Dismiss error
                  </button>
                </div>
              </div>
            ) : response ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', height: '100%' }}>
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.875rem',
                    lineHeight: '1.6',
                    color: 'var(--text-primary)',
                    maxHeight: '400px',
                    overflowY: 'auto',
                  }}
                >
                  {response.text}
                </div>

                {/* Feedback Controls (Phase 3) */}
                <div
                  style={{
                    padding: '0.875rem 1rem',
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  {feedbackSubmitted ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'var(--status-emerald-bg)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Check size={16} style={{ color: 'var(--status-emerald)' }} />
                        <span style={{ fontSize: '0.8125rem', color: 'var(--status-emerald)', fontWeight: 500 }}>
                          Feedback saved — Thank you for evaluating this model output!
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        Task: {response.task_id || 'untracked'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          Was this AI response helpful?
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            id="btn-feedback-helpful"
                            type="button"
                            className={`btn ${feedbackRating === 'helpful' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => {
                              setFeedbackRating('helpful');
                              setFeedbackError(null);
                            }}
                            disabled={isSubmittingFeedback}
                            style={{
                              padding: '0.35rem 0.65rem',
                              fontSize: '0.75rem',
                              borderColor: feedbackRating === 'helpful' ? 'var(--status-emerald)' : undefined,
                              backgroundColor: feedbackRating === 'helpful' ? 'rgba(16, 185, 129, 0.2)' : undefined,
                              color: feedbackRating === 'helpful' ? 'var(--status-emerald)' : undefined,
                            }}
                          >
                            <ThumbsUp size={13} />
                            <span>Helpful</span>
                          </button>

                          <button
                            id="btn-feedback-not-helpful"
                            type="button"
                            className={`btn ${feedbackRating === 'not_helpful' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => {
                              setFeedbackRating('not_helpful');
                              setFeedbackError(null);
                            }}
                            disabled={isSubmittingFeedback}
                            style={{
                              padding: '0.35rem 0.65rem',
                              fontSize: '0.75rem',
                              borderColor: feedbackRating === 'not_helpful' ? 'var(--status-rose)' : undefined,
                              backgroundColor: feedbackRating === 'not_helpful' ? 'rgba(244, 63, 94, 0.2)' : undefined,
                              color: feedbackRating === 'not_helpful' ? 'var(--status-rose)' : undefined,
                            }}
                          >
                            <ThumbsDown size={13} />
                            <span>Not Helpful</span>
                          </button>

                          <button
                            id="btn-feedback-correction"
                            type="button"
                            className={`btn ${feedbackRating === 'correction' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => {
                              setFeedbackRating('correction');
                              setFeedbackError(null);
                            }}
                            disabled={isSubmittingFeedback}
                            style={{
                              padding: '0.35rem 0.65rem',
                              fontSize: '0.75rem',
                              borderColor: feedbackRating === 'correction' ? 'var(--accent-cyan)' : undefined,
                              backgroundColor: feedbackRating === 'correction' ? 'rgba(56, 189, 248, 0.2)' : undefined,
                              color: feedbackRating === 'correction' ? 'var(--accent-cyan)' : undefined,
                            }}
                          >
                            <Edit3 size={13} />
                            <span>Suggest Correction</span>
                          </button>
                        </div>
                      </div>

                      {feedbackRating && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            paddingTop: '0.5rem',
                            borderTop: '1px solid var(--border-subtle)',
                          }}
                        >
                          {feedbackRating === 'correction' && (
                            <div>
                              <label
                                htmlFor="feedback-correction-input"
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--text-secondary)',
                                  display: 'block',
                                  marginBottom: '0.25rem',
                                }}
                              >
                                Corrected Output <span style={{ color: 'var(--status-rose)' }}>* (Required)</span>:
                              </label>
                              <textarea
                                id="feedback-correction-input"
                                className="form-textarea"
                                rows={3}
                                style={{ fontSize: '0.8125rem' }}
                                placeholder="Enter the accurate or improved response that the model should have provided..."
                                value={feedbackCorrection}
                                onChange={(e) => setFeedbackCorrection(e.target.value)}
                                disabled={isSubmittingFeedback}
                              />
                            </div>
                          )}

                          <div>
                            <label
                              htmlFor="feedback-comment-input"
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                display: 'block',
                                marginBottom: '0.25rem',
                              }}
                            >
                              Optional Comment:
                            </label>
                            <input
                              id="feedback-comment-input"
                              className="form-input"
                              type="text"
                              style={{ fontSize: '0.8125rem', padding: '0.4rem 0.6rem' }}
                              placeholder="Explain what was good, what failed, or reasoning behind this critique..."
                              value={feedbackComment}
                              onChange={(e) => setFeedbackComment(e.target.value)}
                              disabled={isSubmittingFeedback}
                            />
                          </div>

                          {feedbackError && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: 'var(--status-rose)',
                                fontSize: '0.75rem',
                                padding: '0.25rem 0',
                              }}
                            >
                              <span>{feedbackError}</span>
                              <button
                                type="button"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--accent-cyan)',
                                  textDecoration: 'underline',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                }}
                                onClick={() => handleFeedbackSubmit()}
                              >
                                Retry submission
                              </button>
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => {
                                setFeedbackRating(null);
                                setFeedbackComment('');
                                setFeedbackCorrection('');
                                setFeedbackError(null);
                              }}
                              disabled={isSubmittingFeedback}
                              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                            >
                              Cancel
                            </button>
                            <button
                              id="btn-submit-feedback"
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleFeedbackSubmit()}
                              disabled={
                                isSubmittingFeedback ||
                                (feedbackRating === 'correction' && !feedbackCorrection.trim())
                              }
                              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                            >
                              {isSubmittingFeedback ? (
                                <>
                                  <Loader2 size={13} className="animate-spin" />
                                  <span>Submitting...</span>
                                </>
                              ) : (
                                <span>Submit Feedback</span>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state-card" style={{ border: 'none', background: 'transparent', flex: 1 }}>
                <div className="empty-state-icon">
                  <Sparkles size={22} />
                </div>
                <h4 className="empty-state-title">Ready for Task Execution</h4>
                <p className="empty-state-text">
                  Enter an instruction or query above to trigger live agent reasoning using Google Gemini.
                  The backend returns generated output, token latency, and task tracking IDs.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

