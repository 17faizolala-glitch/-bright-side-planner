import { useState, useEffect, useCallback, useRef } from "react";

const API = "https://api.anthropic.com/v1/messages";
const API_KEY = import.meta.env.VITE_API_KEY;

const TABS = ["Today","Tasks","Checklist","Notes"];
const DAYS = ["S","M","T","W","T","F","S"];

const CATS = {
  billing:    { label:"🧾 Billing",     color:"#c94f7c", bg:"#fce8f0" },
  evv:        { label:"📍 EVV",         color:"#a0569a", bg:"#f5e8ff" },
  clients:    { label:"👤 Clients",     color:"#d4688f", bg:"#fde8f5" },
  staff:      { label:"👥 Staff",       color:"#b05480", bg:"#f8e8f3" },
  compliance: { label:"📋 Compliance",  color:"#7a5aaa", bg:"#efe8ff" },
  admin:      { label:"🗂 Admin",       color:"#c06090", bg:"#fff0f6" },
};

const SHORTCUTS = [
  {label:"Check EVV 📍",         cat:"evv"},
  {label:"Review claims 🧾",     cat:"billing"},
  {label:"Client update 👤",     cat:"clients"},
  {label:"Staff schedule 👥",    cat:"staff"},
  {label:"Compliance task 📋",   cat:"compliance"},
  {label:"Admin task 🗂",        cat:"admin"},
];

const DEFAULT_CHECKLIST = [
  {id:"c1",label:"Check EVV system & review alerts 📍",        cat:"evv",        done:false},
  {id:"c2",label:"Review pending claims & billing queue 🧾",   cat:"billing",    done:false},
  {id:"c3",label:"Check service authorization dates 📋",       cat:"compliance", done:false},
  {id:"c4",label:"Confirm caregiver schedules for today 👥",   cat:"staff",      done:false},
  {id:"c5",label:"Document client updates or incidents 👤",    cat:"clients",    done:false},
  {id:"c6",label:"Process timesheets / payroll items 🗂",      cat:"admin",      done:false},
  {id:"c7",label:"Follow up on open compliance items 📋",      cat:"compliance", done:false},
];

const QUOTES = [
  "Bismillah — let's make today count at Bright Side 💕",
  "Your clients count on you. You've got this 🌸",
  "One task at a time, you're doing amazing ✨",
  "Lead with grace, manage with precision 💫",
  "Bright Side shines because of the work you do 🌷",
];

function todayStr(){ return new Date().toISOString().split("T")[0]; }
function tomorrowStr(){ const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; }
function fmt(ds){
  if(!ds) return "";
  if(ds===todayStr()) return "Today";
  if(ds===tomorrowStr()) return "Tomorrow";
  const [,m,d]=ds.split("-");
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]+" "+d;
}

// ── localStorage helpers ──────────────────────────────────
function lsGet(key, fallback){
  try{ const v=localStorage.getItem(key); return v?JSON.parse(v):fallback; }catch{ return fallback; }
}
function lsGetStr(key){ try{ return localStorage.getItem(key)||""; }catch{ return ""; } }
function lsSet(key, val, isStr=false){
  try{ localStorage.setItem(key, isStr?val:JSON.stringify(val)); }catch{}
}

export default function App(){
  const [tab,setTab]         = useState("Today");
  const [tasks,setTasks]     = useState([]);
  const [checklist,setChecklist] = useState(DEFAULT_CHECKLIST);
  const [notes,setNotes]     = useState("");
  const [loaded,setLoaded]   = useState(false);
  const [brainstorm,setBrainstorm] = useState({});
  const [expanded,setExpanded]     = useState(null);
  const [input,setInput]     = useState("");
  const [processing,setProcessing] = useState(false);
  const [listening,setListening]   = useState(false);
  const [chat,setChat]       = useState([]);
  const [showChat,setShowChat]     = useState(false);
  const [toast,setToast]     = useState(null);
  const [filterCat,setFilterCat]   = useState("all");
  const [newTask,setNewTask] = useState({title:"",date:todayStr(),note:"",category:"billing"});
  const [quote]              = useState(QUOTES[Math.floor(Math.random()*QUOTES.length)]);
  const chatEndRef           = useRef(null);

  // ── Load from localStorage ────────────────────────────────
  useEffect(()=>{
    setTasks(lsGet("bs_tasks",[]));
    setChecklist(lsGet("bs_check_"+todayStr(), DEFAULT_CHECKLIST));
    setNotes(lsGetStr("bs_notes_"+todayStr()));
    setChat(lsGet("bs_chat",[]));
    setLoaded(true);
  },[]);

  // ── Save to localStorage ──────────────────────────────────
  useEffect(()=>{ if(loaded) lsSet("bs_tasks", tasks); },[tasks,loaded]);
  useEffect(()=>{ if(loaded) lsSet("bs_check_"+todayStr(), checklist); },[checklist,loaded]);
  useEffect(()=>{ if(loaded) lsSet("bs_notes_"+todayStr(), notes, true); },[notes,loaded]);
  useEffect(()=>{ if(loaded&&chat.length) lsSet("bs_chat", chat.slice(-30)); },[chat,loaded]);
  useEffect(()=>{ if(showChat&&chatEndRef.current) chatEndRef.current.scrollIntoView({behavior:"smooth"}); },[chat,showChat]);

  const showToast=(m)=>{ setToast(m); setTimeout(()=>setToast(null),4500); };

  // ── AI Assistant ──────────────────────────────────────────
  const sendMsg=useCallback(async(text)=>{
    if(!text.trim()||processing) return;
    const msg=text.trim();
    setInput("");
    setChat(p=>[...p,{role:"user",text:msg}]);
    setShowChat(true);
    setProcessing(true);
    try{
      const res=await fetch(API,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-api-key": API_KEY,
          "anthropic-version":"2023-06-01",
          "anthropic-dangerous-direct-browser-access":"true"
        },
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:600,
          system:`You are Faizo's work AI assistant. She works at Bright Side Home Support, a home care company. She is experienced in home care operations, billing, EVV compliance, client and staff management, and care coordination. Today: ${todayStr()}, tomorrow: ${tomorrowStr()}.
Current tasks: ${JSON.stringify(tasks.map(t=>({title:t.title,date:t.date,cat:t.category,done:t.completed})))}
Reply ONLY with valid JSON, no markdown:
{"action":"add_task"|"complete_task"|"chat","message":"warm short work reply, occasional 💕 or 🌸","task":{"title":"string","date":"YYYY-MM-DD","note":"string","category":"billing"|"evv"|"clients"|"staff"|"compliance"|"admin"}|null,"completeTitle":"string"|null}
Infer the best category from context. Be warm but professional.`,
          messages:[{role:"user",content:msg}]
        })
      });
      const data=await res.json();
      const raw=data?.content?.find(b=>b.type==="text")?.text||"{}";
      let json={};
      try{ json=JSON.parse(raw.replace(/```json|```/g,"").trim()); }catch{}
      if(json.action==="add_task"&&json.task)
        setTasks(p=>[...p,{id:Date.now(),...json.task,completed:false}]);
      else if(json.action==="complete_task"&&json.completeTitle)
        setTasks(p=>p.map(t=>t.title.toLowerCase().includes(json.completeTitle.toLowerCase())?{...t,completed:true}:t));
      const reply=json.message||"Got it! 💕";
      setChat(p=>[...p,{role:"assistant",text:reply}]);
      showToast(reply);
    }catch(e){
      console.error(e);
      setChat(p=>[...p,{role:"assistant",text:"Oops, try again 🌸"}]);
    }
    setProcessing(false);
  },[tasks,processing]);

  const startVoice=useCallback(()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){ showToast("Voice needs Chrome 🌸"); return; }
    const r=new SR(); r.lang="en-US"; r.interimResults=false;
    r.onstart=()=>setListening(true);
    r.onend=()=>setListening(false);
    r.onerror=()=>setListening(false);
    r.onresult=e=>{ const t=e.results[0][0].transcript; setInput(t); sendMsg(t); };
    r.start();
  },[sendMsg]);

  const getBrainstorm=useCallback(async(task)=>{
    setBrainstorm(p=>({...p,[task.id]:{loading:true,steps:null}}));
    setExpanded(task.id);
    try{
      const res=await fetch(API,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-api-key": API_KEY,
          "anthropic-version":"2023-06-01",
          "anthropic-dangerous-direct-browser-access":"true"
        },
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:600,
          messages:[{role:"user",content:`Give exactly 5 practical action steps for a home care office manager to complete: "${task.title}"${task.note?`. Context: ${task.note}`:""}\nReturn ONLY a JSON array of 5 strings. No markdown.`}]
        })
      });
      const data=await res.json();
      const raw=data?.content?.find(b=>b.type==="text")?.text||"[]";
      let steps=[];
      try{ steps=JSON.parse(raw.replace(/```json|```/g,"").trim()); }catch{}
      setBrainstorm(p=>({...p,[task.id]:{loading:false,steps}}));
    }catch{
      setBrainstorm(p=>({...p,[task.id]:{loading:false,steps:["Couldn't load — try again!"]}}));
    }
  },[]);

  const addTask=()=>{
    if(!newTask.title.trim()) return;
    setTasks(p=>[...p,{id:Date.now(),...newTask,completed:false}]);
    setNewTask({title:"",date:todayStr(),note:"",category:"billing"});
  };
  const toggleTask=(id)=>setTasks(p=>p.map(t=>t.id===id?{...t,completed:!t.completed}:t));
  const deleteTask=(id)=>{ setTasks(p=>p.filter(t=>t.id!==id)); setBrainstorm(p=>{const n={...p};delete n[id];return n;}); };
  const toggleCheck=(id)=>setChecklist(p=>p.map(c=>c.id===id?{...c,done:!c.done}:c));
  const resetChecklist=()=>setChecklist(DEFAULT_CHECKLIST.map(c=>({...c,done:false})));

  const todayTasks   = tasks.filter(t=>t.date===todayStr()&&(filterCat==="all"||t.category===filterCat));
  const upcomingTasks= tasks.filter(t=>t.date>todayStr()&&(filterCat==="all"||t.category===filterCat));
  const overdueTasks = tasks.filter(t=>t.date<todayStr()&&!t.completed&&(filterCat==="all"||t.category===filterCat));
  const checkDone    = checklist.filter(c=>c.done).length;
  const tasksDoneToday = tasks.filter(t=>t.completed&&t.date===todayStr()).length;

  if(!loaded) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",backgroundColor:"#fff2f8",fontFamily:"Georgia,serif",color:"#c94f7c"}}>
      <div style={{fontSize:36,marginBottom:12}}>🌸</div>
      <div style={{fontSize:13,letterSpacing:3,color:"#e891b0"}}>Loading Bright Side...</div>
    </div>
  );

  return(
    <div style={{fontFamily:"Georgia,serif",maxWidth:600,margin:"0 auto",backgroundColor:"#fff5f8",minHeight:"100vh",paddingBottom:170}}>

      {/* HEADER */}
      <div style={{backgroundColor:"#ffe0ef",padding:"24px 20px 16px",textAlign:"center",borderBottom:"3px solid #ffb3d1",position:"relative"}}>
        <div style={{position:"absolute",top:10,left:14,fontSize:16,color:"#ffb3d1"}}>✦ ✦</div>
        <div style={{position:"absolute",top:10,right:14,fontSize:16,color:"#ffb3d1"}}>✦ ✦</div>
        <div style={{fontSize:10,color:"#d4688f",letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>✦ bismillah ✦</div>
        <div style={{fontSize:28,fontWeight:900,fontStyle:"italic",color:"#c94f7c",lineHeight:1.15,marginBottom:2,textShadow:"1px 2px 0 #ffb3d1"}}>
          Bright Side<br/>Home Support
        </div>
        <div style={{fontSize:10,color:"#e8a0bb",letterSpacing:1,marginBottom:2}}>Work Planner 💼</div>
        <div style={{fontSize:10,color:"#e0a0bc",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
          {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:12}}>
          {DAYS.map((d,i)=>{
            const isToday=i===new Date().getDay();
            return(
              <div key={i} style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,
                backgroundColor:isToday?"#c94f7c":"transparent",
                color:isToday?"white":"#e0a0bc",
                border:isToday?"none":"1px solid #f7c0d8"}}>
                {d}
              </div>
            );
          })}
        </div>
        <div style={{fontSize:11,color:"#d4688f",fontStyle:"italic",marginBottom:14,paddingLeft:8,paddingRight:8}}>{quote}</div>
        <div style={{display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap"}}>
          {[
            {t:`📋 ${checkDone}/${checklist.length} Checklist`, done:checkDone===checklist.length},
            {t:`✅ ${tasksDoneToday} tasks done`, done:false},
            {t:`📌 ${overdueTasks.length} overdue`, done:false, warn:overdueTasks.length>0},
          ].map((s,i)=>(
            <div key={i} style={{padding:"4px 12px",borderRadius:20,fontSize:10,fontWeight:800,
              backgroundColor:s.done?"#c94f7c":s.warn?"#fce8f0":"white",
              color:s.done?"white":s.warn?"#c94f7c":"#d4688f",
              border:`1px solid ${s.done?"#c94f7c":"#f7c0d8"}`}}>
              {s.t}
            </div>
          ))}
        </div>
      </div>

      {/* TOAST */}
      {toast&&(
        <div style={{margin:"10px 16px 0",padding:"12px 16px",borderRadius:16,backgroundColor:"#fff0f8",border:"1px solid #f7c0d8",fontSize:13,color:"#c94f7c",fontStyle:"italic",textAlign:"center"}}>
          🌸 {toast}
        </div>
      )}

      {/* TABS */}
      <div style={{display:"flex",margin:"14px 16px 0",backgroundColor:"#fde8f3",borderRadius:20,padding:4,gap:2,border:"1px solid #f7c0d8"}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"9px 2px",border:"none",borderRadius:16,cursor:"pointer",fontSize:10,fontWeight:800,letterSpacing:0.5,textTransform:"uppercase",fontFamily:"Georgia,serif",
            backgroundColor:tab===t?"#c94f7c":"transparent",
            color:tab===t?"white":"#d4688f"}}>
            {t}
          </button>
        ))}
      </div>

      <div style={{padding:"14px 16px 0"}}>

        {/* TODAY */}
        {tab==="Today"&&(
          <div>
            <CatFilter v={filterCat} set={setFilterCat}/>
            {overdueTasks.length>0&&(
              <div style={{marginBottom:14}}>
                <SH>⚠️ Overdue</SH>
                {overdueTasks.map(t=><TCard key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} onBrainstorm={getBrainstorm} bs={brainstorm[t.id]} exp={expanded===t.id} setExp={setExpanded} overdue/>)}
              </div>
            )}
            <SH>✦ Today's Work ({todayTasks.length})</SH>
            {todayTasks.length===0
              ?<Empty text="Nothing yet — ask your assistant below 🌸"/>
              :todayTasks.map(t=><TCard key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} onBrainstorm={getBrainstorm} bs={brainstorm[t.id]} exp={expanded===t.id} setExp={setExpanded}/>)
            }
            {upcomingTasks.length>0&&(
              <div style={{marginTop:14}}>
                <SH>🔜 Coming Up</SH>
                {upcomingTasks.slice(0,3).map(t=><TCard key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} onBrainstorm={getBrainstorm} bs={brainstorm[t.id]} exp={expanded===t.id} setExp={setExpanded} showDate/>)}
              </div>
            )}
            <div style={{marginTop:18,padding:"14px 16px",backgroundColor:"#fff0f8",borderRadius:18,border:"1px dashed #f0a0c8"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <SH>📋 Checklist ({checkDone}/{checklist.length})</SH>
                <button onClick={()=>setTab("Checklist")} style={{fontSize:10,color:"#c94f7c",backgroundColor:"transparent",border:"none",cursor:"pointer",fontFamily:"Georgia,serif",fontWeight:800}}>See all →</button>
              </div>
              <div style={{height:6,backgroundColor:"#fce8f0",borderRadius:10,overflow:"hidden",marginBottom:4}}>
                <div style={{height:"100%",backgroundColor:"#c94f7c",borderRadius:10,width:`${Math.round(checkDone/checklist.length*100)}%`,transition:"width 0.4s"}}/>
              </div>
              <div style={{fontSize:10,color:"#e8a0bb",fontStyle:"italic",textAlign:"center",marginTop:4}}>
                {checkDone===checklist.length?"Mashallah — checklist complete! 💕":`${checklist.length-checkDone} items remaining 🌸`}
              </div>
            </div>
          </div>
        )}

        {/* TASKS */}
        {tab==="Tasks"&&(
          <div>
            <SH>✦ Add a Task</SH>
            <div style={{backgroundColor:"white",borderRadius:18,padding:16,marginBottom:16,border:"1px solid #f7c0d8"}}>
              <In placeholder="What needs to get done? 💼" value={newTask.title} onChange={e=>setNewTask(p=>({...p,title:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTask()}/>
              <In placeholder="Notes (optional)" value={newTask.note} onChange={e=>setNewTask(p=>({...p,note:e.target.value}))} style={{marginTop:8}}/>
              <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                <select value={newTask.category} onChange={e=>setNewTask(p=>({...p,category:e.target.value}))} style={{flex:1,minWidth:120,padding:"9px 12px",borderRadius:20,border:"1px solid #f7c0d8",fontSize:12,color:"#c4507a",fontFamily:"Georgia,serif",backgroundColor:"#fff8fb",outline:"none"}}>
                  {Object.entries(CATS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
                <input type="date" value={newTask.date} onChange={e=>setNewTask(p=>({...p,date:e.target.value}))} style={{flex:1,minWidth:120,padding:"9px 12px",borderRadius:20,border:"1px solid #f7c0d8",fontSize:12,color:"#c4507a",fontFamily:"Georgia,serif",backgroundColor:"#fff8fb",outline:"none"}}/>
              </div>
              <div style={{marginTop:10}}><Btn onClick={addTask}>Add Task ✦</Btn></div>
            </div>
            <SH>✦ All Tasks</SH>
            <CatFilter v={filterCat} set={setFilterCat}/>
            {tasks.filter(t=>filterCat==="all"||t.category===filterCat).length===0
              ?<Empty text="No tasks yet 💕"/>
              :tasks.filter(t=>filterCat==="all"||t.category===filterCat).slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>(
                <TCard key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} onBrainstorm={getBrainstorm} bs={brainstorm[t.id]} exp={expanded===t.id} setExp={setExpanded} showDate/>
              ))
            }
          </div>
        )}

        {/* CHECKLIST */}
        {tab==="Checklist"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <SH>📋 Daily Work Checklist</SH>
              <button onClick={resetChecklist} style={{fontSize:10,color:"#e8a0bb",backgroundColor:"transparent",border:"1px solid #f7c0d8",borderRadius:14,padding:"4px 10px",cursor:"pointer",fontFamily:"Georgia,serif"}}>Reset</button>
            </div>
            <div style={{marginBottom:16,padding:"12px 16px",backgroundColor:"white",borderRadius:18,border:"1px solid #f7c0d8"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:10,fontWeight:800,color:"#c94f7c"}}>{checkDone}/{checklist.length} complete</div>
                <div style={{fontSize:10,color:"#e8a0bb"}}>{Math.round(checkDone/checklist.length*100)}%</div>
              </div>
              <div style={{height:8,backgroundColor:"#fce8f0",borderRadius:10,overflow:"hidden"}}>
                <div style={{height:"100%",backgroundColor:"#c94f7c",borderRadius:10,width:`${Math.round(checkDone/checklist.length*100)}%`,transition:"width 0.4s"}}/>
              </div>
              <div style={{fontSize:11,color:"#e8a0bb",fontStyle:"italic",textAlign:"center",marginTop:8}}>
                {checkDone===checklist.length?"You're on top of everything 💕 Mashallah!":checkDone===0?"Let's get started 🌸":`Keep going — ${checklist.length-checkDone} left ✨`}
              </div>
            </div>
            {Object.entries(CATS).map(([catKey,catVal])=>{
              const items=checklist.filter(c=>c.cat===catKey);
              if(!items.length) return null;
              return(
                <div key={catKey} style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:800,color:catVal.color,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>{catVal.label}</div>
                  {items.map(c=>(
                    <div key={c.id} onClick={()=>toggleCheck(c.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:16,marginBottom:8,cursor:"pointer",
                      backgroundColor:c.done?"#fff0f8":"white",
                      border:`1px solid ${c.done?catVal.color+"55":"#f7c0d8"}`,
                      borderLeft:`3px solid ${catVal.color}`}}>
                      <div style={{width:20,height:20,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                        backgroundColor:c.done?catVal.color:"white",
                        border:`2px solid ${c.done?catVal.color:"#f7c0d8"}`}}>
                        {c.done&&<span style={{color:"white",fontSize:10,fontWeight:800}}>✓</span>}
                      </div>
                      <div style={{fontSize:12,fontWeight:700,color:c.done?catVal.color:"#c4507a",textDecoration:c.done?"line-through":"none",flex:1}}>{c.label}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* NOTES */}
        {tab==="Notes"&&(
          <div>
            <SH>📝 Work Notes — {new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}</SH>
            <div style={{fontSize:11,color:"#e8a0bb",fontStyle:"italic",marginBottom:10}}>Client notes, meeting summaries, follow-ups 🌸</div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)}
              placeholder="e.g. Called client family re: schedule change. Need to follow up on claim #1234..."
              style={{width:"100%",minHeight:260,padding:"14px 16px",borderRadius:18,border:"1px solid #f7c0d8",backgroundColor:"#fff8fb",fontSize:13,color:"#c4507a",fontFamily:"Georgia,serif",outline:"none",resize:"vertical",boxSizing:"border-box",lineHeight:1.8}}/>
            <div style={{marginTop:10,padding:"10px 14px",backgroundColor:"#fff0f8",borderRadius:14,border:"1px dashed #f0a0c8",fontSize:11,color:"#e8a0bb",fontStyle:"italic",textAlign:"center"}}>
              Notes save automatically ✦ each day starts fresh 🌸
            </div>
          </div>
        )}
      </div>

      {/* CHAT LOG */}
      {showChat&&chat.length>0&&(
        <div style={{position:"fixed",bottom:110,left:"50%",transform:"translateX(-50%)",width:"min(568px,100%)",maxHeight:200,overflowY:"auto",backgroundColor:"#fff8fc",borderTop:"1px solid #f7c0d8",borderLeft:"1px solid #f7c0d8",borderRight:"1px solid #f7c0d8",borderRadius:"20px 20px 0 0",boxShadow:"0 -4px 20px rgba(200,80,130,0.12)",padding:"12px 14px 4px",zIndex:99}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:9,fontWeight:800,color:"#c94f7c",letterSpacing:2,textTransform:"uppercase"}}>✦ Work Assistant</div>
            <button onClick={()=>setShowChat(false)} style={{backgroundColor:"transparent",border:"none",color:"#f0b8d0",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
          </div>
          {chat.slice(-12).map((m,i)=>(
            <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:6}}>
              <div style={{maxWidth:"80%",padding:"8px 12px",fontSize:12,fontFamily:"Georgia,serif",fontStyle:m.role==="assistant"?"italic":"normal",
                borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",
                backgroundColor:m.role==="user"?"#c94f7c":"#ffe8f3",
                color:m.role==="user"?"white":"#c4507a"}}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef}/>
        </div>
      )}

      {/* ASSISTANT BAR */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"min(568px,100%)",backgroundColor:"#fff8fc",borderTop:"2px solid #f7c0d8",padding:"8px 14px 20px",zIndex:100}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,WebkitOverflowScrolling:"touch"}}>
          {SHORTCUTS.map((sc,i)=>(
            <button key={i} onClick={()=>sendMsg(sc.label.replace(/[🧾📍👤👥📋🗂]/g,"").trim())} style={{padding:"4px 11px",borderRadius:20,border:`1px solid ${CATS[sc.cat].color}`,backgroundColor:CATS[sc.cat].bg,color:CATS[sc.cat].color,fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"Georgia,serif",whiteSpace:"nowrap",flexShrink:0}}>
              {sc.label}
            </button>
          ))}
        </div>
        <div style={{fontSize:9,textAlign:"center",color:"#e8a0bb",fontWeight:800,letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>
          {listening?"🎙️ Listening...":processing?"💭 Thinking...":"✦ Bright Side Work Assistant ✦"}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={startVoice} disabled={processing} style={{width:44,height:44,borderRadius:"50%",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
            backgroundColor:listening?"#c94f7c":"white",border:`2px solid ${listening?"#c94f7c":"#f7c0d8"}`}}>
            🎙️
          </button>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg(input)}
            placeholder='"Remind me to follow up on billing claim tomorrow"'
            disabled={processing||listening}
            style={{flex:1,padding:"11px 14px",borderRadius:22,border:"1px solid #f7c0d8",fontSize:12,outline:"none",color:"#c4507a",fontFamily:"Georgia,serif",backgroundColor:"#fff5f8"}}/>
          <button onClick={()=>sendMsg(input)} disabled={processing||!input.trim()} style={{width:44,height:44,borderRadius:"50%",border:"none",cursor:input.trim()?"pointer":"default",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
            backgroundColor:input.trim()?"#c94f7c":"#f7c0d8",color:"white"}}>
            →
          </button>
        </div>
        {chat.length>0&&!showChat&&<button onClick={()=>setShowChat(true)} style={{display:"block",margin:"5px auto 0",fontSize:9,color:"#e8a0bb",backgroundColor:"transparent",border:"none",cursor:"pointer",letterSpacing:1}}>view chat ↑</button>}
      </div>
    </div>
  );
}

function SH({children}){ return <div style={{fontSize:10,fontWeight:900,color:"#c94f7c",textTransform:"uppercase",letterSpacing:2,marginBottom:10,fontFamily:"Georgia,serif"}}>{children}</div>; }
function In({style={},onKeyDown,...props}){ return <input {...props} onKeyDown={onKeyDown} style={{width:"100%",padding:"10px 14px",borderRadius:20,border:"1px solid #f7c0d8",fontSize:12,outline:"none",color:"#c4507a",fontFamily:"Georgia,serif",backgroundColor:"#fff8fb",boxSizing:"border-box",...style}}/>; }
function Btn({onClick,children}){ return <button onClick={onClick} style={{padding:"10px 20px",backgroundColor:"#c94f7c",color:"white",border:"none",borderRadius:20,cursor:"pointer",fontWeight:800,fontSize:12,fontFamily:"Georgia,serif",whiteSpace:"nowrap"}}>{children}</button>; }
function Empty({text}){ return <div style={{textAlign:"center",color:"#e8a0bb",fontSize:13,padding:"20px 0",fontStyle:"italic"}}>{text}</div>; }

function CatFilter({v,set}){
  return(
    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,marginBottom:10,WebkitOverflowScrolling:"touch"}}>
      {[["all","All 💼","#c94f7c"],...Object.entries(CATS).map(([k,c])=>[k,c.label,c.color])].map(([k,label,color])=>(
        <button key={k} onClick={()=>set(k)} style={{padding:"5px 12px",borderRadius:20,fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"Georgia,serif",whiteSpace:"nowrap",flexShrink:0,
          backgroundColor:v===k?color:"white",color:v===k?"white":color,border:`1px solid ${color}`}}>
          {label}
        </button>
      ))}
    </div>
  );
}

function TCard({task,onToggle,onDelete,onBrainstorm,bs,exp,setExp,showDate,overdue}){
  const cat=CATS[task.category]||CATS.admin;
  return(
    <div style={{backgroundColor:"white",borderRadius:18,padding:"13px 15px",marginBottom:10,border:`1px solid ${overdue?"#fb7185":"#f7c0d8"}`,borderLeft:`3px solid ${overdue?"#fb7185":cat.color}`}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <button onClick={()=>onToggle(task.id)} style={{width:22,height:22,minWidth:22,borderRadius:"50%",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",marginTop:1,
          backgroundColor:task.completed?cat.color:"white",border:`2px solid ${task.completed?cat.color:"#f7c0d8"}`}}>
          {task.completed&&<span style={{color:"white",fontSize:11,fontWeight:800}}>✓</span>}
        </button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontWeight:700,fontSize:13,color:task.completed?"#e8a0bb":"#c4507a",textDecoration:task.completed?"line-through":"none"}}>{task.title}</span>
            <span style={{fontSize:8,fontWeight:800,color:cat.color,backgroundColor:cat.bg,padding:"2px 7px",borderRadius:10}}>{cat.label}</span>
          </div>
          {task.note&&<div style={{fontSize:11,color:"#e8a0bb",marginTop:2,fontStyle:"italic"}}>{task.note}</div>}
          {showDate&&<div style={{fontSize:10,color:overdue?"#fb7185":"#e8a0bb",marginTop:3}}>{overdue?"⚠️ Overdue — ":""}{fmt(task.date)}</div>}
        </div>
        <button onClick={()=>onDelete(task.id)} style={{backgroundColor:"transparent",border:"none",color:"#f0b8d0",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 4px"}}>×</button>
      </div>
      <div style={{marginTop:9}}>
        <button onClick={()=>exp?setExp(null):onBrainstorm(task)} style={{fontSize:9,padding:"5px 13px",borderRadius:20,cursor:"pointer",fontWeight:800,fontFamily:"Georgia,serif",
          backgroundColor:exp?"#c94f7c":"white",color:exp?"white":"#c94f7c",border:"1px solid #f7c0d8"}}>
          {bs?.loading?"✦ Thinking...":exp?"Hide Steps":"✨ Brainstorm Steps"}
        </button>
      </div>
      {exp&&bs&&!bs.loading&&bs.steps&&(
        <div style={{marginTop:10,backgroundColor:"#fff5f8",borderRadius:14,padding:"12px 14px",border:"1px dashed #f0a0c8"}}>
          <div style={{fontSize:9,fontWeight:900,color:"#c94f7c",marginBottom:8,letterSpacing:2,textTransform:"uppercase"}}>✦ Action Steps</div>
          {bs.steps.map((s,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:7,fontSize:12,color:"#c4507a"}}>
              <span style={{color:"#f0a0c8",fontWeight:900,minWidth:16}}>{i+1}.</span><span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
