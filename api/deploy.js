import { IncomingForm } from 'formidable';
import crypto from 'crypto';
import fs from 'fs';

// ============================================
// Environment Variables
// ============================================
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || '';
const API_SECRET_KEY = process.env.API_SECRET_KEY || 'default-secret-change-me';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // ==========================================
  // SECURITY: Redirect GET ke homepage
  // ==========================================
  if (req.method !== 'POST') {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  // ==========================================
  // CORS Headers
  // ==========================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==========================================
  // SECURITY: Cek Secret Key
  // ==========================================
  const clientKey = req.headers['x-api-key'];
  if (!clientKey || clientKey !== API_SECRET_KEY) {
    console.log('⛔ Unauthorized access attempt');
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or missing API key',
    });
  }

  // ==========================================
  // Cek Vercel Token
  // ==========================================
  if (!VERCEL_TOKEN || VERCEL_TOKEN === 'vercel_xxxxxxxxxxxxxxxxxxxx') {
    return res.status(500).json({
      error: 'VERCEL_TOKEN not configured.',
      message: 'Add VERCEL_TOKEN in Vercel Environment Variables',
    });
  }

  // ==========================================
  // Proses Upload File
  // ==========================================
  try {
    const form = new IncomingForm({
      uploadDir: '/tmp',
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024,
      maxTotalFileSize: 100 * 1024 * 1024,
      multiples: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          if (err.message.includes('maxFileSize') || err.message.includes('maxTotalFileSize')) {
            reject(new Error('File terlalu besar! Maksimal 100 MB.'));
          } else {
            reject(err);
          }
        } else {
          resolve([fields, files]);
        }
      });
    });

    const projectName = (fields.projectName || `deploy-${Date.now()}`)
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .substring(0, 52);

    let fileEntries = files.files;
    if (!fileEntries) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    if (!Array.isArray(fileEntries)) {
      fileEntries = [fileEntries];
    }

    const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

    // ==========================================
    // Step 1: Buat project di Vercel
    // ==========================================
    console.log(`📁 Creating project: ${projectName}`);

    const createRes = await fetch(`https://api.vercel.com/v9/projects${teamQuery}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: projectName, framework: null }),
    });

    const createData = await createRes.json();

    if (!createRes.ok && createData.error?.code !== 'project_already_exists') {
      return res.status(400).json({
        error: 'Failed to create project',
        detail: createData,
      });
    }

    console.log('✅ Project ready');

    // ==========================================
    // Step 2: Upload files dengan SHA digest
    // ==========================================
    const fileUploadList = [];

    for (const file of fileEntries) {
      if (!file) continue;

      const fileBuffer = fs.readFileSync(file.filepath);
      const fileName = file.originalFilename || 'index.html';
      const sha = crypto.createHash('sha1').update(fileBuffer).digest('hex');

      console.log(`📤 Uploading: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

      // Dapatkan upload URL dari Vercel
      const fileRes = await fetch(`https://api.vercel.com/v2/now/files${teamQuery}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: fileName,
          sha: sha,
          size: fileBuffer.length,
        }),
      });

      const fileData = await fileRes.json();

      if (fileData.error) {
        throw new Error(`Gagal dapat upload URL: ${JSON.stringify(fileData.error)}`);
      }

      // Upload konten file
      const uploadRes = await fetch(fileData.url, {
        method: 'PUT',
        body: fileBuffer,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileBuffer.length.toString(),
        },
      });

      if (!uploadRes.ok) {
        throw new Error(`Gagal upload ${fileName}: ${uploadRes.status}`);
      }

      fileUploadList.push({
        file: fileName,
        sha: sha,
        size: fileBuffer.length,
      });

      console.log(`✅ Uploaded: ${fileName}`);
    }

    if (fileUploadList.length === 0) {
      return res.status(400).json({ error: 'No valid files to deploy' });
    }

    // ==========================================
    // Step 3: Buat deployment
    // ==========================================
    console.log('🚀 Creating deployment...');

    const deployRes = await fetch(`https://api.vercel.com/v13/deployments${teamQuery}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        project: projectName,
        target: 'production',
        files: fileUploadList,
        projectSettings: { framework: null },
      }),
    });

    const deployData = await deployRes.json();

    if (deployData.error) {
      return res.status(400).json({
        error: 'Deployment failed',
        detail: deployData.error,
      });
    }

    let deploymentUrl = `https://${deployData.url}`;

    // ==========================================
    // Step 4: Alias domain
    // ==========================================
    try {
      await fetch(`https://api.vercel.com/v2/deployments/${deployData.id}/aliases${teamQuery}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ alias: `${projectName}.vercel.app` }),
      });
      deploymentUrl = `https://${projectName}.vercel.app`;
      console.log('🔗 Alias:', deploymentUrl);
    } catch (e) {
      console.log('⚠️ Alias skipped, using default URL');
    }

    // ==========================================
    // Bersihkan file temp
    // ==========================================
    for (const file of fileEntries) {
      if (file && file.filepath) {
        try { fs.unlinkSync(file.filepath); } catch (e) {}
      }
    }

    console.log('🎉 Deploy sukses:', deploymentUrl);

    return res.status(200).json({
      success: true,
      url: deploymentUrl,
      deploymentId: deployData.id,
      projectName: projectName,
      files: fileUploadList.length,
      totalSize: fileUploadList.reduce((sum, f) => sum + f.size, 0),
    });

  } catch (error) {
    console.error('❌ Deploy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
      }
