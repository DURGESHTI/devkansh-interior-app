const crypto = require('crypto');
const { getDrive, getVaultFolderId, findDataFile } = require('./_google');
function publicSecret(){const s=process.env.PUBLIC_FILE_SECRET||process.env.SESSION_SECRET;if(!s)throw new Error('PUBLIC_FILE_SECRET or SESSION_SECRET is not configured.');return s;}
function signedUrl(id){const exp=Math.floor(Date.now()/1000)+24*60*60;const sig=crypto.createHmac('sha256',publicSecret()).update(`${id}.${exp}`).digest('base64url');return `/api/files?id=${encodeURIComponent(id)}&exp=${exp}&sig=${sig}`;}
function clean(value){
  if(Array.isArray(value)) return value.map(clean);
  if(value && typeof value==='object'){
    if(value.remoteFileId){const out={...value};delete out.data;out.url=signedUrl(value.remoteFileId);return out;}
    const out={}; for(const [k,v] of Object.entries(value)){if(k==='clientPassword'||k==='password')continue;if(k==='data'&&typeof v==='string'&&v.startsWith('data:'))continue;out[k]=clean(v);} return out;
  }
  return value;
}
module.exports=async(req,res)=>{try{if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});const drive=getDrive();const folderId=await getVaultFolderId(drive);const existing=await findDataFile(drive,folderId);if(!existing)return res.status(200).json({clients:[]});const r=await drive.files.get({fileId:existing.id,alt:'media'},{responseType:'json'});const clients=Array.isArray(r.data?.clients)?r.data.clients.map(c=>{const o=clean(c);if(o&&typeof o==='object')delete o.userId;return o;}):[];const referenceDesigns=Array.isArray(r.data?.referenceDesigns)?r.data.referenceDesigns.map(clean):[];
const videoUsers=Array.isArray(r.data?.videoUsers)?r.data.videoUsers.map(clean):[];
const videoPosts=Array.isArray(r.data?.videoPosts)?r.data.videoPosts.map(clean):[];
const videos=Array.isArray(r.data?.videos)?r.data.videos.map(clean):[];
return res.status(200).json({clients,referenceDesigns,videoUsers,videoPosts,videos});}catch(err){console.error(err);return res.status(500).json({error:err.message||'Public data unavailable.'});}};