import React, { useState, useEffect } from 'react';
import { 
  Send, Search, Bot, Sparkles, Clock, X, Mail, FileText, 
  CheckCircle, ExternalLink, ChevronRight, Download, 
  Database, ShoppingCart, AlertCircle 
} from 'lucide-react';
import './App.css';

// API base URLs mapped from Vite environment variables (falling back to localhost)
const ORCHESTRATOR_URL = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8000';
const EMAIL_URL = import.meta.env.VITE_EMAIL_URL || 'http://localhost:8003';
const PRESENTATION_URL = import.meta.env.VITE_PRESENTATION_URL || 'http://localhost:8001';

function App() {
  const [commandText, setCommandText] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [showLogs, setShowLogs] = useState(false);
  
  // Service response states
  const [steps, setSteps] = useState([]);
  const [results, setResults] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // Editable email draft state
  const [emailDraftId, setEmailDraftId] = useState('');
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState('');
  const [emailErrorMsg, setEmailErrorMsg] = useState('');

  // Prompt helpers
  const samplePrompts = [
    { text: "Find the cheapest price for Sony WH-1000XM5 and email the results to friend@example.com", label: "Scrape & Email" },
    { text: "Generate a 5 slide presentation about Quantum Computing", label: "Generate PPTX" },
    { text: "Draft an email to boss@company.com with updates on our project milestone", label: "Email Draft" }
  ];

  // Fetch SQLite logs on load and drawer open
  const fetchAuditLogs = async () => {
    try {
      const response = await fetch(`${ORCHESTRATOR_URL}/audit`);
      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const handleCommandSubmit = async (textToSend) => {
    const queryText = textToSend || commandText;
    if (!queryText.trim()) return;

    setIsPending(true);
    setResults(null);
    setEmailSuccessMsg('');
    setEmailErrorMsg('');
    
    // Clear draft states
    setEmailDraftId('');
    setEmailRecipient('');
    setEmailSubject('');
    setEmailBody('');

    // Start logs visually
    setSteps(["Parsing intent via Orchestrator..."]);
    
    try {
      const response = await fetch(`${ORCHESTRATOR_URL}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: queryText }),
      });

      if (!response.ok) {
        throw new Error(`Orchestrator returned error: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.result);
      setSteps(data.steps || ["Completed command execution."]);

      // Set active tabs based on available outputs
      if (data.result.price_compare) {
        setActiveTab('prices');
      } else if (data.result.presentation) {
        setActiveTab('slides');
      } else if (data.result.email_draft) {
        setActiveTab('email');
      } else {
        setActiveTab('general');
      }

      // Initialize email draft editor if returned
      if (data.result.email_draft) {
        const draft = data.result.email_draft;
        setEmailDraftId(draft.draft_id || '');
        setEmailRecipient(draft.recipient || '');
        setEmailSubject(draft.subject || '');
        setEmailBody(draft.body || '');
      }

      // Reload history
      fetchAuditLogs();
    } catch (err) {
      setSteps((prev) => [...prev, `Error: ${err.message}`]);
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailRecipient) {
      setEmailErrorMsg('Recipient email is required.');
      return;
    }
    
    setEmailSending(true);
    setEmailSuccessMsg('');
    setEmailErrorMsg('');

    try {
      const response = await fetch(`${EMAIL_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: emailDraftId,
          recipient: emailRecipient,
          subject: emailSubject,
          body: emailBody
        })
      });

      const data = await response.json();
      if (response.ok) {
        setEmailSuccessMsg(data.message || 'Email successfully sent!');
      } else {
        setEmailErrorMsg(data.detail || 'Failed to send email.');
      }
    } catch (err) {
      setEmailErrorMsg(`Failed to send email: ${err.message}`);
    } finally {
      setEmailSending(false);
    }
  };

  // Helper to get max price for comparison chart
  const getMaxPrice = (items) => {
    if (!items || items.length === 0) return 1;
    return Math.max(...items.map(item => {
      try {
        return parseInt(item.price.replace(/[^\d]/g, '')) || 1;
      } catch {
        return 1;
      }
    }));
  };

  const maxPriceVal = results?.price_compare?.results ? getMaxPrice(results.price_compare.results) : 1;

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header className="dashboard-header glass-panel animate-slide-in">
        <div className="logo-section">
          <div className="logo-icon">
            <Bot size={22} />
          </div>
          <h1>JARVIS Assistant Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="status-badge">
            <div className="status-dot"></div>
            <span>Agent System Active</span>
          </div>
          <button 
            className="history-btn" 
            onClick={() => {
              setShowLogs(true);
              fetchAuditLogs();
            }}
          >
            <Clock size={16} />
            <span>View Logs</span>
          </button>
        </div>
      </header>

      {/* DASHBOARD CONTENT GRID */}
      <main className="dashboard-grid">
        
        {/* LEFT COLUMN: Input & Step Tracker */}
        <section className="left-column">
          {/* COMMAND CARD */}
          <div className="command-card glass-panel animate-slide-in" style={{ animationDelay: '0.1s' }}>
            <h2>Ask JARVIS Anything</h2>
            <div className="input-container">
              <textarea 
                className="command-input"
                placeholder="Type a multi-action request (e.g., search prices, build slides, draft emails)..."
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCommandSubmit();
                  }
                }}
              />
              <button 
                className="submit-btn"
                onClick={() => handleCommandSubmit()}
                disabled={isPending || !commandText.trim()}
              >
                {isPending ? <div className="status-dot status-active"></div> : <Send size={16} />}
                <span>{isPending ? 'Working...' : 'Run'}</span>
              </button>
            </div>

            <div className="helpers-list">
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Suggestions</span>
              {samplePrompts.map((p, idx) => (
                <button 
                  key={idx} 
                  className="helper-item"
                  onClick={() => {
                    setCommandText(p.text);
                    handleCommandSubmit(p.text);
                  }}
                >
                  <strong style={{ color: 'var(--primary)', marginRight: '6px' }}>[{p.label}]</strong>
                  {p.text}
                </button>
              ))}
            </div>
          </div>

          {/* STEP TRACKER LOG CARD */}
          <div className="steps-card glass-panel animate-slide-in" style={{ animationDelay: '0.2s' }}>
            <h3>
              <Database size={18} style={{ color: 'var(--primary)' }} />
              <span>Orchestrator Routing History</span>
            </h3>
            {steps.length === 0 ? (
              <div className="tab-placeholder" style={{ height: '150px' }}>
                <Clock size={36} className="placeholder-icon" />
                <p style={{ fontSize: '13px' }}>Awaiting your command to start execution.</p>
              </div>
            ) : (
              <div className="steps-list">
                {steps.map((step, idx) => {
                  const isLast = idx === steps.length - 1;
                  const isErr = step.toLowerCase().includes('error');
                  return (
                    <div key={idx} className="step-item animate-slide-in">
                      <div className={`step-node ${isLast && isPending ? 'active' : 'completed'}`} style={{ backgroundColor: isErr ? 'var(--danger)' : undefined, borderColor: isErr ? 'var(--danger)' : undefined }}>
                        {isErr ? <X size={12} /> : <CheckCircle size={12} />}
                      </div>
                      <div className={`step-text ${isLast && isPending ? 'active' : 'completed'}`}>
                        {step}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: Results tabs panels */}
        <section className="right-column glass-panel animate-slide-in" style={{ animationDelay: '0.15s' }}>
          {/* Tabs header */}
          <div className="tabs-header">
            <button 
              className={`tab-btn ${activeTab === 'prices' ? 'active' : ''}`}
              onClick={() => setActiveTab('prices')}
            >
              <ShoppingCart size={16} />
              <span>Prices Compare</span>
              {results?.price_compare?.results && (
                <span className="badge">{results.price_compare.results.length}</span>
              )}
            </button>
            <button 
              className={`tab-btn ${activeTab === 'slides' ? 'active' : ''}`}
              onClick={() => setActiveTab('slides')}
            >
              <FileText size={16} />
              <span>PPTX Slides</span>
              {results?.presentation && <span className="badge">Active</span>}
            </button>
            <button 
              className={`tab-btn ${activeTab === 'email' ? 'active' : ''}`}
              onClick={() => setActiveTab('email')}
            >
              <Mail size={16} />
              <span>Email Draft</span>
              {results?.email_draft && <span className="badge">Edit</span>}
            </button>
            <button 
              className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <Bot size={16} />
              <span>General Response</span>
            </button>
          </div>

          {/* TAB CONTENTS */}
          <div className="tab-content">
            
            {/* NO RESULTS / EMPTY PLACEHOLDER */}
            {!results && (
              <div className="tab-placeholder">
                <Sparkles size={48} className="placeholder-icon" style={{ animation: 'float 3s ease-in-out infinite' }} />
                <h3>No Output Generated Yet</h3>
                <p style={{ maxWidth: '360px' }}>Enter a query on the left. The output of the scraped products, PowerPoint downloads, or draft emails will render here in real-time.</p>
              </div>
            )}

            {/* PRICES TAB */}
            {results && activeTab === 'prices' && (
              <div>
                {!results.price_compare ? (
                  <div className="tab-placeholder" style={{ height: '260px' }}>
                    <AlertCircle size={36} className="placeholder-icon" />
                    <p>No price comparison data generated for this query.</p>
                  </div>
                ) : (
                  <div>
                    {/* Visual Comparison Graph */}
                    <div className="comparison-card glass-panel">
                      <h4>Price Range Visual Comparison (Lower is better)</h4>
                      <div className="chart-bar-container">
                        {results.price_compare.results.map((item, idx) => {
                          const itemPrice = parseInt(item.price.replace(/[^\d]/g, '')) || 0;
                          const widthPct = maxPriceVal ? (itemPrice / maxPriceVal) * 100 : 0;
                          return (
                            <div key={idx} className="chart-row">
                              <span className="chart-label">{item.source} - {item.title}</span>
                              <div className="chart-track">
                                <div className="chart-fill" style={{ width: `${widthPct}%`, background: idx === 0 ? 'linear-gradient(90deg, #10b981, #34d399)' : undefined }}></div>
                              </div>
                              <span className="chart-value" style={{ color: idx === 0 ? 'var(--accent)' : undefined }}>{item.price}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Products Grid */}
                    <div className="price-grid">
                      {results.price_compare.results.map((item, idx) => (
                        <div key={idx} className="product-card glass-panel">
                          <div className="product-image-container">
                            <img src={item.image} alt={item.title} className="product-img" />
                          </div>
                          <div className="product-details">
                            <div className="product-meta">
                              <span className="product-source">{item.source}</span>
                              <span className="product-rating">★ {item.rating}</span>
                            </div>
                            <h3 className="product-title" title={item.title}>{item.title}</h3>
                            <span className="product-price">{item.price}</span>
                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="product-btn">
                              <span>Buy Now</span>
                              <ExternalLink size={12} style={{ marginLeft: '4px', display: 'inline' }} />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PPTX SLIDES TAB */}
            {results && activeTab === 'slides' && (
              <div>
                {!results.presentation ? (
                  <div className="tab-placeholder" style={{ height: '260px' }}>
                    <AlertCircle size={36} className="placeholder-icon" />
                    <p>No slide presentations generated for this query.</p>
                  </div>
                ) : (
                  <div className="slides-overview">
                    <div className="slides-hero glass-panel">
                      <div className="slides-hero-info">
                        <h3>{results.presentation.topic} Slides</h3>
                        <p>File generated successfully: {results.presentation.filename}</p>
                      </div>
                      <a 
                        href={`${PRESENTATION_URL}${results.presentation.download_url}`}
                        download 
                        className="download-pptx-btn"
                      >
                        <Download size={18} />
                        <span>Download .PPTX</span>
                      </a>
                    </div>

                    <div className="slides-list">
                      <h4 style={{ margin: '0', fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Generated Slide Contents</h4>
                      {/* Outline listing */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="slide-preview-card glass-panel" style={{ borderLeftColor: 'var(--primary)' }}>
                          <h4>[Slide 1: Title Slide]</h4>
                          <ul className="slide-preview-bullets">
                            <li>Title: {results.presentation.topic}</li>
                            <li>Accent Styling Theme applied.</li>
                          </ul>
                        </div>
                        <div className="slide-preview-card glass-panel">
                          <h4>[Slide 2: Background Context]</h4>
                          <ul className="slide-preview-bullets">
                            <li>Overview and key industry factors.</li>
                            <li>Unsplash background image matched.</li>
                          </ul>
                        </div>
                        <div className="slide-preview-card glass-panel">
                          <h4>[Slide 3: Detailed Breakdown]</h4>
                          <ul className="slide-preview-bullets">
                            <li>Detailed specifications and metrics.</li>
                            <li>Structured grid positioning applied.</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EMAIL DRAFT TAB */}
            {results && activeTab === 'email' && (
              <div>
                {!results.email_draft ? (
                  <div className="tab-placeholder" style={{ height: '260px' }}>
                    <AlertCircle size={36} className="placeholder-icon" />
                    <p>No email draft generated for this query.</p>
                  </div>
                ) : (
                  <div className="email-container">
                    
                    {emailSuccessMsg && (
                      <div className="alert-success animate-slide-in">
                        <CheckCircle size={18} />
                        <span>{emailSuccessMsg}</span>
                      </div>
                    )}
                    {emailErrorMsg && (
                      <div className="alert-success animate-slide-in" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)' }}>
                        <AlertCircle size={18} />
                        <span>{emailErrorMsg}</span>
                      </div>
                    )}

                    <div className="form-group">
                      <label htmlFor="recipient">To:</label>
                      <input 
                        id="recipient"
                        type="email" 
                        className="form-input" 
                        value={emailRecipient} 
                        onChange={(e) => setEmailRecipient(e.target.value)} 
                        placeholder="boss@company.com"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="subject">Subject:</label>
                      <input 
                        id="subject"
                        type="text" 
                        className="form-input" 
                        value={emailSubject} 
                        onChange={(e) => setEmailSubject(e.target.value)} 
                        placeholder="JARVIS Report Update"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="body">Email Body (Supports HTML):</label>
                      <textarea 
                        id="body"
                        className="form-input form-textarea" 
                        value={emailBody} 
                        onChange={(e) => setEmailBody(e.target.value)} 
                        placeholder="Draft body..."
                      />
                    </div>
                    <div className="email-actions">
                      <button 
                        className="send-email-btn"
                        onClick={handleSendEmail}
                        disabled={emailSending || !emailRecipient}
                      >
                        <Mail size={16} />
                        <span>{emailSending ? 'Sending...' : 'Send Email Now'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI GENERAL RESPONSE TAB */}
            {results && activeTab === 'general' && (
              <div style={{ lineHeight: 1.6, fontSize: '15px' }}>
                <div className="glass-panel" style={{ padding: '24px', whiteSpace: 'pre-wrap' }}>
                  {results.chat_response || "No conversational response returned. Try asking a general question like 'What is Quantum Computing?'"}
                </div>
              </div>
            )}

          </div>
        </section>

      </main>

      {/* SQLITE AUDIT DRAWER */}
      <section className={`logs-drawer ${showLogs ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3>
            <Database size={18} style={{ color: 'var(--primary)' }} />
            <span>Audit History (SQLite)</span>
          </h3>
          <button className="close-btn" onClick={() => setShowLogs(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="drawer-content">
          {auditLogs.length === 0 ? (
            <div className="tab-placeholder" style={{ height: '100%' }}>
              <Clock size={32} />
              <p>No logged audits found.</p>
            </div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="audit-item glass-panel">
                <div className="audit-meta">
                  <span>ID: #{log.id}</span>
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p className="audit-command">"{log.command}"</p>
                <span className={`audit-badge ${log.intent}`}>{log.intent}</span>
              </div>
            ))
          )}
        </div>
      </section>

    </div>
  );
}

export default App;
