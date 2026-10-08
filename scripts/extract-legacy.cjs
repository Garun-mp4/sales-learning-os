const fs=require('fs'),vm=require('vm');
const data=fs.readFileSync('legacy-index.html','utf8');
const start=data.indexOf('const stages=['), end=data.indexOf('const KEY=',start);
if(start<0||end<0)throw Error('Could not locate v1 data');
const raw=data.slice(start,end);
const packed=vm.runInNewContext(raw+'\nJSON.stringify({stages,modules})');
fs.writeFileSync('src/generated/legacy.json',JSON.stringify(JSON.parse(packed),null,2));
console.log('V1 structure:',JSON.parse(packed).modules.length,'modules');
