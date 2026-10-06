'use client';

import { useState, useEffect, useRef } from 'react';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Terminal Modal state
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [terminalAction, setTerminalAction] = useState('');
  const [terminalCommand, setTerminalCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalStatus, setTerminalStatus] = useState('idle'); // 'running' | 'success' | 'failed'
  const [terminalDuration, setTerminalDuration] = useState(null);
  const [logLines, setLogLines] = useState(100);
  const [logsAutoRefresh, setLogsAutoRefresh] = useState(false);
  const [actionLoading, setActionLoading] = useState({}); // { [projId_action]: boolean }

  // Manage Projects modal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingProjectsJson, setEditingProjectsJson] = useState('');
  const [newProject, setNewProject] = useState({
    name: '',
    path: '',
    branch: 'main',
    pm2Name: '',
    buildCommand: 'npm run build'
  });
  const [saveStatus, setSaveStatus] = useState('');

  const terminalBodyRef = useRef(null);
  const logsIntervalRef = useRef(null);

  // Fetch System Metrics
  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();
      if (data.success && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  // Fetch Projects List
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success && data.projects) {
        setProjects(data.projects);
        setEditingProjectsJson(JSON.stringify(data.projects, null, 2));
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMetrics();
    fetchProjects();
  }, []);

  // Auto-refresh metrics every 8 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMetrics();
    }, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Scroll terminal to bottom when content changes
  useEffect(() => {
    if (terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [terminalOutput, terminalStatus]);

  // Execute Project Action
  const handleExecuteAction = async (project, action, customOptions = {}) => {
    const key = `${project.id}_${action}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));

    setActiveProject(project);
    setTerminalAction(action);
    setTerminalStatus('running');
    setTerminalDuration(null);
    setTerminalOpen(true);

    let displayCmd = '';
    if (action === 'pull') displayCmd = `git pull origin ${project.branch}`;
    else if (action === 'build') displayCmd = `npm install && ${project.buildCommand || 'npm run build'}`;
    else if (action === 'restart') displayCmd = `pm2 restart ${project.pm2Name || project.name}`;
    else if (action === 'logs') displayCmd = `pm2 logs ${project.pm2Name || project.name} --lines ${customOptions.lines || logLines} --nostream`;

    setTerminalCommand(displayCmd);
    setTerminalOutput(`> Executing: ${displayCmd}\n> Working Directory: ${action === 'restart' || action === 'logs' ? 'System PM2' : project.path}\n> Please wait...\n\n`);

    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          action,
          options: {
            lines: customOptions.lines || logLines
          }
        })
      });

      const data = await res.json();
      const durationSec = data.durationMs ? (data.durationMs / 1000).toFixed(2) : '0';
      setTerminalDuration(durationSec);

      let out = '';
      if (data.stdout) out += data.stdout;
      if (data.stderr) {
        if (out) out += '\n\n--- Standard Error ---\n';
        out += data.stderr;
      }

      if (!out) {
        out = data.success ? '(Command executed successfully with no output)' : `Error: ${data.error || 'Unknown error'}`;
      }

      setTerminalOutput(out);
      setTerminalStatus(data.success ? 'success' : 'failed');

      // If restart action was executed, refresh system & pm2 metrics immediately
      if (action === 'restart') {
        setTimeout(fetchMetrics, 1200);
      }
    } catch (err) {
      setTerminalStatus('failed');
      setTerminalOutput(`Network / Execution Error: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Logs live auto-refresh inside modal
  useEffect(() => {
    if (terminalOpen && terminalAction === 'logs' && logsAutoRefresh && activeProject) {
      logsIntervalRef.current = setInterval(() => {
        handleExecuteAction(activeProject, 'logs', { lines: logLines });
      }, 5000);
    } else {
      if (logsIntervalRef.current) clearInterval(logsIntervalRef.current);
    }
    return () => {
      if (logsIntervalRef.current) clearInterval(logsIntervalRef.current);
    };
  }, [terminalOpen, terminalAction, logsAutoRefresh, activeProject, logLines]);

  // Match PM2 status for a project
  const getProjectPm2Info = (pm2Name) => {
    if (!metrics || !Array.isArray(metrics.pm2)) return null;
    return metrics.pm2.find(
      (proc) => proc.name?.toLowerCase() === pm2Name?.toLowerCase()
    );
  };

  // Add new project
  const handleAddNewProject = async (e) => {
    e.preventDefault();
    if (!newProject.name || !newProject.path || !newProject.pm2Name) {
      setSaveStatus('Please fill in Name, Path, and PM2 Process Name');
      return;
    }

    const id = newProject.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const updatedList = [...projects, { ...newProject, id }];

    try {
      setSaveStatus('Saving...');
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: updatedList })
      });
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects);
        setEditingProjectsJson(JSON.stringify(data.projects, null, 2));
        setNewProject({
          name: '',
          path: '',
          branch: 'main',
          pm2Name: '',
          buildCommand: 'npm run build'
        });
        setSaveStatus('Project added successfully!');
        setTimeout(() => {
          setConfigModalOpen(false);
          setSaveStatus('');
        }, 1000);
      } else {
        setSaveStatus(`Failed: ${data.error}`);
      }
    } catch (err) {
      setSaveStatus(`Error: ${err.message}`);
    }
  };

  // Save raw JSON
  const handleSaveRawJson = async () => {
    try {
      setSaveStatus('Validating and saving JSON...');
      const parsed = JSON.parse(editingProjectsJson);
      if (!Array.isArray(parsed)) {
        setSaveStatus('JSON must be an array of projects');
        return;
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: parsed })
      });
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects);
        setSaveStatus('Saved successfully!');
        setTimeout(() => {
          setConfigModalOpen(false);
          setSaveStatus('');
        }, 1000);
      } else {
        setSaveStatus(`Error: ${data.error}`);
      }
    } catch (err) {
      setSaveStatus(`Invalid JSON syntax: ${err.message}`);
    }
  };

  // Copy terminal output
  const handleCopyTerminal = () => {
    navigator.clipboard.writeText(terminalOutput);
    alert('Terminal output copied to clipboard!');
  };

  // PM2 summary stats
  const pm2Processes = metrics?.pm2 || [];
  const pm2Online = pm2Processes.filter((p) => p.status === 'online').length;
  const pm2Errored = pm2Processes.filter((p) => p.status === 'errored').length;
  const pm2Stopped = pm2Processes.filter((p) => p.status === 'stopped').length;

  return (
    <main className="dashboard-container">
      {/* Top Header */}
      <header className="top-header">
        <div className="brand-section">
          <div className="brand-icon">⚡</div>
          <div>
            <h1 className="brand-title">
              VPS Control Panel
              <span className="brand-badge">Node.js / PM2</span>
            </h1>
            <div className="brand-subtitle">
              <span>Host: <strong>{metrics?.hostname || 'Connecting...'}</strong></span>
              <span>•</span>
              <span>Uptime: <strong>{metrics?.uptime || '—'}</strong></span>
              <span>•</span>
              <span style={{ color: 'var(--text-muted)' }}>{metrics?.platform || ''}</span>
            </div>
          </div>
        </div>

        <div className="header-actions">
          <div className="meta-pill">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: autoRefresh ? '#10b981' : '#64748b'
              }}
            />
            {autoRefresh ? 'Live Polling: 8s' : 'Polling Paused'}
          </div>

          <button
            className="btn-header"
            onClick={() => setAutoRefresh(!autoRefresh)}
            title="Toggle live metrics polling"
          >
            {autoRefresh ? '⏸ Pause' : '▶ Resume'}
          </button>

          <button
            className="btn-header"
            onClick={() => {
              fetchMetrics();
              fetchProjects();
            }}
            title="Refresh now"
          >
            ↻ Refresh
          </button>

          <button
            className="btn-header btn-primary"
            onClick={() => setConfigModalOpen(true)}
          >
            + Configure Projects
          </button>
        </div>
      </header>

      {/* System Metrics Grid */}
      <section className="metrics-grid">
        {/* CPU Card */}
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">🖥️ CPU Usage</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {metrics?.cpu?.cores || 1} Cores
            </span>
          </div>
          <div className="metric-value">
            {loadingMetrics ? '—' : `${metrics?.cpu?.usagePercent ?? 0}%`}
          </div>
          <div className="metric-sub">
            <span>Load Avg (1/5/15m):</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {metrics?.cpu?.loadAvg?.join(' • ') || '—'}
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className={`progress-bar-fill ${
                (metrics?.cpu?.usagePercent || 0) > 80
                  ? 'progress-red'
                  : (metrics?.cpu?.usagePercent || 0) > 50
                  ? 'progress-amber'
                  : 'progress-blue'
              }`}
              style={{ width: `${Math.min(100, metrics?.cpu?.usagePercent || 0)}%` }}
            />
          </div>
        </div>

        {/* RAM Card */}
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">🧠 Memory (RAM)</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Free: {metrics?.ram?.free || '—'}
            </span>
          </div>
          <div className="metric-value">
            {loadingMetrics ? '—' : `${metrics?.ram?.percent ?? 0}%`}
          </div>
          <div className="metric-sub">
            <span>Used / Total:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {metrics?.ram?.used || '—'} / {metrics?.ram?.total || '—'}
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className={`progress-bar-fill ${
                (metrics?.ram?.percent || 0) > 85
                  ? 'progress-red'
                  : (metrics?.ram?.percent || 0) > 65
                  ? 'progress-amber'
                  : 'progress-green'
              }`}
              style={{ width: `${Math.min(100, metrics?.ram?.percent || 0)}%` }}
            />
          </div>
        </div>

        {/* Disk Card */}
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">💾 Disk Space</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Mount: {metrics?.disk?.mount || '/'}
            </span>
          </div>
          <div className="metric-value">
            {loadingMetrics ? '—' : `${metrics?.disk?.percent ?? 0}%`}
          </div>
          <div className="metric-sub">
            <span>Used / Total:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {metrics?.disk?.used || '—'} / {metrics?.disk?.total || '—'}
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className={`progress-bar-fill ${
                (metrics?.disk?.percent || 0) > 85
                  ? 'progress-red'
                  : (metrics?.disk?.percent || 0) > 70
                  ? 'progress-amber'
                  : 'progress-blue'
              }`}
              style={{ width: `${Math.min(100, metrics?.disk?.percent || 0)}%` }}
            />
          </div>
        </div>

        {/* PM2 Status Card */}
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">⚙️ PM2 Engine</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {pm2Processes.length} Managed
            </span>
          </div>
          <div className="metric-value" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>{pm2Online}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
              online
            </span>
          </div>
          <div className="metric-sub">
            <span style={{ color: pm2Errored > 0 ? '#ef4444' : 'var(--text-muted)' }}>
              🔴 {pm2Errored} Errored
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              🟡 {pm2Stopped} Stopped
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill progress-green"
              style={{
                width: `${
                  pm2Processes.length > 0 ? (pm2Online / pm2Processes.length) * 100 : 0
                }%`
              }}
            />
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section>
        <div className="section-header">
          <div className="section-title-wrap">
            <h2 className="section-title">Projects</h2>
            <span className="section-badge">{projects.length} configured</span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Config file: <code style={{ color: '#38bdf8' }}>projects.json</code>
          </span>
        </div>

        {loadingProjects ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <span className="spinner" /> Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px dashed var(--border-color)',
              borderRadius: 14,
              padding: 40,
              textAlign: 'center'
            }}
          >
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
              No projects configured yet in <code>projects.json</code>.
            </p>
            <button
              className="btn-header btn-primary"
              onClick={() => setConfigModalOpen(true)}
            >
              + Add First Project
            </button>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((proj) => {
              const pm2Info = getProjectPm2Info(proj.pm2Name || proj.name);
              const isOnline = pm2Info?.status === 'online';
              const isErrored = pm2Info?.status === 'errored';
              const isStopped = pm2Info?.status === 'stopped';
              const statusClass = isOnline
                ? 'online'
                : isErrored
                ? 'errored'
                : isStopped
                ? 'stopped'
                : 'unknown';

              const pullKey = `${proj.id}_pull`;
              const buildKey = `${proj.id}_build`;
              const restartKey = `${proj.id}_restart`;
              const logsKey = `${proj.id}_logs`;

              return (
                <div key={proj.id || proj.name} className="project-card">
                  {/* Card Header */}
                  <div className="project-card-header">
                    <div className="project-name-group">
                      <span className={`status-dot ${statusClass}`} />
                      <h3 className="project-name">{proj.name}</h3>
                    </div>

                    <div className={`pm2-status-pill ${statusClass}`}>
                      {pm2Info?.status || 'Not running'}
                      {pm2Info && isOnline && (
                        <span style={{ fontSize: 10, opacity: 0.8 }}>
                          ({pm2Info.memoryMB}MB)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Project Details */}
                  <div className="project-details">
                    <div className="detail-row">
                      <span className="detail-label">Path:</span>
                      <span className="detail-val" title={proj.path}>
                        {proj.path}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">PM2:</span>
                      <span className="detail-val code">
                        {proj.pm2Name || proj.name}
                        {pm2Info?.pid ? ` (PID: ${pm2Info.pid})` : ''}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Branch:</span>
                      <span className="detail-val branch">
                        ⎇ {proj.branch || 'main'}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Build:</span>
                      <span className="detail-val" style={{ color: 'var(--text-muted)' }}>
                        {proj.buildCommand || 'npm run build'}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="actions-row">
                    <button
                      className="btn-action pull"
                      disabled={actionLoading[pullKey]}
                      onClick={() => handleExecuteAction(proj, 'pull')}
                      title={`Run: git pull origin ${proj.branch || 'main'}`}
                    >
                      {actionLoading[pullKey] ? (
                        <span className="spinner" />
                      ) : (
                        <span className="btn-icon">⬇️</span>
                      )}
                      <span>Git Pull</span>
                    </button>

                    <button
                      className="btn-action build"
                      disabled={actionLoading[buildKey]}
                      onClick={() => handleExecuteAction(proj, 'build')}
                      title={`Run: npm install && ${proj.buildCommand || 'npm run build'}`}
                    >
                      {actionLoading[buildKey] ? (
                        <span className="spinner" />
                      ) : (
                        <span className="btn-icon">🔨</span>
                      )}
                      <span>Build</span>
                    </button>

                    <button
                      className="btn-action restart"
                      disabled={actionLoading[restartKey]}
                      onClick={() => handleExecuteAction(proj, 'restart')}
                      title={`Run: pm2 restart ${proj.pm2Name || proj.name}`}
                    >
                      {actionLoading[restartKey] ? (
                        <span className="spinner" />
                      ) : (
                        <span className="btn-icon">🔄</span>
                      )}
                      <span>Restart</span>
                    </button>

                    <button
                      className="btn-action logs"
                      disabled={actionLoading[logsKey]}
                      onClick={() => handleExecuteAction(proj, 'logs')}
                      title={`Run: pm2 logs ${proj.pm2Name || proj.name}`}
                    >
                      {actionLoading[logsKey] ? (
                        <span className="spinner" />
                      ) : (
                        <span className="btn-icon">📋</span>
                      )}
                      <span>Logs</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Terminal Modal Popup */}
      {terminalOpen && (
        <div className="modal-overlay" onClick={() => setTerminalOpen(false)}>
          <div className="terminal-window" onClick={(e) => e.stopPropagation()}>
            {/* Titlebar */}
            <div className="terminal-titlebar">
              <div className="window-dots">
                <span
                  className="window-dot close"
                  onClick={() => setTerminalOpen(false)}
                  style={{ cursor: 'pointer' }}
                  title="Close"
                />
                <span className="window-dot minimize" />
                <span className="window-dot maximize" />
              </div>

              <div className="terminal-title">
                <span>🖥️</span>
                <strong>{activeProject?.name}</strong>
                <span>—</span>
                <span style={{ color: '#58a6ff' }}>
                  {terminalAction.toUpperCase()} CONSOLE
                </span>
              </div>

              <div className="terminal-top-controls">
                {terminalAction === 'logs' && (
                  <>
                    <select
                      value={logLines}
                      onChange={(e) => {
                        const count = Number(e.target.value);
                        setLogLines(count);
                        if (activeProject) {
                          handleExecuteAction(activeProject, 'logs', { lines: count });
                        }
                      }}
                      style={{
                        background: '#21262d',
                        color: '#c9d1d9',
                        border: '1px solid #30363d',
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontSize: 11
                      }}
                    >
                      <option value="50">50 lines</option>
                      <option value="100">100 lines</option>
                      <option value="200">200 lines</option>
                      <option value="500">500 lines</option>
                    </select>

                    <button
                      className="btn-header"
                      style={{ padding: '3px 8px', fontSize: 11 }}
                      onClick={() => setLogsAutoRefresh(!logsAutoRefresh)}
                    >
                      {logsAutoRefresh ? 'Live: ON (5s)' : 'Live: OFF'}
                    </button>

                    <button
                      className="btn-header"
                      style={{ padding: '3px 8px', fontSize: 11 }}
                      onClick={() => handleExecuteAction(activeProject, 'logs', { lines: logLines })}
                    >
                      ↻ Reload
                    </button>
                  </>
                )}

                <button
                  className="btn-header"
                  style={{ padding: '3px 8px', fontSize: 11 }}
                  onClick={handleCopyTerminal}
                >
                  Copy
                </button>

                <button
                  className="btn-header"
                  style={{ padding: '3px 8px', fontSize: 11 }}
                  onClick={() => setTerminalOutput('')}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Command Banner */}
            <div className="terminal-command-banner">
              <span>$ {terminalCommand}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                Target: {activeProject?.path}
              </span>
            </div>

            {/* Terminal Output */}
            <div className="terminal-body" ref={terminalBodyRef}>
              {terminalOutput}
            </div>

            {/* Terminal Footer */}
            <div className="terminal-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>Status:</span>
                <span className={`status-badge ${terminalStatus}`}>
                  {terminalStatus === 'running' && (
                    <span className="spinner" style={{ marginRight: 6 }} />
                  )}
                  {terminalStatus}
                </span>
                {terminalDuration && (
                  <span>Execution time: {terminalDuration}s</span>
                )}
              </div>

              <div>
                <button
                  className="btn-header"
                  style={{ padding: '4px 12px', fontSize: 12 }}
                  onClick={() => setTerminalOpen(false)}
                >
                  Close [ESC]
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects Configuration Modal */}
      {configModalOpen && (
        <div className="modal-overlay" onClick={() => setConfigModalOpen(false)}>
          <div className="config-modal" onClick={(e) => e.stopPropagation()}>
            <div className="config-modal-header">
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>
                Configure Projects (projects.json)
              </h3>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 18,
                  cursor: 'pointer'
                }}
                onClick={() => setConfigModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="config-modal-body">
              {/* Add New Project Form */}
              <form onSubmit={handleAddNewProject} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#38bdf8' }}>
                  + Add Project to Configuration
                </h4>

                <div className="form-group">
                  <label className="form-label">Project Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="plyzoo"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Folder Path (Absolute VPS path)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="/home/plyzoo.com"
                    value={newProject.path}
                    onChange={(e) => setNewProject({ ...newProject, path: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Git Branch</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="main"
                      value={newProject.branch}
                      onChange={(e) => setNewProject({ ...newProject, branch: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">PM2 Process Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="plyzoo"
                      value={newProject.pm2Name}
                      onChange={(e) => setNewProject({ ...newProject, pm2Name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Build Command</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="npm run build"
                    value={newProject.buildCommand}
                    onChange={(e) => setNewProject({ ...newProject, buildCommand: e.target.value })}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Will execute: <code>npm install && {newProject.buildCommand || 'npm run build'}</code>
                  </span>
                </div>

                <button type="submit" className="btn-header btn-primary" style={{ alignSelf: 'flex-start' }}>
                  + Add Project
                </button>
              </form>

              <hr style={{ borderColor: 'var(--border-color)', margin: '8px 0' }} />

              {/* Direct JSON Editor */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Direct JSON Editor:</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    Saved directly to <code>projects.json</code>
                  </span>
                </label>
                <textarea
                  className="form-input"
                  rows={8}
                  value={editingProjectsJson}
                  onChange={(e) => setEditingProjectsJson(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
                />
                <button
                  type="button"
                  className="btn-header"
                  style={{ alignSelf: 'flex-start', marginTop: 6 }}
                  onClick={handleSaveRawJson}
                >
                  Save JSON Directly
                </button>
              </div>

              {saveStatus && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    background: saveStatus.includes('Error') || saveStatus.includes('Failed')
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(16, 185, 129, 0.15)',
                    color: saveStatus.includes('Error') || saveStatus.includes('Failed')
                      ? '#ef4444'
                      : '#10b981',
                    border: '1px solid currentColor'
                  }}
                >
                  {saveStatus}
                </div>
              )}
            </div>

            <div className="config-modal-footer">
              <button
                className="btn-header"
                onClick={() => setConfigModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
