/**
 * Devkansh Interiors - Google Drive bridge
 *
 * Deploy: Deploy > New deployment > Web app
 * Execute as: Me
 * Who has access: Anyone with the link (or your chosen access policy)
 *
 * The app keeps a local copy for offline/local use. This bridge stores
 * uploaded media in Google Drive and the database snapshot in a JSON file.
 */
const ROOT_NAME = 'Devkansh Interiors App Data';
const SUBFOLDERS = ['Database','Reference Design','Videos','Project Gallery','Daily Updates','Vendors','Documents','Showcase','Backups'];
const INDEX_FILE = '_media_index.json';
const DB_FILE = 'devkansh_database_latest.json';

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function getRoot_(){
  const it=DriveApp.getFoldersByName(ROOT_NAME);
  return it.hasNext()?it.next():DriveApp.createFolder(ROOT_NAME);
}
function getFolder_(name){
  const root=getRoot_();
  const it=root.getFoldersByName(name);
  return it.hasNext()?it.next():root.createFolder(name);
}
function getIndex_(){
  const folder=getFolder_('Database');
  const it=folder.getFilesByName(INDEX_FILE);
  if(!it.hasNext()) return {};
  try{return JSON.parse(it.next().getBlob().getDataAsString()||'{}')}catch(e){return {}}
}
function saveIndex_(index){
  const folder=getFolder_('Database');
  const it=folder.getFilesByName(INDEX_FILE);
  if(it.hasNext()) it.next().setContent(JSON.stringify(index));
  else folder.createFile(INDEX_FILE,JSON.stringify(index),'application/json');
}
function publicUrl_(id,mime){
  return 'https://drive.google.com/uc?export=download&id='+encodeURIComponent(id);
}
function doGet(e){
  const action=(e.parameter||{}).action||'ping';
  if(action==='ping') return json_({ok:true,service:'Devkansh Google Drive Bridge',time:new Date().toISOString()});
  if(action==='loadDatabase'){
    const folder=getFolder_('Database'); const it=folder.getFilesByName(DB_FILE);
    if(!it.hasNext()) return json_({ok:true,found:false});
    const f=it.next(); return json_({ok:true,found:true,data:JSON.parse(f.getBlob().getDataAsString()||'{}'),updatedAt:f.getLastUpdated().toISOString()});
  }
  return json_({ok:false,error:'Unknown action'});
}
function doPost(e){
  try{
    const body=JSON.parse(e.postData.contents||'{}');
    if(body.action==='ping') return json_({ok:true,service:'Devkansh Google Drive Bridge'});
    if(body.action==='uploadFile'){
      const b64=String(body.base64||'');
      const comma=b64.indexOf(',');
      const raw=comma>=0?b64.slice(comma+1):b64;
      if(!raw) throw new Error('Missing base64 data');
      const bytes=Utilities.base64Decode(raw);
      const blob=Utilities.newBlob(bytes,body.mimeType||'application/octet-stream',body.fileName||('file_'+Date.now()));
      const folder=getFolder_(body.folder||'Showcase');
      const index=getIndex_();
      const hash=String(body.hash||'');
      if(hash && index[hash]) return json_({ok:true,reused:true,fileId:index[hash].fileId,url:index[hash].url});
      const file=folder.createFile(blob);
      try{file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW)}catch(_e){}
      const result={fileId:file.getId(),url:publicUrl_(file.getId(),blob.getContentType()),name:file.getName(),mimeType:blob.getContentType()};
      if(hash){index[hash]=result;saveIndex_(index)}
      return json_({ok:true,...result});
    }
    if(body.action==='saveDatabase'){
      const folder=getFolder_('Database');
      const content=JSON.stringify(body.data||{});
      const it=folder.getFilesByName(DB_FILE);
      if(it.hasNext()) it.next().setContent(content); else folder.createFile(DB_FILE,content,'application/json');
      const backup=getFolder_('Backups').createFile('devkansh_backup_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'Asia/Kolkata','yyyyMMdd_HHmmss')+'.json',content,'application/json');
      return json_({ok:true,fileId:backup.getId(),size:content.length});
    }
    return json_({ok:false,error:'Unknown action'});
  }catch(err){return json_({ok:false,error:String(err&&err.message||err)});}
}
