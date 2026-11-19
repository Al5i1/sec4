(() => {
  'use strict';
  const API='https://sec4-sync-free.ali3mk84888.workers.dev/api/public-feed';
  const container=document.getElementById('sec4PublicCatalog');
  const status=document.getElementById('sec4PublicStatus');
  const items=document.getElementById('sec4PublicItems');
  if(!container||!status||!items)return;
  let loaded=false;
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=String(value||'');return el;};
  async function load(){
    if(loaded)return;loaded=true;
    try{
      const records=[];let offset=0;
      for(let i=0;i<30;i++){
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
        let data;
        try{
          const res=await fetch(API+'?offset='+offset,{signal:controller.signal});
          if(!res.ok)throw Error('HTTP '+res.status);
          data=await res.json();
        }finally{clearTimeout(timer);}
        if(!Array.isArray(data.records))throw Error('Invalid response');
        records.push(...data.records);
        if(data.next_offset==null)break;
        offset=data.next_offset;
      }
      items.replaceChildren();
      for(const r of records){
        const card=document.createElement('div');card.className='file-card';
        card.style.cssText='padding:12px;border:1px solid #8885;border-radius:10px;min-width:170px';
        card.append(text('strong',r.title||'بدون عنوان'));
        const meta=text('div',r.course||'');meta.style.cssText='font-size:12px;opacity:.8;margin-top:8px';card.append(meta);
        items.append(card);
      }
      status.textContent=records.length?'المواد المنشورة: '+records.length:'لا توجد مواد مصرح بنشرها حالياً';
    }catch(e){loaded=false;status.textContent='تعذر تحميل المواد المنشورة: '+e.message;}
  }
  const observer=new MutationObserver(()=>{
    const section=document.getElementById('view-blackboard');
    const visible=section&&getComputedStyle(section).display!=='none';
    container.style.display=visible?'block':'none';
    if(visible)load();
  });
  observer.observe(document.body,{attributes:true,subtree:true,attributeFilter:['style','class']});
  const section=document.getElementById('view-blackboard');
  if(section&&getComputedStyle(section).display!=='none'){container.style.display='block';load();}
})();
