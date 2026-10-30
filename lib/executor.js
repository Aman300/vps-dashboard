import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { findProjectById } from './projects';

// Allowed operations only
const ALLOWED_ACTIONS = ['pull', 'build', 'restart', 'logs', 'status'];

// Helper to sanitize parameters for extra safety
function sanitizeArg(str) {
  if (typeof str !== 'string') return '';
  // Disallow shell control characters: ; & | ` $ > < \ " ' ! \n \r
  return str.replace(/[;&|`$><\\"'\n\r]/g, '').trim();
}

export async function executeProjectAction(projectId, action, options = {}) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new Error(`Unauthorized action: "${action}". Only [pull, build, restart, logs, status] are permitted.`);
  }

  const project = findProjectById(projectId);
  if (!project) {
    throw new Error(`Project with id "${projectId}" was not found in projects.json.`);
  }

  const sanitizedBranch = sanitizeArg(project.branch || 'main');
  const sanitizedPm2Name = sanitizeArg(project.pm2Name || project.name);
  const projectPath = path.resolve(project.path);

  let commandToRun = '';
  let cwd = projectPath;
  let timeoutMs = 60000; // default 1 min

  switch (action) {
    case 'pull': {
      if (!fs.existsSync(projectPath)) {
        throw new Error(`Project directory does not exist on this machine: ${projectPath}`);
      }
      commandToRun = `git pull origin ${sanitizedBranch}`;
      timeoutMs = 45000;
      break;
    }

    case 'build': {
      if (!fs.existsSync(projectPath)) {
        throw new Error(`Project directory does not exist on this machine: ${projectPath}`);
      }
      // Configured build command
      const buildCmd = project.buildCommand || 'npm run build';
      commandToRun = `npm install --legacy-peer-deps && ${buildCmd}`;
      timeoutMs = 180000; // 3 minutes for build
      break;
    }

    case 'restart': {
      commandToRun = `pm2 restart ${sanitizedPm2Name}`;
      cwd = undefined; // run anywhere
      timeoutMs = 20000;
      break;
    }

    case 'logs': {
      const lines = Number(options.lines) || 100;
      commandToRun = `pm2 logs ${sanitizedPm2Name} --lines ${lines} --nostream`;
      cwd = undefined;
      timeoutMs = 15000;
      break;
    }

    case 'status': {
      commandToRun = `pm2 describe ${sanitizedPm2Name}`;
      cwd = undefined;
      timeoutMs = 10000;
      break;
    }

    default:
      throw new Error(`Unsupported action: ${action}`);
  }

  const startTime = Date.now();

  return new Promise((resolve) => {
    const execOptions = {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for logs/build
    };
    if (cwd) {
      execOptions.cwd = cwd;
    }

    exec(commandToRun, execOptions, (error, stdout, stderr) => {
      const durationMs = Date.now() - startTime;
      const exitCode = error ? (error.code || 1) : 0;

      resolve({
        success: !error,
        action,
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          pm2Name: project.pm2Name,
          branch: project.branch
        },
        command: commandToRun,
        cwd: cwd || 'Global',
        exitCode,
        stdout: stdout ? stdout.toString() : '',
        stderr: stderr ? stderr.toString() : (error ? error.message : ''),
        durationMs,
        timestamp: new Date().toISOString()
      });
    });
  });
}
