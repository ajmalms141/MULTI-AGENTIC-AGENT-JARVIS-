import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Search, Bot, Sparkles, Clock, X, Mail, FileText, 
  CheckCircle, ExternalLink, ChevronRight, Download, 
  Database, ShoppingCart, AlertCircle, Mic, MicOff, Volume2, VolumeX, Sparkles as SparklesIcon
} from 'lucide-react';
import './App.css';

// API base URLs mapped from Vite environment variables (falling back to localhost)
const ORCHESTRATOR_URL = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8000';
const EMAIL_URL = import.meta.env.VITE_EMAIL_URL || 'http://localhost:8003';
const PRESENTATION_URL = import.meta.env.VITE_PRESENTATION_URL || 'http://localhost:8001';

// --- Web Audio API Tech Tones ---
const playTechTone = (type = 'beep') => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'beep') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // high note
      gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'boot') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.35);
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } else if (type === 'voice') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, audioCtx.currentTime);
      osc.frequency.setValueAtTime(780, audioCtx.currentTime + 0.08);
      gainNode.gain.setValueAtTime(0.03, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.18);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }
  } catch (err) {
    console.warn("Audio Context blocked or not supported:", err);
  }
};

// --- Web Speech API synthesis ---
const speakWelcomeMessage = () => {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = "Welcome to Antigravity. Jarvis core system is now active.";
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      
      const voices = window.speechSynthesis.getVoices();
      // Search for British female voices first to act as Friday, fallback to David or any en-US female
      const cyberVoice = voices.find(v => v.name.includes('Google UK English Female') || v.name.includes('Hazel') || v.name.includes('Susan') || v.name.includes('Zira'))
                         || voices.find(v => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('female'))
                         || voices.find(v => v.lang.startsWith('en-US') && v.name.toLowerCase().includes('female') || v.name.includes('Zira'))
                         || voices.find(v => v.lang.startsWith('en-GB'))
                         || voices[0];
      if (cyberVoice) {
        utterance.voice = cyberVoice;
      }
      window.speechSynthesis.speak(utterance);
    }
  } catch (err) {
    console.error("Speech Synthesis failed:", err);
  }
};

// --- 3D Interactive HUD Canvas ---
function JarvisHudCanvas({ enabled }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    let mouseX = 0, mouseY = 0;
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) - width / 2;
      mouseY = (e.clientY - rect.top) - height / 2;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle field system
    const pCount = 50;
    const particles = [];
    for (let i = 0; i < pCount; i++) {
      particles.push({
        x: Math.random() * width - width / 2,
        y: Math.random() * height - height / 2,
        z: Math.random() * 380 + 20,
        size: Math.random() * 1.5 + 0.6,
        speed: Math.random() * 0.4 + 0.2
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Translate coordinates to center
      ctx.save();
      ctx.translate(width / 2, height / 2);

      // Compute interactive rotation/tilt
      const rotX = mouseX * 0.0003;
      const rotY = mouseY * 0.0003;

      // Draw vector lines & radar orbits
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;

      const orbits = [80, 140, 200, 280];
      orbits.forEach((radius, idx) => {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.35, rotX + idx * 0.15, 0, Math.PI * 2);
        ctx.stroke();

        // Add ticking pulse indicators
        if (idx % 2 === 0) {
          ctx.fillStyle = 'rgba(0, 240, 255, 0.3)';
          const tickAngle = Date.now() * 0.0004 * (idx + 1.2);
          const px = Math.cos(tickAngle) * radius;
          const py = Math.sin(tickAngle) * radius * 0.35;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Draw sweeping scanner line
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const sweepAngle = Date.now() * 0.0008;
      const sx = Math.cos(sweepAngle) * 280;
      const sy = Math.sin(sweepAngle) * 280 * 0.35;
      ctx.moveTo(0, 0);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      // Render 3D space particles
      particles.forEach((p) => {
        p.z -= p.speed;
        if (p.z <= 0) {
          p.z = 400;
          p.x = Math.random() * width - width / 2;
          p.y = Math.random() * height - height / 2;
        }

        const k = 180 / p.z;
        const px = (p.x + mouseX * 0.06) * k;
        const py = (p.y + mouseY * 0.06) * k;

        if (px > -width / 2 && px < width / 2 && py > -height / 2 && py < height / 2) {
          const depthAlpha = 1 - p.z / 400;
          ctx.fillStyle = `rgba(0, 240, 255, ${depthAlpha * 0.5})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size * k * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, [enabled]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} />;
}

function App() {
  // Config & Startup states
  const [bootSequence, setBootSequence] = useState(true);
  const [bootLogs, setBootLogs] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [sysTime, setSysTime] = useState(new Date().toLocaleTimeString());

  // Speech Recognition state
  const [isListening, setIsListening] = useState(false);

  // Original command inputs & logs states
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

  // Speech Synthesis mounting welcome cue
  useEffect(() => {
    speakWelcomeMessage();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        speakWelcomeMessage();
      };
    }
  }, []);

  // Update System Time clock readout
  useEffect(() => {
    const timer = setInterval(() => {
      setSysTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Startup Booting Sequence effect simulation
  useEffect(() => {
    if (!bootSequence) return;
    const logs = [
      "ACCESS MODULE: JARVIS_V3_SECURE",
      "SYS LOG: INITIALIZING NEURAL NETWORK...",
      "PORT CHECK: ORCHESTRATOR ONLINE (8000)",
      "PORT CHECK: SCRAPER PLAYWRIGHT ACTIVE (8002)",
      "PORT CHECK: SMTP RELAY CONFIGURED (8003)",
      "JARVIS CORE ENGINE: APPLIED",
      "CORE RE-ACTOR SYNC: SYNCHRONIZED",
      "AI CONSOLE STATE: JARVIS READY"
    ];
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < logs.length) {
        setBootLogs(prev => [...prev, logs[idx]]);
        if (soundEnabled) playTechTone('beep');
        idx++;
      } else {
        clearInterval(interval);
      }
    }, 300);

    return () => clearInterval(interval);
  }, [bootSequence]);

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

    if (soundEnabled) playTechTone('beep');
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
      if (soundEnabled) playTechTone('error');
    } finally {
      setIsPending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailRecipient) {
      setEmailErrorMsg('Recipient email is required.');
      return;
    }
    
    if (soundEnabled) playTechTone('beep');
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
        if (soundEnabled) playTechTone('error');
      }
    } catch (err) {
      setEmailErrorMsg(`Failed to send email: ${err.message}`);
      if (soundEnabled) playTechTone('error');
    } finally {
      setEmailSending(false);
    }
  };

  // Web Speech recognition for voice command routing
  const handleVoiceInputStart = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        if (soundEnabled) playTechTone('voice');
      };

      recognition.onerror = (e) => {
        console.error("Speech Recognition error:", e);
        setIsListening(false);
        if (soundEnabled) playTechTone('error');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = (event) => {
        const voiceText = event.results[0][0].transcript;
        setCommandText(voiceText);
        handleCommandSubmit(voiceText);
      };

      recognition.start();
    } catch (err) {
      console.error("Speech recognition startup error:", err);
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

  // Render booting sequence overlay on load
  if (bootSequence) {
    return (
      <div className="startup-sequence-overlay" style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        backgroundColor: '#030712', zIndex: 9999, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', padding: '20px'
      }}>
        {/* Animated concentric circle grid */}
        <div className="arc-logo-glow animate-pulse" style={{ marginBottom: '40px', position: 'relative' }}>
          <svg width="140" height="140" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0, 240, 255, 0.1)" strokeWidth="3" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray="30 15" style={{ transformOrigin: 'center', animation: 'spin 6s linear infinite' }} />
            <circle cx="50" cy="50" r="30" fill="none" stroke="var(--secondary)" strokeWidth="1.5" strokeDasharray="8 6" style={{ transformOrigin: 'center', animation: 'spin-reverse 4s linear infinite' }} />
            <circle cx="50" cy="50" r="16" fill="rgba(0, 240, 255, 0.2)" stroke="var(--primary)" strokeWidth="1" />
            <polygon points="50,42 58,54 42,54" fill="var(--primary)" style={{ transformOrigin: 'center', animation: 'pulse-glow 1.5s infinite' }} />
          </svg>
        </div>

        {/* Diagnostic logs */}
        <div className="terminal-boot-logs glass-panel" style={{
          width: '100%', maxWidth: '480px', height: '180px', overflowY: 'auto',
          backgroundColor: 'rgba(10, 15, 26, 0.8)', padding: '16px', fontSize: '13px',
          border: '1px solid rgba(0, 240, 255, 0.25)', borderRadius: '4px', marginBottom: '32px'
        }}>
          {bootLogs.map((log, idx) => (
            <div key={idx} className="tech-mono" style={{ color: 'var(--primary)', marginBottom: '6px' }}>
              &gt;&gt; {log}
            </div>
          ))}
          {bootLogs.length < 8 && <div className="tech-mono animate-pulse" style={{ color: 'var(--text-muted)' }}>&gt;&gt; JARVIS_SYNCING_SESSION_NODE...</div>}
        </div>

        {/* Enter buttons */}
        {bootLogs.length >= 8 && (
          <button 
            className="enter-jarvis-btn tech-mono animate-slide-in"
            onClick={() => {
              if (soundEnabled) playTechTone('boot');
              setBootSequence(false);
            }}
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              border: 'none', color: '#fff', fontSize: '14px', padding: '14px 36px',
              borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', letterSpacing: '2px',
              boxShadow: '0 0 20px var(--primary-glow)', transition: 'transform 0.2s'
            }}
          >
            INITIALIZE INTERFACE
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ position: 'relative', zIndex: 5 }}>
      {/* 3D background visual rings */}
      <JarvisHudCanvas enabled={animationsEnabled} />

      {/* HEADER */}
      <header className="dashboard-header glass-panel animate-slide-in">
        <div className="logo-section">
          {/* Animated Arc Reactor logo */}
          <div className="logo-icon" style={{ padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="arc-reactor" width="24" height="24" viewBox="0 0 100 100" style={{ transformOrigin: 'center', animation: 'spin 8s linear infinite' }}>
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0, 240, 255, 0.2)" strokeWidth="6" />
              <circle cx="50" cy="50" r="35" fill="none" stroke="var(--primary)" strokeWidth="7" strokeDasharray="25 15" />
              <circle cx="50" cy="50" r="22" fill="none" stroke="var(--secondary)" strokeWidth="4" strokeDasharray="8 8" />
              <circle cx="50" cy="50" r="10" fill="rgba(0, 240, 255, 0.4)" stroke="var(--primary)" strokeWidth="2" />
            </svg>
          </div>
          <h1 className="tech-mono">JARVIS ASSISTANT</h1>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {/* Real-time system timer clock */}
          <div className="tech-mono" style={{ fontSize: '13px', color: 'var(--primary)', borderRight: '1px solid rgba(0, 240, 255, 0.2)', paddingRight: '16px' }}>
            {sysTime}
          </div>

          {/* Config switches (Accessibility & Mute options) */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className={`hud-config-btn ${soundEnabled ? 'active' : ''}`}
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) playTechTone('beep');
              }}
              title={soundEnabled ? "Mute audio cues" : "Unmute audio cues"}
            >
              {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <button 
              className={`hud-config-btn ${animationsEnabled ? 'active' : ''}`}
              onClick={() => {
                setAnimationsEnabled(!animationsEnabled);
                if (soundEnabled) playTechTone('beep');
              }}
              title={animationsEnabled ? "Disable HUD graphics" : "Enable HUD graphics"}
            >
              <SparklesIcon size={15} />
            </button>
          </div>

          <div className="status-badge" style={{ borderColor: 'rgba(0, 240, 255, 0.2)', background: 'rgba(0, 240, 255, 0.05)' }}>
            <div className="status-dot status-active" style={{ background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)' }}></div>
            <span className="tech-mono" style={{ fontSize: '11px', color: 'var(--primary)' }}>NEURAL SECURE</span>
          </div>

          <button 
            className="history-btn" 
            onClick={() => {
              if (soundEnabled) playTechTone('beep');
              setShowLogs(true);
              fetchAuditLogs();
            }}
          >
            <Clock size={16} />
            <span className="tech-mono">SYSTEM LOGS</span>
          </button>
        </div>
      </header>

      {/* DASHBOARD CONTENT GRID */}
      <main className="dashboard-grid">
        
        {/* LEFT COLUMN: Input, Diagnostics & Step Tracker */}
        <section className="left-column">
          {/* HUD Diagnostics Widget */}
          <div className="diagnostics-card glass-panel animate-slide-in" style={{ animationDelay: '0.05s', padding: '16px', display: 'flex', justifyContent: 'space-around', fontSize: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase' }}>CORE TEMP</span>
              <span className="tech-mono" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>38.2 °C</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase' }}>CPU LOAD</span>
              <span className="tech-mono" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>12.4 %</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase' }}>MEMORY</span>
              <span className="tech-mono" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>48.7 MB</span>
            </div>
          </div>

          {/* COMMAND CARD */}
          <div className="command-card glass-panel animate-slide-in" style={{ animationDelay: '0.1s' }}>
            <h2 className="tech-mono" style={{ fontSize: '15px', color: 'var(--primary)', borderBottom: '1px solid rgba(0, 240, 255, 0.1)', paddingBottom: '8px' }}>Ask JARVIS Anything</h2>
            
            <div className="input-container" style={{ marginTop: '16px' }}>
              <textarea 
                className="command-input"
                placeholder="Type or speak a multi-action request (e.g. search prices and email results)..."
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCommandSubmit();
                  }
                }}
              />
              <div className="input-actions">
                <button
                  className={`voice-input-btn ${isListening ? 'listening' : ''}`}
                  onClick={handleVoiceInputStart}
                  disabled={isPending}
                  title="Speak command"
                >
                  {isListening ? <MicOff size={16} className="animate-pulse" /> : <Mic size={16} />}
                </button>
                
                <button 
                  className="submit-btn"
                  onClick={() => handleCommandSubmit()}
                  disabled={isPending || !commandText.trim()}
                >
                  {isPending ? <div className="status-dot status-active" style={{ background: 'var(--primary)' }}></div> : <Send size={16} />}
                  <span className="tech-mono">{isPending ? 'Working...' : 'Run'}</span>
                </button>
              </div>
            </div>

            <div className="helpers-list">
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Suggestions</span>
              {samplePrompts.map((p, idx) => (
                <button 
                  key={idx} 
                  className="helper-item animate-slide-in"
                  onClick={() => {
                    setCommandText(p.text);
                    handleCommandSubmit(p.text);
                  }}
                  style={{ 
                    borderRadius: '4px', textAlign: 'left', display: 'block', width: '100%', 
                    border: '1px solid var(--panel-border)', padding: '10px 14px', 
                    background: 'rgba(255, 255, 255, 0.02)', color: 'var(--text-muted)', 
                    cursor: 'pointer', transition: 'all 0.2s', marginBottom: '8px' 
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
            <h3 className="tech-mono" style={{ fontSize: '14px', color: 'var(--primary)' }}>
              <Database size={16} style={{ color: 'var(--primary)' }} />
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
                      <div 
                        className={`step-node ${isLast && isPending ? 'active' : 'completed'}`} 
                        style={{ 
                          backgroundColor: isErr ? 'var(--danger)' : undefined, 
                          borderColor: isErr ? 'var(--danger)' : undefined,
                          borderRadius: '4px'
                        }}
                      >
                        {isErr ? <X size={12} /> : <CheckCircle size={12} />}
                      </div>
                      <div className={`step-text ${isLast && isPending ? 'active' : 'completed'} tech-mono`} style={{ fontSize: '12px' }}>
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
          <div className="tabs-header" style={{ borderRadius: '4px' }}>
            <button 
              className={`tab-btn ${activeTab === 'prices' ? 'active' : ''}`}
              onClick={() => {
                if (soundEnabled) playTechTone('beep');
                setActiveTab('prices');
              }}
              style={{ borderRadius: '4px' }}
            >
              <ShoppingCart size={16} />
              <span className="tech-mono">Prices Compare</span>
              {results?.price_compare?.results && (
                <span className="badge" style={{ backgroundColor: 'var(--primary)', borderRadius: '4px' }}>{results.price_compare.results.length}</span>
              )}
            </button>
            <button 
              className={`tab-btn ${activeTab === 'slides' ? 'active' : ''}`}
              onClick={() => {
                if (soundEnabled) playTechTone('beep');
                setActiveTab('slides');
              }}
              style={{ borderRadius: '4px' }}
            >
              <FileText size={16} />
              <span className="tech-mono">PPTX Slides</span>
              {results?.presentation && <span className="badge" style={{ backgroundColor: 'var(--secondary)', borderRadius: '4px' }}>Active</span>}
            </button>
            <button 
              className={`tab-btn ${activeTab === 'email' ? 'active' : ''}`}
              onClick={() => {
                if (soundEnabled) playTechTone('beep');
                setActiveTab('email');
              }}
              style={{ borderRadius: '4px' }}
            >
              <Mail size={16} />
              <span className="tech-mono">Email Draft</span>
              {results?.email_draft && <span className="badge" style={{ backgroundColor: 'var(--accent)', borderRadius: '4px' }}>Edit</span>}
            </button>
            <button 
              className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => {
                if (soundEnabled) playTechTone('beep');
                setActiveTab('general');
              }}
              style={{ borderRadius: '4px' }}
            >
              <Bot size={16} />
              <span className="tech-mono">General</span>
            </button>
          </div>

          {/* TAB CONTENTS */}
          <div className="tab-content">
            
            {/* NO RESULTS / EMPTY PLACEHOLDER */}
            {!results && (
              <div className="tab-placeholder">
                <Sparkles size={48} className="placeholder-icon" style={{ animation: 'float 3s ease-in-out infinite', color: 'rgba(0, 240, 255, 0.15)' }} />
                <h3 className="tech-mono" style={{ color: 'var(--primary)' }}>SYSTEM STATUS: IDLE</h3>
                <p style={{ maxWidth: '360px', fontSize: '13px' }}>Enter a query on the left. The output of the scraped products, PowerPoint downloads, or draft emails will render here in real-time.</p>
              </div>
            )}

            {/* PRICES TAB */}
            {results && activeTab === 'prices' && (
              <div>
                {!results.price_compare || !results.price_compare.results ? (
                  <div className="tab-placeholder" style={{ height: '260px' }}>
                    <AlertCircle size={36} className="placeholder-icon" />
                    <p>No price comparison data generated for this query.</p>
                  </div>
                ) : (
                  <div>
                    {/* Visual Comparison Graph */}
                    <div className="comparison-card glass-panel" style={{ borderRadius: '4px' }}>
                      <h4 className="tech-mono" style={{ color: 'var(--primary)' }}>Price Range Visual Comparison (Lower is better)</h4>
                      <div className="chart-bar-container" style={{ marginTop: '16px' }}>
                        {results.price_compare.results.map((item, idx) => {
                          const itemPrice = parseInt(item.price.replace(/[^\d]/g, '')) || 0;
                          const widthPct = maxPriceVal ? (itemPrice / maxPriceVal) * 100 : 0;
                          const isInstant = item.delivery_type === 'instant';
                          return (
                            <div key={idx} className="chart-row">
                              <span className="chart-label tech-mono" style={{ fontSize: '12px' }}>
                                {isInstant ? '⚡ ' : '📅 '} {item.source} - {item.title}
                              </span>
                              <div className="chart-track">
                                <div className="chart-fill" style={{ width: `${widthPct}%`, background: idx === 0 ? 'linear-gradient(90deg, #00f0ff, #8b5cf6)' : 'linear-gradient(90deg, rgba(0, 240, 255, 0.4), rgba(139, 92, 246, 0.4))' }}></div>
                              </div>
                              <span className="chart-value tech-mono" style={{ color: idx === 0 ? 'var(--primary)' : undefined }}>{item.price}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Delivery Options Sections */}
                    <div className="delivery-sections-container">
                      
                      {/* INSTANT DELIVERY SECTION */}
                      <div className="delivery-section">
                        <div className="delivery-section-header">
                          <span className="icon">⚡</span>
                          <h3 className="tech-mono">Instant Delivery (10-20 Mins)</h3>
                          <span className="badge-count tech-mono">
                            {results.price_compare.results.filter(item => item.delivery_type === 'instant').length} options
                          </span>
                        </div>
                        {results.price_compare.results.filter(item => item.delivery_type === 'instant').length === 0 ? (
                          <div className="no-delivery-options tech-mono" style={{ borderRadius: '4px' }}>
                            No instant delivery options available for this query.
                          </div>
                        ) : (
                          <div className="price-grid">
                            {results.price_compare.results
                              .filter(item => item.delivery_type === 'instant')
                              .map((item, idx) => (
                                <div key={idx} className="product-card glass-panel instant-delivery-card animate-slide-in" style={{ borderRadius: '4px' }}>
                                  <div className="product-image-container">
                                    <img src={item.image} alt={item.title} className="product-img" />
                                    <span className="delivery-badge instant tech-mono">⚡ Instant</span>
                                  </div>
                                  <div className="product-details">
                                    <div className="product-meta">
                                      <span className="product-source tech-mono" style={{ background: 'rgba(0, 240, 255, 0.1)', color: 'var(--primary)', borderRadius: '2px' }}>{item.source}</span>
                                      <span className="product-rating">★ {item.rating}</span>
                                    </div>
                                    <h3 className="product-title" title={item.title}>{item.title}</h3>
                                    <span className="product-price tech-mono">{item.price}</span>
                                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="product-btn instant-btn tech-mono" style={{ borderRadius: '4px' }}>
                                      <span>Order Now</span>
                                      <ExternalLink size={12} style={{ marginLeft: '4px', display: 'inline' }} />
                                    </a>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      {/* SCHEDULED DELIVERY SECTION */}
                      <div className="delivery-section">
                        <div className="delivery-section-header">
                          <span className="icon">📅</span>
                          <h3 className="tech-mono">Scheduled Delivery (1-3 Days)</h3>
                          <span className="badge-count tech-mono">
                            {results.price_compare.results.filter(item => item.delivery_type !== 'instant').length} options
                          </span>
                        </div>
                        {results.price_compare.results.filter(item => item.delivery_type !== 'instant').length === 0 ? (
                          <div className="no-delivery-options tech-mono" style={{ borderRadius: '4px' }}>
                            No scheduled delivery options available for this query.
                          </div>
                        ) : (
                          <div className="price-grid">
                            {results.price_compare.results
                              .filter(item => item.delivery_type !== 'instant')
                              .map((item, idx) => (
                                <div key={idx} className="product-card glass-panel animate-slide-in" style={{ borderRadius: '4px' }}>
                                  <div className="product-image-container">
                                    <img src={item.image} alt={item.title} className="product-img" />
                                    <span className="delivery-badge scheduled tech-mono">📅 Scheduled</span>
                                  </div>
                                  <div className="product-details">
                                    <div className="product-meta">
                                      <span className="product-source tech-mono" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--secondary)', borderRadius: '2px' }}>{item.source}</span>
                                      <span className="product-rating">★ {item.rating}</span>
                                    </div>
                                    <h3 className="product-title" title={item.title}>{item.title}</h3>
                                    <span className="product-price tech-mono">{item.price}</span>
                                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="product-btn tech-mono" style={{ borderRadius: '4px' }}>
                                      <span>Buy Now</span>
                                      <ExternalLink size={12} style={{ marginLeft: '4px', display: 'inline' }} />
                                    </a>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

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
                    <div className="slides-hero glass-panel" style={{ borderRadius: '4px' }}>
                      <div className="slides-hero-info">
                        <h3 className="tech-mono" style={{ color: 'var(--primary)' }}>{results.presentation.topic} Slides</h3>
                        <p className="tech-mono" style={{ fontSize: '11px', marginTop: '6px' }}>File: {results.presentation.filename}</p>
                      </div>
                      <a 
                        href={`${PRESENTATION_URL}${results.presentation.download_url}`}
                        download 
                        className="download-pptx-btn tech-mono"
                        style={{ borderRadius: '4px' }}
                      >
                        <Download size={18} />
                        <span>Download .PPTX</span>
                      </a>
                    </div>

                    <div className="slides-list">
                      <h4 className="tech-mono" style={{ margin: '0', fontSize: '13px', color: 'var(--text-muted)', letterSpacing: '1px' }}>Generated Slide Outline</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="slide-preview-card glass-panel" style={{ borderLeftColor: 'var(--primary)', borderRadius: '4px' }}>
                          <h4 className="tech-mono">[Slide 1: Title Slide]</h4>
                          <ul className="slide-preview-bullets">
                            <li>Title: {results.presentation.topic}</li>
                            <li>Accent Styling Theme applied.</li>
                          </ul>
                        </div>
                        <div className="slide-preview-card glass-panel" style={{ borderLeftColor: 'var(--secondary)', borderRadius: '4px' }}>
                          <h4 className="tech-mono">[Slide 2: Background Context]</h4>
                          <ul className="slide-preview-bullets">
                            <li>Overview and key industry factors.</li>
                            <li>Unsplash background image matched.</li>
                          </ul>
                        </div>
                        <div className="slide-preview-card glass-panel" style={{ borderLeftColor: 'var(--primary)', borderRadius: '4px' }}>
                          <h4 className="tech-mono">[Slide 3: Detailed Breakdown]</h4>
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
                      <div className="alert-success animate-slide-in" style={{ borderRadius: '4px' }}>
                        <CheckCircle size={18} />
                        <span className="tech-mono">{emailSuccessMsg}</span>
                      </div>
                    )}
                    {emailErrorMsg && (
                      <div className="alert-success animate-slide-in" style={{ backgroundColor: 'rgba(255, 0, 85, 0.1)', borderColor: 'rgba(255, 0, 85, 0.2)', color: 'var(--danger)', borderRadius: '4px' }}>
                        <AlertCircle size={18} />
                        <span className="tech-mono">{emailErrorMsg}</span>
                      </div>
                    )}

                    <div className="form-group">
                      <label htmlFor="recipient" className="tech-mono">Recipient Address:</label>
                      <input 
                        id="recipient"
                        type="email" 
                        className="form-input" 
                        value={emailRecipient} 
                        onChange={(e) => setEmailRecipient(e.target.value)} 
                        placeholder="boss@company.com"
                        style={{ borderRadius: '4px' }}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="subject" className="tech-mono">Subject Line:</label>
                      <input 
                        id="subject"
                        type="text" 
                        className="form-input" 
                        value={emailSubject} 
                        onChange={(e) => setEmailSubject(e.target.value)} 
                        placeholder="JARVIS Report Update"
                        style={{ borderRadius: '4px' }}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="body" className="tech-mono">Email Content (HTML Supported):</label>
                      <textarea 
                        id="body"
                        className="form-input form-textarea" 
                        value={emailBody} 
                        onChange={(e) => setEmailBody(e.target.value)} 
                        placeholder="Draft body..."
                        style={{ borderRadius: '4px' }}
                      />
                    </div>
                    <div className="email-actions">
                      <button 
                        className="send-email-btn tech-mono"
                        onClick={handleSendEmail}
                        disabled={emailSending || !emailRecipient}
                        style={{ borderRadius: '4px', backgroundColor: 'var(--accent)', boxShadow: '0 0 10px var(--accent-glow)' }}
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
                <div className="glass-panel" style={{ padding: '24px', whiteSpace: 'pre-wrap', borderRadius: '4px' }}>
                  {results.chat_response || "No conversational response returned. Try asking a general question like 'What is Quantum Computing?'"}
                </div>
              </div>
            )}

          </div>
        </section>
        
      </main>

      {/* SQLITE AUDIT DRAWER */}
      <section className={`logs-drawer ${showLogs ? 'open' : ''}`} style={{ borderLeftColor: 'rgba(0, 240, 255, 0.25)' }}>
        <div className="drawer-header">
          <h3 className="tech-mono" style={{ color: 'var(--primary)' }}>
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
              <div key={log.id} className="audit-item glass-panel" style={{ borderRadius: '4px' }}>
                <div className="audit-meta tech-mono">
                  <span>ID: #{log.id}</span>
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p className="audit-command">"{log.command}"</p>
                <span className={`audit-badge ${log.intent} tech-mono`}>{log.intent}</span>
              </div>
            ))
          )}
        </div>
      </section>

    </div>
  );
}

export default App;
