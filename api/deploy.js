import { IncomingForm } from 'formidable';
import fs from 'fs';

const DEPLOY_HOOK = process.env.DEPLOY_HOOK;
const API_SECRET_KEY = process.env.API_SECRET_KEY || 'default-secret-change-me';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // Redirect GET ke homepage
  if (req.method !== 'POST') {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cek Secret Key
  const clientKey = req.headers['x-api-key'];
  if (!clientKey || clientKey !== API_SECRET_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Cek Deploy Hook
  if (!DEPLOY_HOOK) {
    return res.status(500).json({ error: 'DEPLOY_HOOK not configured' });
  }

  try {
    const form = new IncomingForm({
      uploadDir: '/tmp',
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024,
      multiples: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const projectName = (fields.projectName || `deploy-${Date.now()}`)
      .toString().toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 52);

    let fileEntries = files.files;
    if (!fileEntries) return res.status(400).json({ error: 'No files uploaded' });
    if (!Array.isArray(fileEntries)) fileEntries = [fileEntries];

    const fileList = [];
    for (const file of fileEntries) {
      if (!file) continue;
      const content = fs.readFileSync(file.filepath, 'utf-8');
      fileList.push({ name: file.originalFilename, size: content.length });
      fs.unlinkSync(file.filepath);
    }

    // Trigger Deploy Hook
    const hookRes = await fetch(DEPLOY_HOOK, { method: 'POST' });
    const hookData = await hookRes.json();

    return res.status(200).json({
      success: true,
      message: 'Deploy triggered!',
      projectName: projectName,
      files: fileList,
      deployUrl: `https://${projectName}.vercel.app`,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
