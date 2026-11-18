let tabId=null;
let selectedFrameId=null;
let frameResults=[];
let currentPalette={flavor:'mocha',accent:'peach'};
const paletteNames={rosewater:'Eau de rose',flamingo:'Flamant',pink:'Rose',mauve:'Mauve',red:'Rouge',maroon:'Bordeaux',peach:'Pêche',yellow:'Jaune',green:'Vert',teal:'Sarcelle',sky:'Ciel',sapphire:'Saphir',blue:'Bleu',lavender:'Lavande'};
const palettes=globalThis.BG_PALETTES;
const $=s=>document.querySelector(s);
function chooseRemoteResult(results){
  const score=r=>{const s=r.result;if(!s)return -1;return (s.hasList?100:0)+(s.hasSidebar?50:0)+(s.switchMounted?30:0)+(s.listWrapped?20:0)+(s.phase==='running'?10:0)+(s.version?1:0);};
  return results.filter(r=>r.result).sort((a,b)=>score(b)-score(a))[0];
}
async function probe(){
  frameResults=await chrome.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',func:()=>{
    const hasList=!!document.querySelector('[data-testid="conversation-list-sidebar"]');
    const api=window.__bettergravityRemote;
    try{const st=api?.status?api.status():{phase:'not-injected',hasList,hasSidebar:false,frameOrigin:location.origin};st.hasAux=!!window.__agAuxiliaryChatLoaded;return st;}
    catch(e){return {phase:'failed',hasList,issues:[{where:'status',message:String(e.message)}]};}
  }});
  const chosen=chooseRemoteResult(frameResults);
  if(!chosen)throw new Error('Ouvre Antigravity Remote puis recharge la page.');
  selectedFrameId=chosen.frameId;
  return chosen.result;
}
async function command(action='status',value){
  let state=await probe();
  if(state.hasList && (!state.version || !state.hasAux)){
    const filesToInject = !state.version ? ['remote.js','auxiliary-chat.js'] : ['auxiliary-chat.js'];
    await chrome.scripting.executeScript({target:{tabId,frameIds:[selectedFrameId]},world:'MAIN',files:filesToInject});
    state=await probe();
  }
  if(action==='status')return state;
  const results=await chrome.scripting.executeScript({target:{tabId,frameIds:[selectedFrameId]},world:'MAIN',func:(action,value)=>{
    const api=window.__bettergravityRemote;
    return api&&typeof api[action]==='function'?api[action](value):null;
  },args:[action,value??null]});
  const result=results.find(r=>r.result)?.result;
  if(!result)throw new Error('Le module Remote ne répond pas. Recharge Antigravity.');
  return result;
}
function display(s){
  $('#status').textContent=s.phase==='disabled'?'Extension désactivée':s.phase==='failed'?'Intégration interrompue : voir le diagnostic':s.switchMounted?(s.listWrapped?'Chat / Work actif dans la barre latérale':'Switch présent · adaptation de la liste en attente'):s.hasList?'Interface Remote détectée · switch absent':'En attente de l’interface Remote';
  if(s.palette)currentPalette=s.palette;
  renderPalette();$('#native').checked=!!s.nativeList;
  $('#enable').textContent=s.enabled?'Désactiver et recharger':'Activer et recharger';$('#enable').dataset.enabled=String(s.enabled);
  $('#details').textContent=`Version : ${s.version||'module absent'}\nSélecteur Chat/Work : ${s.switchMounted?'oui':'non'}\nListe : ${s.listWrapped?'adaptée':'native'}\nDonnées de groupes : ${s.storeRecognized?'reconnues':'non reconnues'}${s.listCounts?'\nConversations récentes : '+s.listCounts.recentRows+' / '+s.listCounts.sourceRows+' lignes natives ; '+s.listCounts.outsideInStore+' conversations hors projet dans les données.':''}${s.issues?.length?'\n'+s.issues.map(i=>`${i.where}: ${i.message}`).join('\n'):''}\n\nCadres détectés :\n${frameResults.map(r=>`#${r.frameId} ${r.result?.frameOrigin||''} — ${r.result?.phase||'absent'} ; liste ${r.result?.hasList?'oui':'non'} ; switch ${r.result?.switchMounted?'oui':'non'}`).join('\n')}`;
}
async function run(action,value){try{display(await command(action,value));}catch(e){$('#status').textContent=e.message;}}
chrome.tabs.query({active:true,currentWindow:true}).then(async tabs=>{tabId=tabs[0]?.id;await run('status');}).catch(e=>$('#status').textContent=e.message);
function renderPalette(){
 const palette=palettes[currentPalette.flavor]||palettes.mocha;
 document.documentElement.style.colorScheme=palette.dark?'dark':'only light';
 $('#palette-flavor').value=currentPalette.flavor;
 $('#palette-current').textContent=palette.name+' · '+paletteNames[currentPalette.accent];
 $('#accent-name').textContent=paletteNames[currentPalette.accent];
 for(const [name,hex] of Object.entries(palette.colors))document.documentElement.style.setProperty('--ctp-'+name,hex);
 const grid=$('#accent-grid');
 for(const name of Object.keys(paletteNames)){
  let button=grid.querySelector('[data-accent="'+name+'"]');
  if(!button){button=document.createElement('button');button.type='button';button.dataset.accent=name;button.setAttribute('aria-label',paletteNames[name]);button.title=paletteNames[name];button.addEventListener('click',()=>run('setPalette',{...currentPalette,accent:name}));grid.append(button);}
  button.style.setProperty('--swatch',palette.colors[name]);button.setAttribute('aria-pressed',String(name===currentPalette.accent));
  button.textContent=name===currentPalette.accent?'✓':'';
 }
}
$('#palette-toggle').addEventListener('click',()=>{const panel=$('#palette-panel');panel.hidden=!panel.hidden;$('#palette-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
$('#palette-flavor').addEventListener('change',e=>run('setPalette',{...currentPalette,flavor:e.target.value}));
$('#palette-reset').addEventListener('click',()=>run('setPalette',{flavor:'mocha',accent:'peach'}));
renderPalette();
$('#native').addEventListener('change',e=>run('nativeList',e.target.checked));
$('#repair').addEventListener('click',()=>run('repair'));
$('#enable').addEventListener('click',async()=>{try{await command('setEnabled',$('#enable').dataset.enabled!=='true');await chrome.tabs.reload(tabId);window.close();}catch(e){$('#status').textContent=e.message;}});
