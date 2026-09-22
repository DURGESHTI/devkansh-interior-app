const crypto = require('crypto');
const COOKIE = 'dv_video_session';
const TTL = 30 * 24 * 60 * 60;
function secret(){const s=process.env.SESSION_SECRET || process.env.PUBLIC_FILE_SECRET;if(!s) throw new Error('SESSION_SECRET or PUBLIC_FILE_SECRET is not configured.');return s;}
function sign(payload){return crypto.createHmac('sha256',secret()).update(payload).digest('base64url');}
function createVideoSession(userId){const p=Buffer.from(JSON.stringify({id:userId,exp:Math.floor(Date.now()/1000)+TTL})).toString('base64url');return `${p}.${sign(p)}`;}
function verifyVideoSession(token){try{if(!token)return null;const [p,s]=String(token).split('.');if(!p||!s)return null;const expected=sign(p);if(!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return null;const d=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));return d?.exp>Math.floor(Date.now()/1000)?d.id:null;}catch(_){return null;}}
function cookies(req){const raw=req.headers?.cookie||'';return Object.fromEntries(raw.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<0?[x,'']:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));}
function getVideoUserId(req){return verifyVideoSession(cookies(req)[COOKIE]);}
function setVideoSession(res,userId){res.setHeader('Set-Cookie',`${COOKIE}=${encodeURIComponent(createVideoSession(userId))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`);}
function clearVideoSession(res){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);}
function requireVideoUser(req,res){const id=getVideoUserId(req);if(!id){res.status(401).json({error:'Video login required.'});return null;}return id;}
module.exports={getVideoUserId,setVideoSession,clearVideoSession,requireVideoUser};
