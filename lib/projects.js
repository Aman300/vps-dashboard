import fs from 'fs';
import path from 'path';

function getProjectsFilePath() {
  if (process.env.PROJECTS_FILE_PATH) {
    return path.resolve(process.env.PROJECTS_FILE_PATH);
  }
  return path.join(process.cwd(), 'projects.json');
}

export function getProjects() {
  const filePath = getProjectsFilePath();
  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const defaultProjects = [
        {
          id: 'plyzoo',
          name: 'plyzoo',
          path: '/home/plyzoo.com',
          branch: 'main',
          pm2Name: 'plyzoo',
          buildCommand: 'npm run build'
        }
      ];
      fs.writeFileSync(/*turbopackIgnore: true*/ filePath, JSON.stringify(defaultProjects, null, 2), 'utf-8');
      return defaultProjects;
    }
    const data = fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading projects.json:', err);
    return [];
  }
}

export function saveProjects(projects) {
  const filePath = getProjectsFilePath();
  fs.writeFileSync(/*turbopackIgnore: true*/ filePath, JSON.stringify(projects, null, 2), 'utf-8');
  return projects;
}

export function findProjectById(id) {
  const projects = getProjects();
  return projects.find((p) => p.id === id || p.name === id);
}
