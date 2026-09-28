export function searchAssets(query,capabilities,catalog){
 const text=String(query).toLowerCase().trim();if(!text)return catalog.slice(0,3).map(a=>match(a,0,false));
 function match(a,score,approximate){const available=new Set([...(capabilities.bones||[]),...(Array.isArray(capabilities.expressions)?capabilities.expressions:Object.keys(capabilities.expressions||{})),...(capabilities.contacts||[])]);return{assetId:a.id,score,approximate,missing:[...(a.requires||[]),...(a.contacts||[])].filter(n=>!available.has(n))};}
 const scored=catalog.map(a=>{const tags=[a.name,...a.tags||[]].map(s=>s.toLowerCase());const exact=tags.some(t=>text===t||text.includes(t));const partial=tags.reduce((s,t)=>s+Array.from(new Set(text)).filter(c=>t.includes(c)).length,0);return match(a,exact?100+partial:partial,!exact);});
 return scored.sort((a,b)=>b.score-a.score).slice(0,3);
}
