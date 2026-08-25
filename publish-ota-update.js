const fs=require('fs');
const path=require('path');
const http=require('http');

function fail(message){console.error('\nERROR: '+message+'\n');process.exit(1)}
function getJSON(url){return new Promise((resolve,reject)=>{http.get(url,res=>{let data='';res.setEncoding('utf8');res.on('data',c=>data+=c);res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new Error(`Server Manager returned HTTP ${res.statusCode}`));try{resolve(JSON.parse(data))}catch(e){reject(e)}})}).on('error',reject)})}
function copyDir(src,dst){fs.mkdirSync(dst,{recursive:true});for(const ent of fs.readdirSync(src,{withFileTypes:true})){const a=path.join(src,ent.name),b=path.join(dst,ent.name);if(ent.isDirectory())copyDir(a,b);else fs.copyFileSync(a,b)}}
(async()=>{
  const root=process.cwd();
  const appPath=path.join(root,'app.json');
  const exportDir=path.join(root,'ota-dist');
  if(!fs.existsSync(appPath))fail('app.json was not found. Run this script from the app project root.');
  if(!fs.existsSync(path.join(exportDir,'metadata.json')))fail('ota-dist\\metadata.json was not found. Run the Expo export step first.');
  const cfg=JSON.parse(fs.readFileSync(appPath,'utf8'));
  const expo=cfg.expo||{};
  const runtime=typeof expo.runtimeVersion==='string'?expo.runtimeVersion:'';
  if(!runtime)fail('app.json does not contain a fixed expo.runtimeVersion.');
  let state;
  try{state=await getJSON('http://127.0.0.1:8090/local/state')}catch(e){fail('The US AutoDarts League Server Manager is not running on this PC. Start the server first, then run this publisher again. '+e.message)}
  const dataPath=String(state&&state.data_path||'');
  if(!dataPath)fail('The Server Manager did not report its data path.');
  const release=String(Date.now());
  const dest=path.join(path.dirname(dataPath),'AppUpdates',runtime,release);
  copyDir(exportDir,dest);
  fs.writeFileSync(path.join(dest,'expoConfig.json'),JSON.stringify(expo,null,2)+'\n');
  console.log('\nOTA update published successfully.');
  console.log('Runtime: '+runtime);
  console.log('Release: '+release);
  console.log('Server folder: '+dest);
  console.log('\nPlayers on the matching APK runtime will receive this update on app launch, or by tapping Settings > Updates > Check for Update.\n');
})().catch(e=>fail(e&&e.message?e.message:String(e)));
