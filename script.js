// ============================================
// DEPLOY TOOL - OTOMATIS
// Upload file → Deploy via API → Dapat URL
// Created by Ryzen
// ============================================

// Secret Key (HARUS SAMA dengan API_SECRET_KEY di backend)
const API_SECRET = 'default-secret-change-me';

let uploadedFiles = [];

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const previewFrame = document.getElementById('previewFrame');
const btnPreview = document.getElementById('btnPreview');
const btnUseCode = document.getElementById('btnUseCode');
const btnDeploy = document.getElementById('btnDeploy');
const progress = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const errorMsg = document.getElementById('errorMsg');
const result = document.getElementById('result');
const resultUrl = document.getElementById('resultUrl');
const statsContainer = document.getElementById('statsContainer');
const projectNameInput = document.getElementById('projectName');
const apiEndpointInput = document.getElementById('apiEndpoint');
const htmlEditor = document.getElementById('htmlEditor');
const cssEditor = document.getElementById('cssEditor');
const jsEditor = document.getElementById('jsEditor');

// Generate random project name
projectNameInput.value = 'deploy-' + Math.random().toString(36).substring(2, 10);

// Load saved API endpoint
try {
    const saved = localStorage.getItem('deploy_api_url');
    if (saved) apiEndpointInput.value = saved;
} catch (e) {}

apiEndpointInput.addEventListener('change', () => {
    try { localStorage.setItem('deploy_api_url', apiEndpointInput.value); } catch (e) {}
});

// ============================================
// Tabs
// ============================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

// ============================================
// Upload
// ============================================
uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { handleFiles(e.target.files); fileInput.value = ''; });
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });

async function handleFiles(files) {
    for (const file of files) {
        if (uploadedFiles.find(f => f.name === file.name && f.size === file.size)) continue;
        const content = await readFile(file);
        uploadedFiles.push({ name: file.name, content, size: file.size });
    }
    renderFileList();
}

function readFile(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsText(file);
    });
}

function removeFile(index) { uploadedFiles.splice(index, 1); renderFileList(); }

function renderFileList() {
    if (uploadedFiles.length === 0) {
        fileList.innerHTML = '<p style="color:#666;font-size:0.8em;text-align:center;">Belum ada file</p>';
        return;
    }
    const total = uploadedFiles.reduce((s, f) => s + (f.size || f.content.length), 0);
    fileList.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#888;font-size:0.75em;">
            <span>${uploadedFiles.length} file</span><span>Total: ${fmt(total)}</span>
        </div>
        ${uploadedFiles.map((f, i) => `
            <div class="file-item">
                <div class="file-info">
                    <span>${icon(f.name)}</span>
                    <span class="file-name" title="${f.name}">${f.name}</span>
                    <span class="file-size">${fmt(f.size || f.content.length)}</span>
                </div>
                <button class="remove" onclick="removeFile(${i})">✕</button>
            </div>
        `).join('')}
    `;
}

function icon(n) { const e=n.split('.').pop().toLowerCase(); return {html:'🌐',htm:'🌐',css:'🎨',js:'⚡',json:'📋',md:'📝',txt:'📄',svg:'🖼️',zip:'📦'}[e]||'📄'; }
function fmt(b) { if(!b)return'0 B'; if(b<1024)return b+' B'; if(b<1048576)return(b/1024).toFixed(1)+' KB'; return(b/1048576).toFixed(1)+' MB'; }

// ============================================
// Code Editor
// ============================================
btnUseCode.addEventListener('click', () => {
    const h = htmlEditor.value.trim(), c = cssEditor.value.trim(), j = jsEditor.value.trim();
    if (!h && !c && !j) { showToast('⚠️ Isi minimal satu editor!'); return; }
    uploadedFiles = [];
    if (h) uploadedFiles.push({ name: 'index.html', content: h, size: h.length });
    if (c) uploadedFiles.push({ name: 'style.css', content: c, size: c.length });
    if (j) uploadedFiles.push({ name: 'script.js', content: j, size: j.length });
    renderFileList(); updatePreview(); showToast('✅ Kode siap!');
});

// ============================================
// Preview
// ============================================
btnPreview.addEventListener('click', updatePreview);

function updatePreview() {
    const html = uploadedFiles.find(f => f.name.endsWith('.html') || f.name.endsWith('.htm'));
    const css = uploadedFiles.find(f => f.name.endsWith('.css'));
    const js = uploadedFiles.find(f => f.name.endsWith('.js'));
    if (html) {
        let h = html.content;
        if (css) h = h.replace('</head>', `<style>${css.content}</style></head>`);
        if (js) h = h.replace('</body>', `<script>${js.content}</script></body>`);
        previewFrame.srcdoc = h;
    } else if (uploadedFiles.length > 0) {
        previewFrame.srcdoc = `<pre style="padding:20px;font-family:monospace;background:#111;color:#0f0;">${esc(uploadedFiles[0].content)}</pre>`;
    } else {
        previewFrame.srcdoc = "<html><body style='display:flex;align-items:center;justify-content:center;height:100%;background:#f5f5f5;color:#999;font-family:sans-serif;'><p>👆 Masukkan kode dulu</p></body></html>";
    }
}

function esc(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ============================================
// DEPLOY OTOMATIS
// ============================================
btnDeploy.addEventListener('click', async () => {
    const apiUrl = apiEndpointInput.value.trim();
    if (!apiUrl) { showError('⚠️ Masukkan API Endpoint dulu!'); return; }
    if (uploadedFiles.length === 0) { showError('⚠️ Upload file atau tulis kode dulu!'); return; }

    let projectName = projectNameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 52);
    if (!projectName) { projectName = 'deploy-' + Date.now(); projectNameInput.value = projectName; }

    btnDeploy.disabled = true;
    progress.classList.add('show');
    result.classList.remove('show');
    errorMsg.classList.remove('show');
    progressFill.style.width = '0%';

    const steps = [
        { t: 'Mengupload file...', p: 20 },
        { t: 'Membuat project...', p: 40 },
        { t: 'Mendeploy...', p: 70 },
        { t: 'Menyiapkan domain...', p: 90 },
        { t: 'Selesai!', p: 100 },
    ];
    let si = 0;
    const iv = setInterval(() => {
        if (si < steps.length) { progressText.textContent = steps[si].t; progressFill.style.width = steps[si].p + '%'; si++; }
    }, 1500);

    try {
        const fd = new FormData();
        fd.append('projectName', projectName);
        uploadedFiles.forEach(f => fd.append('files', new Blob([f.content], { type: 'text/plain' }), f.name));

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'x-api-key': API_SECRET },
            body: fd,
        });

        const data = await res.json();
        clearInterval(iv);

        if (!res.ok || data.error) throw new Error(data.error || data.message || 'Deploy gagal');

        resultUrl.textContent = data.url;
        document.getElementById('btnOpen').href = data.url;
        statsContainer.innerHTML = `
            <div class="stat-item"><div class="stat-value">${data.files||uploadedFiles.length}</div><div class="stat-label">File</div></div>
            <div class="stat-item"><div class="stat-value">${fmt(data.totalSize||0)}</div><div class="stat-label">Ukuran</div></div>
            <div class="stat-item"><div class="stat-value">${data.projectName||projectName}</div><div class="stat-label">Project</div></div>
        `;
        result.classList.add('show');
        result.scrollIntoView({ behavior: 'smooth' });
        progressText.textContent = 'Selesai! ✅';
        progressFill.style.width = '100%';
        showToast('✅ Deploy berhasil!');
    } catch (err) {
        clearInterval(iv);
        showError('❌ ' + err.message);
    } finally {
        btnDeploy.disabled = false;
        setTimeout(() => { progress.classList.remove('show'); progressText.textContent = 'Mempersiapkan deploy...'; }, 2000);
    }
});

// ============================================
// Copy URL
// ============================================
document.getElementById('btnCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(resultUrl.textContent).then(() => {
        document.getElementById('btnCopy').textContent = '✅ Tersalin!';
        showToast('✅ URL disalin!');
        setTimeout(() => document.getElementById('btnCopy').textContent = '📋 Copy URL', 2000);
    });
});

// ============================================
// Helpers
// ============================================
function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.add('show'); result.classList.remove('show'); }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }

console.log('🚀 Deploy Tool OTOMATIS - Ready');
console.log('🔑 API Secret:', API_SECRET);
console.log('💡 Masukkan API Endpoint backend, upload file, klik Deploy!');
console.log('Created by Ryzen');