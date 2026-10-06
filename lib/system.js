import os from 'os';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Sample CPU usage over an interval or calculate based on ticks
function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - Math.round((100 * idle) / total);
  
  // Also provide load average (1m, 5m, 15m)
  const loadAvg = os.loadavg();
  const cores = cpus.length;
  const loadPercent = Math.min(100, Math.round((loadAvg[0] / cores) * 100));

  return {
    usagePercent: Math.max(usage, 0),
    loadAvg: loadAvg.map(l => Number(l.toFixed(2))),
    cores,
    model: cpus[0]?.model || 'Generic CPU'
  };
}

function getMemoryUsage() {
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();
  const usedMemBytes = totalMemBytes - freeMemBytes;

  const totalGB = (totalMemBytes / (1024 ** 3)).toFixed(1);
  const usedGB = (usedMemBytes / (1024 ** 3)).toFixed(1);
  const freeGB = (freeMemBytes / (1024 ** 3)).toFixed(1);
  const percent = Math.round((usedMemBytes / totalMemBytes) * 100);

  return {
    total: `${totalGB} GB`,
    used: `${usedGB} GB`,
    free: `${freeGB} GB`,
    percent,
    raw: {
      totalBytes: totalMemBytes,
      usedBytes: usedMemBytes
    }
  };
}

async function getDiskUsage() {
  try {
    // df -h / works reliably on Linux VPS and macOS
    const { stdout } = await execPromise('df -h /');
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      // Line format: Filesystem Size Used Avail Use% Mounted on
      const parts = lines[1].trim().split(/\s+/);
      if (parts.length >= 5) {
        // Find percentage column (has %)
        const pctIndex = parts.findIndex(p => p.endsWith('%'));
        const percent = pctIndex !== -1 ? parseInt(parts[pctIndex].replace('%', ''), 10) : 0;
        const total = parts[1] || 'Unknown';
        const used = parts[2] || 'Unknown';
        const free = parts[3] || 'Unknown';
        const mount = parts[parts.length - 1] || '/';

        return {
          total,
          used,
          free,
          percent,
          mount
        };
      }
    }
  } catch (err) {
    console.error('Error getting disk usage:', err.message);
  }

  return {
    total: 'N/A',
    used: 'N/A',
    free: 'N/A',
    percent: 0,
    mount: '/'
  };
}

async function getPm2Status() {
  try {
    // Run pm2 jlist to get JSON list of processes
    const { stdout } = await execPromise('pm2 jlist', { timeout: 4000 });
    const list = JSON.parse(stdout.trim());
    if (Array.isArray(list)) {
      return list.map(proc => ({
        id: proc.pm_id,
        name: proc.name,
        status: proc.pm2_env?.status || 'unknown',
        cpu: proc.monit?.cpu || 0,
        memoryBytes: proc.monit?.memory || 0,
        memoryMB: Math.round((proc.monit?.memory || 0) / (1024 * 1024)),
        restarts: proc.pm2_env?.restart_time || 0,
        uptime: proc.pm2_env?.pm_uptime ? Math.floor((Date.now() - proc.pm2_env.pm_uptime) / 1000) : 0,
        pid: proc.pid
      }));
    }
  } catch (err) {
    // PM2 might not be running or installed
    // Return empty array
  }
  return [];
}

export async function getSystemMetrics() {
  const cpu = getCpuUsage();
  const ram = getMemoryUsage();
  const [disk, pm2] = await Promise.all([
    getDiskUsage(),
    getPm2Status()
  ]);

  const uptimeSec = os.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    uptime: `${days}d ${hours}h ${minutes}m`,
    cpu,
    ram,
    disk,
    pm2,
    timestamp: new Date().toISOString()
  };
}
