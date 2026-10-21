const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = __dirname;
const out = path.join(root, 'store-ready');
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const text = (x,y,s,size=24,color='#586477',weight=400) => `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(s)}</text>`;
const svg = (w,h,body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);
const lines = (x,y,arr,size=24,gap=34,color='#586477',weight=400) => arr.map((s,i)=>text(x,y+i*gap,s,size,color,weight)).join('');
const pill = (x,y,w,label) => `<rect x="${x}" y="${y}" width="${w}" height="34" rx="17" fill="#ecebff"/>${text(x+15,y+23,label,14,'#5545b8',600)}`;
async function screenshot(file,crop,w,h) {
  let p=sharp(path.join(root,file));
  if(crop)p=p.extract(crop);
  return p.resize({width:w,height:h,fit:'inside'}).png().toBuffer();
}
async function panel(buf,x,y) {
  const m=await sharp(buf).metadata();
  const frame=svg(m.width+32,m.height+32,`<defs><filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#423b76" flood-opacity="0.13"/></filter></defs><rect x="15" y="10" width="${m.width+2}" height="${m.height+2}" rx="12" fill="white" stroke="#e0e3ed" filter="url(#s)"/>`);
  return [{input:frame,left:x-16,top:y-11},{input:buf,left:x,top:y}];
}
async function page(name,body,panels) {
  const bg=await sharp(path.join(out,'background.png')).resize(1280,800,{fit:'cover'}).flatten({background:'#ffffff'}).toBuffer();
  const top=svg(1280,800,`${text(56,49,'BETTER SIDEBAR',15,'#6352c6',700)}${text(56,74,'WEB AGENT CONNECTOR',12,'#7e869a',600)}${body}${text(56,767,'Companion extension for Better Sidebar',13,'#778195')}`);
  await sharp(bg).composite([{input:top},...panels.flat()]).flatten({background:'#fff'}).removeAlpha().png().toFile(path.join(out,name));
}
async function main(){
  await fs.mkdir(out,{recursive:true});
  const popup=await screenshot('image.png',{left:604,top:80,width:700,height:536},584,470);
  await page('01-connector-1280x800.png',
    lines(56,216,['Your tabs.', 'Your control.'],56,65,'#16233b',700)+
    lines(58,379,['Connect Better Sidebar to the', 'web pages you choose.'],24,35)+
    pill(58,478,230,'Connected to Better Sidebar')+
    lines(58,568,['Pause or disconnect', 'from the toolbar popup.'],23,34),
    [await panel(popup,640,215)]);
  const controlled=await screenshot('controlled-tab-en.png',null,1160,603);
  await page('02-web-agent-1280x800.png',
    text(56,126,'Web Agent, beside your page.',40,'#16233b',700)+
    text(58,162,'Chrome shows when a tab is under control. Cancel from the debugging bar.',20),
    [await panel(controlled,60,188)]);
  const approval=await screenshot('image copy.png',{left:171,top:812,width:842,height:552},620,430);
  await page('03-approval-1280x800.png',
    lines(56,220,['Review.', 'Then run.'],56,65,'#16233b',700)+
    lines(58,385,['See the proposed action', 'before it happens.'],24,35)+
    pill(58,480,183,'Built for user approval')+
    lines(58,568,['Run it, reject it,', 'or add a note for the AI.'],23,34),
    [await panel(approval,603,257)]);
  const risk=await screenshot('image copy 2.png',null,484,575);
  await page('04-risk-notice-1280x800.png',
    lines(56,220,['Understand', 'the risks first.'],52,64,'#16233b',700)+
    lines(58,391,['Read what the agent can do', 'before you turn it on.'],24,35)+
    pill(58,484,187,'Informed before enabled')+
    lines(58,567,['Your accounts. Your decisions.', 'Know how to stop it.'],23,35),
    [await panel(risk,726,142)]);
  const tilebg=await sharp(path.join(out,'background.png')).resize(440,280,{fit:'cover'}).toBuffer();
  const icon=await sharp(path.join(root,'../public/icons/icon128.png')).resize(78,78).toBuffer();
  const tiletext=svg(440,280,`${text(28,37,'FOR BETTER SIDEBAR',12,'#6352c6',700)}${text(28,167,'Web Agent',34,'#16233b',700)}${text(28,208,'Connector',34,'#16233b',700)}${text(29,248,'Connect your tabs. Stay in control.',17,'#586477')}`);
  await sharp(tilebg).composite([{input:tiletext},{input:icon,left:325,top:53}]).flatten({background:'#fff'}).removeAlpha().png().toFile(path.join(out,'05-small-promo-440x280.png'));
  const names=(await fs.readdir(out)).filter(n=>/^0.*\.png$/.test(n));
  const checks=[];
  for(const n of names){const m=await sharp(path.join(out,n)).metadata(); const expected=n.startsWith('05')?[440,280]:[1280,800]; if(m.width!==expected[0]||m.height!==expected[1]||m.hasAlpha)throw Error('Invalid output '+n);checks.push({file:n,width:m.width,height:m.height,alpha:m.hasAlpha});}
  await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(checks,null,2)+'\n');
  const thumbs=await Promise.all(names.map(async(n,i)=>({input:await sharp(path.join(out,n)).resize(640,400,{fit:'contain',background:'#eef0f6'}).toBuffer(),left:(i%2)*640,top:Math.floor(i/2)*400})));
  await sharp({create:{width:1280,height:1200,channels:3,background:'#eef0f6'}}).composite(thumbs).png().toFile(path.join(root,'store-contact-sheet.png'));
  console.log(JSON.stringify(checks,null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
