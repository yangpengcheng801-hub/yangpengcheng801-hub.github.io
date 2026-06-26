const $ = (s) => document.querySelector(s);
let selectedFile = null;
let currentDocId = null;

fetch('/api/health').then(r=>r.json()).then(h=>{
  $('#systemStatus').innerHTML=h.llm_enabled?`<i></i> 百炼增强 · ${escapeHtml(h.model)}`:'<i></i> 本地智能体 · 离线可用';
}).catch(()=>{$('#systemStatus').innerHTML='<i></i> 本地智能体'});

const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
['dragenter','dragover'].forEach(e => dropzone.addEventListener(e, ev => {ev.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(e => dropzone.addEventListener(e, ev => {ev.preventDefault();dropzone.classList.remove('drag')}));
dropzone.addEventListener('drop', ev => setFile(ev.dataTransfer.files[0]));

function setFile(file){
  if(!file) return;
  selectedFile = file;
  $('#fileName').textContent = `已选择：${file.name} · ${(file.size/1024).toFixed(1)} KB`;
  $('#paperText').value = '';
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file)});
}

async function api(path, payload){
  const res = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await res.json();
  if(!res.ok || !data.ok) throw new Error(data.error || '请求失败');
  return data;
}

$('#sampleBtn').addEventListener('click', async ()=>{
  try{const d=await fetch('/api/sample').then(r=>r.json());selectedFile=null;$('#paperText').value=d.text;$('#fileName').textContent='已加载：示例论文';$('#error').textContent='';}
  catch(e){showError(e.message)}
});

$('#analyzeBtn').addEventListener('click', async ()=>{
  const text=$('#paperText').value.trim();
  if(!selectedFile && text.length<80){showError('请上传论文或粘贴至少 80 个字符的正文。');return}
  setView('loading'); showError('');
  try{
    const payload=selectedFile?{filename:selectedFile.name,content_base64:await fileToBase64(selectedFile)}:{filename:'粘贴的论文.txt',text};
    const data=await api('/api/analyze',payload);render(data.analysis);setView('results');
  }catch(e){showError(e.message);setView('empty')}
});

function setView(view){
  $('#emptyState').classList.toggle('hidden',view!=='empty');
  $('#loading').classList.toggle('hidden',view!=='loading');
  $('#results').classList.toggle('hidden',view!=='results');
}
function showError(msg){$('#error').textContent=msg}
function fillList(id,items){$(id).innerHTML=(items||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function render(a){
  currentDocId=a.doc_id;$('#title').textContent=a.title;$('#oneLiner').textContent=a.one_liner;
  const s=a.statistics;$('#stats').innerHTML=`<span><b>${s.characters.toLocaleString()}</b> 字符</span><span><b>${s.paragraphs}</b> 段落</span><span><b>${s.sections}</b> 章节</span><span>约 <b>${s.estimated_reading_minutes}</b> 分钟原文阅读</span>`;
  fillList('#summary',a.summary);fillList('#contributions',a.contributions);fillList('#methods',a.methods);fillList('#paperResults',a.results);
  $('#keywords').innerHTML=a.keywords.map(k=>`<span>${escapeHtml(k)}</span>`).join('');
  $('#sections').innerHTML=a.sections.map(x=>`<div class="section-chip" title="${escapeHtml(x.preview)}"><b>${escapeHtml(x.heading)}</b><small>${escapeHtml(x.type)}</small></div>`).join('');
  const review=a.review||{};fillList('#strengths',review.strengths);fillList('#limitations',review.limitations);fillList('#followups',review.questions);
  renderConceptMap(a.concept_map||{nodes:[],edges:[]});
  $('#agentTrace').innerHTML=(a.agent_trace||[]).map((x,i)=>`<div class="trace-step"><span>${String(i+1).padStart(2,'0')}</span><b>${escapeHtml(x.agent||'Agent')}</b><small>${escapeHtml(x.task||x.status||'完成')}</small></div>`).join('');
  $('#answer').classList.add('hidden');
}

function renderConceptMap(map){
  const svg=$('#conceptMap'),nodes=(map.nodes||[]).slice(0,10),edges=map.edges||[];
  if(!nodes.length){svg.innerHTML='<text x="20" y="40">暂无足够概念</text>';return}
  const cx=320,cy=150,rx=235,ry=105,pos={};
  nodes.forEach((n,i)=>{const a=Math.PI*2*i/nodes.length-Math.PI/2;pos[n.id||n.label]={x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry}});
  const lines=edges.map(e=>{const s=pos[e.source],t=pos[e.target];return s&&t?`<line class="map-edge" x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}"/>`:''}).join('');
  const dots=nodes.map((n,i)=>{const p=pos[n.id||n.label],label=escapeHtml(n.label||n.id);return `<g><circle class="map-node ${i===0?'core':''}" cx="${p.x}" cy="${p.y}" r="${i===0?34:26}"/><text class="map-label" x="${p.x}" y="${p.y+4}" text-anchor="middle">${label.slice(0,10)}</text></g>`}).join('');
  svg.innerHTML=lines+dots;
}

$('#askBtn').addEventListener('click', async ()=>{
  const question=$('#question').value.trim();if(!question)return;
  const button=$('#askBtn');button.disabled=true;button.textContent='检索中';
  try{const d=await api('/api/ask',{doc_id:currentDocId,question});const ev=d.result.evidence.map(x=>`P${x.paragraph_id} · 相关度 ${x.score}`).join('　');const mode=d.result.mode==='bailian'?'百炼增强回答':'本地证据回答';$('#answer').innerHTML=`<b>${mode}</b><br>${escapeHtml(d.result.answer)}<div class="evidence">证据：${ev}</div>`;$('#answer').classList.remove('hidden')}
  catch(e){showError(e.message)}finally{button.disabled=false;button.textContent='提问'}
});

$('#question').addEventListener('keydown',e=>{if(e.key==='Enter')$('#askBtn').click()});
$('#exportBtn').addEventListener('click',async()=>{
  try{const d=await api('/api/export',{doc_id:currentDocId});const blob=new Blob([d.markdown],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=d.filename;a.click();URL.revokeObjectURL(url)}catch(e){showError(e.message)}
});
