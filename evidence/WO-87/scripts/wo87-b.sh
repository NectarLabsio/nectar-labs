#!/usr/bin/env bash
# WO-87 A items 2-4: hydrated Chrome probe, then Lighthouse a11y SITE /, APP /borrow, DOCS / (+ ?docusaurus-theme=light) both themes.
B=/tmp/verify-wo87-20261113T170125Z
R=$B/repo
L=$B/logs; mkdir -p $L/probe
cd $R/apps/web
{ echo "# $(date -u +%FT%TZ) (apps/web) node wo87-probe.mjs"; node wo87-probe.mjs $L/probe; echo "exit=$?"; } > $L/probe/probe.log 2>&1
lh() { # label base routes
  rm -rf $R/evidence/G3/lighthouse
  { echo "# $(date -u +%FT%TZ) (apps/web) LH_BASE_URL=$2 LH_ROUTES=$3 node scripts/lighthouse.mjs"; LH_BASE_URL=$2 LH_ROUTES=$3 node scripts/lighthouse.mjs; echo "exit=$?"; } > $L/lighthouse-$1.log 2>&1
  mkdir -p $L/lh-$1; cp $R/evidence/G3/lighthouse/*.json $L/lh-$1/ 2>/dev/null
}
lh site https://nectarlabs.io /
lh app https://testnet.nectarlabs.io /borrow
lh docs https://docs.nectarlabs.io "/,/?docusaurus-theme=light"
rm -rf $R/evidence/G3/lighthouse
# summary: score, failing a11y audits, final-screenshot mean brightness (dark ~35, light ~235)
node -e '
const fs=require("fs"),cp=require("child_process"),path=require("path");
const L=process.argv[1];
for (const lab of ["site","app","docs"]) for (const f of fs.readdirSync(`${L}/lh-${lab}`).filter(f=>f.endsWith(".json"))) {
  const j=JSON.parse(fs.readFileSync(`${L}/lh-${lab}/${f}`,"utf8"));
  const fails=Object.values(j.audits).filter(a=>a.scoreDisplayMode==="binary"&&a.score===0).map(a=>a.id);
  let bright="n/a";
  const d=j.audits["final-screenshot"]?.details?.data;
  if (d) { const jpg=`${L}/lh-${lab}/${f}.jpg`, bmp=jpg+".bmp"; fs.writeFileSync(jpg, Buffer.from(d.split(",")[1],"base64"));
    cp.execFileSync("sips",["-s","format","bmp",jpg,"--out",bmp],{stdio:"ignore"});
    const b=fs.readFileSync(bmp), off=b.readUInt32LE(10), w=b.readInt32LE(18), h=Math.abs(b.readInt32LE(22)), bpp=b.readUInt16LE(28)/8, row=Math.ceil(w*bpp/4)*4;
    let s=0,n=0; for(let y=0;y<h;y+=2) for(let x=0;x<w;x+=2){const i=off+y*row+x*bpp; s+=(b[i]+b[i+1]+b[i+2])/3; n++;}
    bright=Math.round(s/n); fs.unlinkSync(jpg); fs.unlinkSync(bmp); }
  console.log(`${lab.padEnd(4)} ${j.finalDisplayedUrl.padEnd(52)} ${f.padEnd(36)} a11y ${Math.round(j.categories.accessibility.score*100)} failing-binary [${fails.join(",")}] screenshot-brightness ${bright} at ${j.fetchTime}`);
}' $L > $L/lighthouse-summary.txt 2>&1
cat $L/probe/probe.log; for f in site app docs; do /usr/bin/grep -E '^\||exit=|FAIL' $L/lighthouse-$f.log; done; cat $L/lighthouse-summary.txt
echo "B DONE"
