import React,{useEffect,useRef,useState}from"react";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import * as Updates from "expo-updates";
import appConfig from "./app.json";
import{SafeAreaView,View,Text as RNText,StyleSheet,Pressable,ScrollView as RNScrollView,Animated,ImageBackground,TextInput,Image,Alert,BackHandler,Platform,Modal,AppState}from"react-native";


const API_BASE_URL=Platform.OS==="web"?String((globalThis as any)?.location?.origin||"https://api.usautodartsleague.com"):"https://api.usautodartsleague.com";
const APP_VERSION=String((appConfig as any)?.expo?.version||"0.0.0");
const APP_VERSION_CODE=String((appConfig as any)?.expo?.android?.versionCode||"");
const storage={
  async getItemAsync(key:string){
    if(Platform.OS==="web"){if(key==="league_password")return null;try{return (globalThis as any)?.localStorage?.getItem(key)??null}catch{return null}}
    return SecureStore.getItemAsync(key);
  },
  async setItemAsync(key:string,value:string){
    if(Platform.OS==="web"){if(key==="league_password")return;try{(globalThis as any)?.localStorage?.setItem(key,value);return}catch{return}}
    return SecureStore.setItemAsync(key,value);
  },
  async deleteItemAsync(key:string){
    if(Platform.OS==="web"){try{(globalThis as any)?.localStorage?.removeItem(key);return}catch{return}}
    return SecureStore.deleteItemAsync(key);
  }
};
let runtimeAuthToken:string|null=null;

async function apiRequest(path:string,options:any={}){
  const token=runtimeAuthToken||await storage.getItemAsync("league_session");
  const {timeoutMs=8000,...fetchOptions}=options||{};
  const headers:any={"Accept":"application/json","Content-Type":"application/json",...(fetchOptions.headers||{})};
  if(token)headers.Authorization=`Bearer ${token}`;
  const controller=new AbortController();
  const requestTimeout=Math.max(1000,Number(timeoutMs)||8000);
  const timeout=setTimeout(()=>controller.abort(),requestTimeout);
  try{
    const response=await fetch(`${API_BASE_URL}${path}`,{...fetchOptions,headers,signal:controller.signal});
    let data:any=null;
    try{data=await response.json();}catch{}
    if(!response.ok){
      const message=data?.message||data?.error||`Server returned HTTP ${response.status}`;
      const err:any=new Error(message);
      err.status=response.status;
      err.serverData=data;
      throw err;
    }
    return data;
  }finally{clearTimeout(timeout);}
}

async function uploadMatchEvidence(matchId:string,assets:any[]){
  const token=runtimeAuthToken||await storage.getItemAsync("league_session");
  if(!token)throw new Error("You are not signed in.");
  const form:any=new FormData();
  for(let i=0;i<assets.length;i++){
    const a:any=assets[i];
    const uri=String(a?.uri||"");
    const original=String(a?.fileName||a?.filename||`autodarts-match-${matchId}-${i+1}.png`);
    let type=String(a?.mimeType||a?.type||"");
    if(!type||!type.includes("/")){
      const lower=original.toLowerCase();
      type=lower.endsWith(".jpg")||lower.endsWith(".jpeg")?"image/jpeg":lower.endsWith(".webp")?"image/webp":"image/png";
    }
    if(Platform.OS==="web"){
      const blob:any=await (await fetch(uri)).blob();
      form.append("files",blob,original);
    }else{
      form.append("files",{uri,name:original,type} as any);
    }
  }
  const response=await fetch(`${API_BASE_URL}/api/matches/${encodeURIComponent(matchId)}/evidence`,{
    method:"POST",
    headers:{Accept:"application/json",Authorization:`Bearer ${token}`},
    body:form
  });
  let data:any=null;try{data=await response.json();}catch{}
  if(!response.ok){
    const err:any=new Error(data?.message||data?.error||`Server returned HTTP ${response.status}`);
    err.status=response.status;err.serverData=data;throw err;
  }
  return data;
}

function formatStat(value:any,decimals=2){const n=Number(value);return Number.isFinite(n)?n.toFixed(decimals):(0).toFixed(decimals)}
function formatStatInt(value:any){const n=Number(value);return Number.isFinite(n)?String(Math.max(0,Math.round(n))):"0"}

const FontScaleContext=React.createContext(1);
function Text(props:any){
  const scale=React.useContext(FontScaleContext);
  const flat=StyleSheet.flatten(props.style)||{};
  const baseSize=flat.fontSize??14;
  const baseLine=flat.lineHeight;
  return <RNText {...props} style={[props.style,{fontSize:baseSize*scale},baseLine?{lineHeight:baseLine*scale}:null]}/>;
}
const standingsByDivision:any={};
const bundledAwardCatalog=[
  {type:"goldCup",category:"Championship Trophies",name:"Gold Cup",detail:"Awarded to the Division Playoff Champion."},
  {type:"silverCup",category:"Championship Trophies",name:"Silver Cup",detail:"Awarded to the player who finishes #1 in their division during the regular season."},
  {type:"diamondCup",category:"Championship Trophies",name:"Diamond Cup",detail:"Awarded to a Tournament or overall League Champion."},
  {type:"managerTournamentChampion",category:"Special Achievements",name:"Tournament Champion",detail:"Awarded for winning a manager-created tournament. The count shows total manager-created tournament wins."},
  {type:"most180s",category:"Performance Awards",name:"Most 180s",detail:"Season award for recording the most 180 scores."},
  {type:"highestAverage",category:"Performance Awards",name:"Highest 3-Dart Average",detail:"Season award for the league's highest 3-dart average."},
  {type:"highestCheckout",category:"Performance Awards",name:"Highest Checkout",detail:"Season award for the highest successful checkout."},
  {type:"bestCheckoutPct",category:"Performance Awards",name:"Best Checkout Percentage",detail:"Season award for the best checkout success percentage."},
  {type:"bestLeg",category:"Performance Awards",name:"Best Leg",detail:"Season award for the best single leg, measured by the fewest darts used."},
  {type:"mostWins",category:"Performance Awards",name:"Most Match Wins",detail:"Season award for recording the most match wins."},
  {type:"nineDart",category:"Special Achievements",name:"9-Dart Leg",detail:"Complete a leg in exactly 9 darts."},
  {type:"twelveDart",category:"Special Achievements",name:"12-Dart Leg",detail:"Complete a leg in 12 darts or fewer."},
  {type:"fifteenDart",category:"Special Achievements",name:"15-Dart Leg",detail:"Complete a leg in 15 darts or fewer."},
  {type:"checkout170",category:"Special Achievements",name:"170 Checkout",detail:"Successfully finish a leg with a 170 checkout."},
  {type:"checkout100Plus",category:"Special Achievements",name:"100+ Checkout",detail:"Successfully finish a leg with a checkout of 100 or higher."},
  {type:"first180",category:"Special Achievements",name:"First 180",detail:"Record your first league 180."},
  {type:"career180_50",category:"Special Achievements",name:"50 Career 180s",detail:"Reach 50 recorded league 180s in your career."},
  {type:"career180_100",category:"Special Achievements",name:"100 Career 180s",detail:"Reach 100 recorded league 180s in your career."},
  {type:"winStreak",category:"Special Achievements",name:"Win Streak",detail:"Win 5 consecutive league matches."},
  {type:"promotion",category:"Special Achievements",name:"Promotion Earned",detail:"Earn promotion to a higher division."},
  {type:"fiveSeasons",category:"Special Achievements",name:"5 Seasons Played",detail:"Complete 5 league seasons."},
  {type:"tenSeasons",category:"Special Achievements",name:"10 Seasons Played",detail:"Complete 10 league seasons."},
  {type:"matches100",category:"Special Achievements",name:"100 Matches Played",detail:"Play 100 recorded league matches."},
  {type:"matches250",category:"Special Achievements",name:"250 Matches Played",detail:"Play 250 recorded league matches."},
  {type:"perfectSeason",category:"Special Achievements",name:"Perfect Season",detail:"Complete a season with a perfect match-win record."},
  {type:"undefeatedSeason",category:"Special Achievements",name:"Undefeated Season",detail:"Complete a season without a match loss."}
];

const playerAwards:any={};
const playerStats:any={};

const leagueRules=[
  {n:"01",title:"Match Format",icon:"🎯",items:["501 Double Out, Best of 5, first to 3 legs. No draws."]},
  {n:"02",title:"Starting the Match",icon:"◉",items:["Bull-off determines who starts Leg 1; players alternate who starts subsequent legs."]},
  {n:"03",title:"League Points & Standings",icon:"★",items:["Win = 3 points, Loss = 0 points. No draw points.","Tiebreakers: leg difference, legs won, head-to-head, season 3-dart average, then tiebreak match if necessary."]},
  {n:"04",title:"Regular-Season Scheduling",icon:"◷",items:["League weeks run Monday–Sunday.","Deadline is Sunday at 11:59 PM Eastern.","Early matches are allowed by mutual agreement."]},
  {n:"05",title:"No-Shows & Forfeits",icon:"!",items:["15-minute grace period.","An admin may award a 3–0 forfeit when appropriate.","If neither player reasonably attempts to schedule/play, neither receives points."]},
  {n:"06",title:"Reporting Results",icon:"✓",items:["Results are submitted through the app/interface with supporting AutoDarts evidence.","Opponents have 24 hours to dispute a result.","The server processes and stores official results."]},
  {n:"07",title:"AutoDarts Scoring & Corrections",icon:"⚙",items:["AutoDarts is the official scoring system.","Incorrectly detected darts should be corrected before play continues.","Intentional score manipulation is cheating."]},
  {n:"08",title:"Technical Problems & Disconnects",icon:"⚙",items:["Players have up to 15 minutes to resolve legitimate technical problems.","Matches should resume where they stopped whenever possible."]},
  {n:"09",title:"Player Conduct & Sportsmanship",icon:"⚖",items:["Harassment, threats, cheating, deliberate disruption, false scores, substitutes, and similar misconduct are prohibited.","Admins may issue warnings, forfeitures, point penalties, suspensions, or removal."]},
  {n:"10",title:"Divisions, Promotion & Relegation",icon:"↕",items:["Top 2 regular-season finishers are promoted and bottom 2 relegated when applicable.","Admins may adjust placements between seasons when needed to properly organize divisions."]},
  {n:"11",title:"Playoffs & Championship",icon:"🏆",items:["Top 4 qualify.","Semifinals are Best of 7, 501 Double Out.","The championship/tournament final is Best of 9, 501 Double Out."]},
  {n:"12",title:"Player Eligibility",icon:"◉",items:["Working AutoDarts setup, reliable internet, league account/profile, AutoDarts username, official Discord membership, and agreement to league rules are required."]},
  {n:"13",title:"Division Size & Season Format",icon:"◆",items:["Maximum 12 players per division.","Normally single round robin; smaller divisions may use double round robin.","Format is determined before the season and locked once play begins."]},
  {n:"14",title:"Withdrawals & Late Entries",icon:"↩",items:["No late entries after registration closes.","If a withdrawing player completed less than 50% of their schedule, their completed results are voided.","At least 50% completed means completed results remain and remaining opponents receive 3–0 forfeits.","Admin initiates the withdrawal and the server automatically performs the recalculation."]},
  {n:"15",title:"Match Environment & Equipment",icon:"◈",items:["Regulation setup, functioning AutoDarts equipment, proper lighting, and the player's registered identity are required.","An additional player-facing webcam is not currently required."]},
  {n:"16",title:"Match Check-In & Starting Procedure",icon:"▤",items:["Players check in/coordinate through the appropriate Discord area, verify equipment and match settings, conduct the bull-off, and begin the match."]},
  {n:"17",title:"Match Completion",icon:"✓",items:["First player to 3 legs wins.","Every regular-season match produces a winner. There are no draws."]},
  {n:"18",title:"Player Statistics",icon:"▥",items:["The server maintains season and career statistics, including W/L, legs, averages, checkout percentage, highest checkout, best leg, 60+, 100+, 140+, 170+, 180s, streaks, and match history.","Voided matches don't count."]},
  {n:"19",title:"Awards & Records",icon:"🏆",items:["Division/season awards and all-time league records are maintained.","Trophy/badge achievements remain permanently associated with player profiles."]},
  {n:"20",title:"Playoff Seeding & Tiebreakers",icon:"★",items:["Top four qualify based on standings.","Tiebreak order remains league points → leg difference → legs won → head-to-head → season 3-dart average → tiebreak match."]},
  {n:"21",title:"Playoff Scheduling & Technical Rules",icon:"◷",items:["Semifinals receive a 7-day completion window; championship receives another 7-day window.","Best-of-7 forfeits are 4–0 and Best-of-9 forfeits 5–0."]},
  {n:"22",title:"League Administration",icon:"⚖",items:["Admins manage divisions, schedules, disputes, withdrawals, penalties, corrections, and unusual circumstances.","Important admin actions should be recorded in a server-side Admin Activity Log."]},
  {n:"23",title:"Registration & Division Placement",icon:"◆",items:["Returning players follow promotion/relegation.","New players are primarily placed according to verified AutoDarts average.","Admins can adjust placement for competitive balance and division-size needs."]},
  {n:"24",title:"New Player Qualifying",icon:"🎯",items:["Players without sufficient AutoDarts history complete five 501 Double Out games for placement purposes."]},
  {n:"25",title:"Roster Lock & Schedule Publication",icon:"▤",items:["Divisions and season format are finalized at roster lock.","The entire regular-season schedule is published before opening day, organized into weekly rounds."]},
  {n:"26",title:"Taking a Season Off",icon:"↩",items:["Players can become inactive without losing career history, trophies, awards, or statistics.","Returning players are placed appropriately rather than automatically returning to their old division."]},
  {n:"27",title:"Discord Communication & Game Planning",icon:"◉",items:["Official scheduling/game planning takes place in the appropriate US AutoDarts Discord game-planning area.","Initial scheduling attempts should normally happen by Wednesday, with reasonable response times."]},
  {n:"28",title:"Season Timeline & Offseason",icon:"◷",items:["Regular season → semifinal week → championship week → normally a two-week offseason/setup period before the next season."]},
  {n:"29",title:"League Fees & Prizes",icon:"★",items:["Initially free to join.","Sponsored/donated prizes may be offered.","Any future entry-fee/prize structure must be announced before registration closes."]},
  {n:"30",title:"Rule Changes",icon:"◈",items:["Major competitive rules should normally change only between seasons.","Emergency rulings are allowed when necessary.","Each season retains the rulebook version under which it was played."]}
];

function RuleCard({rule}:{rule:any}){
  const[open,setOpen]=useState(false);
  return <View style={s.ruleCard}>
    <Pressable style={s.ruleCardHeader} onPress={()=>setOpen(!open)} accessibilityRole="button" accessibilityLabel={`${rule.title}. ${open?"Collapse":"Expand"} rules`}>
      <View style={s.ruleNumber}><Text style={s.ruleNumberText}>{rule.n}</Text></View>
      <View style={s.ruleHeaderCopy}>
        <Text style={s.ruleEyebrow}>{rule.icon}  OFFICIAL RULE</Text>
        <Text style={s.ruleTitle}>{rule.title}</Text>
      </View>
      <Text style={s.ruleChevron}>{open?"−":"+"}</Text>
    </Pressable>
    {open?<View style={s.ruleBody}>
      {rule.items.map((item:string,i:number)=><View key={i} style={s.ruleBulletRow}>
        <View style={s.ruleBullet}/>
        <Text style={s.ruleBulletText}>{item}</Text>
      </View>)}
    </View>:null}
  </View>
}

const US_TIME_ZONES=[
  {value:"America/New_York",label:"Eastern"},
  {value:"America/Chicago",label:"Central"},
  {value:"America/Denver",label:"Mountain"},
  {value:"America/Los_Angeles",label:"Pacific"},
  {value:"America/Anchorage",label:"Alaska"},
  {value:"Pacific/Honolulu",label:"Hawaii"},
  {value:"America/Phoenix",label:"Arizona (no DST)"}
];

function ChoiceDropdown({label,value,options,onChange,placeholder="Select"}:{label:string;value:any;options:any[];onChange:(value:string)=>void;placeholder?:string}){
  const[open,setOpen]=useState(false);
  const selected=options.find((o:any)=>String(o.value)===String(value));
  return <View style={s.choiceBlock}>
    <Text style={s.choiceLabel}>{label}</Text>
    <Pressable style={[s.choiceButton,open&&s.choiceButtonOpen]} onPress={()=>setOpen(v=>!v)}>
      <Text style={[s.choiceValue,!selected&&{color:"#6f8597"}]} numberOfLines={1}>{selected?.label||placeholder}</Text><Text style={s.choiceArrow}>{open?"▲":"▼"}</Text>
    </Pressable>
    {open?<View style={s.choiceMenu}>{options.map((o:any)=><Pressable key={String(o.value)} style={[s.choiceOption,String(o.value)===String(value)&&s.choiceOptionActive]} onPress={()=>{onChange(String(o.value));setOpen(false)}}><Text style={[s.choiceOptionText,String(o.value)===String(value)&&s.choiceOptionTextActive]}>{o.label}</Text></Pressable>)}</View>:null}
  </View>;
}

function formatMatchDate(value:any,timeZone?:string){
  const raw=String(value||"").trim();
  if(!raw)return "Schedule TBD";
  const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)?raw.replace(" ","T"):raw;
  const d=new Date(normalized);
  if(Number.isNaN(d.getTime()))return raw;
  try{return d.toLocaleString([], {weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:timeZone||undefined});}catch{return d.toLocaleString();}
}

const WEEKDAY_OPTIONS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(v=>({value:v,label:v}));
const TIME_OPTIONS=Array.from({length:96},(_,i)=>{const h=Math.floor(i/4),m=(i%4)*15;const value=`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;const hour=((h+11)%12)+1;const ampm=h<12?"AM":"PM";return{value,label:`${hour}:${String(m).padStart(2,"0")} ${ampm} Eastern`}});
function managerTournamentDateOptions(includeDate=""){
  const out:any[]=[];
  const seen=new Set<string>();
  const base=new Date();
  base.setHours(12,0,0,0);
  for(let i=0;i<61;i++){
    const d=new Date(base);d.setDate(base.getDate()+i);
    const value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const label=d.toLocaleDateString([], {weekday:"short",month:"short",day:"numeric",year:"numeric"});
    out.push({value,label});seen.add(value);
  }
  if(/^\d{4}-\d{2}-\d{2}$/.test(includeDate)&&!seen.has(includeDate)){
    const d=new Date(`${includeDate}T12:00:00`);
    out.unshift({value:includeDate,label:Number.isNaN(d.getTime())?includeDate:d.toLocaleDateString([], {weekday:"short",month:"short",day:"numeric",year:"numeric"})});
  }
  return out;
}
function easternNowForTournament(){
  try{
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
    const o:any={};for(const x of parts)if(x.type!=="literal")o[x.type]=x.value;
    return{date:`${o.year}-${o.month}-${o.day}`,time:`${o.hour}:${o.minute}`};
  }catch{
    const d=new Date();return{date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,time:`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`};
  }
}
function managerTournamentEasternParts(t:any){
  const directDate=String(t?.date||t?.start_date||t?.scheduled_date||"").trim();
  const directTime=String(t?.time||t?.start_time_eastern||t?.scheduled_time_eastern||"").trim().slice(0,5);
  if(/^\d{4}-\d{2}-\d{2}$/.test(directDate)&&/^\d{2}:\d{2}$/.test(directTime))return{date:directDate,time:directTime};
  const raw=String(t?.start_at||t?.scheduled_at||"").trim();
  const d=new Date(raw);
  if(!raw||Number.isNaN(d.getTime()))return{date:directDate,time:directTime};
  try{
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d);
    const o:any={};for(const x of parts)if(x.type!=="literal")o[x.type]=x.value;
    return{date:`${o.year}-${o.month}-${o.day}`,time:`${o.hour}:${o.minute}`};
  }catch{return{date:directDate,time:directTime}}
}

const SEASON_STATUS_OPTIONS=[{value:"draft",label:"Draft"},{value:"current",label:"Current"},{value:"completed",label:"Completed"},{value:"archived",label:"Archived"}];
const SCHEDULE_TYPE_OPTIONS=[{value:"single",label:"Single Round Robin"},{value:"double",label:"Double Round Robin"}];
const MATCH_STATUS_OPTIONS=[{value:"scheduled",label:"Scheduled"},{value:"completed",label:"Completed"},{value:"void",label:"Void"}];
const ROLE_OPTIONS=[{value:"player",label:"Player"},{value:"moderator",label:"Moderator"},{value:"manager",label:"Manager"}];
const ACTIVE_OPTIONS=[{value:"true",label:"Active"},{value:"false",label:"Disabled"}];
const CAPACITY_OPTIONS=Array.from({length:11},(_,i)=>({value:String(i+2),label:String(i+2)}));
function legalResultOptions(bestOf:any){const n=Math.max(1,Number(bestOf)||5);const win=Math.floor(n/2)+1;const out:any[]=[];for(let loser=0;loser<win;loser++){out.push({value:`${win}-${loser}`,label:`${win} - ${loser}`});out.push({value:`${loser}-${win}`,label:`${loser} - ${win}`});}return out;}
function localMatchLabel(m:any,timeZone?:string){return String(m?.scheduled_local_label||m?.scheduled_eastern_label||formatMatchDate(m?.scheduled_at_local||m?.scheduled_at,timeZone));}
function easternDateValue(m:any){const raw=String(m?.scheduled_at_eastern||m?.scheduled_at||"");return /^\d{4}-\d{2}-\d{2}/.test(raw)?raw.slice(0,10):"";}
function easternTimeValue(m:any){const raw=String(m?.scheduled_at_eastern||m?.scheduled_at||"");return raw.length>=16?raw.slice(11,16):"";}
function neutralOpponent(m:any,me:any){const id=Number(me||0);return Number(m?.player1_id)===id?m?.player2_name:m?.player1_name;}
function isTournamentMatch(m:any){const stage=String(m?.stage||m?.match_type||m?.type||"").toLowerCase();return !!stage&&stage!=="regular_season"&&(stage.includes("playoff")||stage.includes("tournament")||stage.includes("championship")||stage.includes("final")||stage.includes("semifinal"));}
function tournamentMatchesFromPayload(payload:any){
  if(Array.isArray(payload))return payload;
  for(const k of ["matches","tournament_matches","playoff_matches"]){if(Array.isArray(payload?.[k]))return payload[k];}
  if(Array.isArray(payload?.brackets)){const out:any[]=[];for(const b of payload.brackets){const rows=Array.isArray(b?.matches)?b.matches:Array.isArray(b?.rounds)?b.rounds.flatMap((r:any)=>Array.isArray(r?.matches)?r.matches:[]):[];for(const m of rows)out.push({...m,division_name:m?.division_name||b?.division_name||b?.name||"Tournament"});}return out;}
  return [];
}
function tournamentRoundLabel(m:any){return String(m?.round_label||m?.round_name||m?.round||m?.stage||"Tournament Match").replace(/_/g," ");}
function normalizeRulebook(payload:any){const icons=["◆","🎯","★","▤","◷","!","✓","⚙","↩","🏆","↕","◉","⚖","▥","◈"];const raw=Array.isArray(payload?.sections)?payload.sections:[];const sections=raw.map((r:any,i:number)=>({n:String(r?.Number??r?.number??r?.n??i+1).padStart(2,"0"),title:String(r?.Title??r?.title??`Rule ${i+1}`),icon:icons[i%icons.length],items:Array.isArray(r?.Items)?r.Items.map(String):Array.isArray(r?.items)?r.items.map(String):[]}));return{title:String(payload?.title||"US AutoDarts League — Rules v1.0 Draft"),version:String(payload?.version||"1.0 Draft"),sections:sections.length?sections:leagueRules};}
function normalizeAwardCatalog(payload:any){const raw=Array.isArray(payload)?payload:Array.isArray(payload?.catalog)?payload.catalog:Array.isArray(payload?.awards)?payload.awards:[];return raw.map((a:any)=>({type:String(a.type||a.code||a.id||"award"),category:String(a.category||"Special Achievements"),name:String(a.name||a.title||"Award"),detail:String(a.detail||a.description||a.how_to_earn||a.earning_rule||"See league server for award requirements."),image_url:String(a.image_url||a.artwork_url||a.image||""),active:a.active!==false})).filter((a:any)=>a.active);}
function absoluteAwardUrl(value:any){const raw=String(value||"").trim();if(!raw)return"";if(/^https?:\/\//i.test(raw))return raw;return `${API_BASE_URL}${raw.startsWith("/")?raw:`/${raw}`}`;}

function normalizedServerRole(player:any){
  const raw=String(player?.server_role||player?.role||"player").toLowerCase().trim();
  return raw==="admin"?"manager":raw;
}

const SwipeNavigationContext=React.createContext<any>(null);

function SwipeNavigationProvider({children,onSwipeRight,onSwipeLeft,enabled=true}:{children:any;onSwipeRight:()=>void;onSwipeLeft:()=>void;enabled?:boolean}){
  const lastFire=useRef(0);
  const fire=(direction:"right"|"left")=>{
    if(!enabled)return;
    const now=Date.now();
    if(now-lastFire.current<280)return;
    lastFire.current=now;
    if(direction==="right")onSwipeRight();else onSwipeLeft();
  };
  return <SwipeNavigationContext.Provider value={{enabled,fire}}>{children}</SwipeNavigationContext.Provider>;
}

function useDirectSwipeObserver(){
  const nav=React.useContext(SwipeNavigationContext);
  const start=useRef<{x:number;y:number;t:number}|null>(null);
  const fired=useRef(false);
  const point=(event:any)=>{const e=event?.nativeEvent||{};return{x:Number(e.pageX??e.locationX??0),y:Number(e.pageY??e.locationY??0)}};
  const begin=(event:any)=>{const p=point(event);start.current={...p,t:Date.now()};fired.current=false;};
  const move=(event:any)=>{
    if(!nav?.enabled||fired.current||!start.current)return;
    const p=point(event),dx=p.x-start.current.x,dy=p.y-start.current.y;
    // Fire while the finger is still moving. This avoids relying on a release event
    // that Android ScrollView can consume after it becomes the native responder.
    if(Math.abs(dx)>=42&&Math.abs(dx)>Math.max(18,Math.abs(dy)*1.12)){
      fired.current=true;
      nav.fire(dx>0?"right":"left");
    }
  };
  const end=(event:any)=>{
    if(!nav?.enabled||fired.current||!start.current){start.current=null;return;}
    const p=point(event),st=start.current;start.current=null;
    const dx=p.x-st.x,dy=p.y-st.y,elapsed=Math.max(1,Date.now()-st.t);
    if(Math.abs(dx)>=30&&elapsed<=650&&Math.abs(dx)>Math.max(14,Math.abs(dy)*1.05)){
      fired.current=true;
      nav.fire(dx>0?"right":"left");
    }
  };
  const cancel=()=>{start.current=null;fired.current=false;};
  return{begin,move,end,cancel};
}

// Every app screen already uses ScrollView. Making the ScrollView itself observe
// the touch stream means Android cannot hide the gesture from navigation.
function ScrollView(props:any){
  const swipe=useDirectSwipeObserver();
  const{onTouchStart,onTouchMove,onTouchEnd,onTouchCancel,onStartShouldSetResponderCapture,onMoveShouldSetResponderCapture,...rest}=props;
  return <RNScrollView
    {...rest}
    onTouchStart={(e:any)=>{swipe.begin(e);onTouchStart?.(e)}}
    onTouchMove={(e:any)=>{swipe.move(e);onTouchMove?.(e)}}
    onTouchEnd={(e:any)=>{swipe.end(e);onTouchEnd?.(e)}}
    onTouchCancel={(e:any)=>{swipe.cancel();onTouchCancel?.(e)}}
    onStartShouldSetResponderCapture={(e:any)=>{swipe.begin(e);return onStartShouldSetResponderCapture?.(e)??false}}
    onMoveShouldSetResponderCapture={(e:any)=>{swipe.move(e);return onMoveShouldSetResponderCapture?.(e)??false}}
  />;
}

function SwipeTouchSurface({children,style}:{children:any;style?:any}){
  const swipe=useDirectSwipeObserver();
  return <View style={style} onTouchStart={swipe.begin} onTouchMove={swipe.move} onTouchEnd={swipe.end} onTouchCancel={swipe.cancel}>{children}</View>;
}

function ModeratorServerPanel({currentPlayer,onBack}:{currentPlayer:any;onBack:()=>void}){
  const[area,setAreaRaw]=useState("Dashboard");
  const[loading,setLoading]=useState(false);const[error,setError]=useState("");const[data,setData]=useState<any>(null);
  const[players,setPlayers]=useState<any[]>([]);const[divisions,setDivisions]=useState<any[]>([]);const[form,setForm]=useState<Record<string,string>>({});
  const backRef=useRef<string[]>([]),forwardRef=useRef<string[]>([]);const areaRef=useRef(area);areaRef.current=area;const isModerator=normalizedServerRole(currentPlayer)==="moderator";
  const setField=(k:string,v:string)=>setForm(p=>({...p,[k]:v}));
  const goto=(next:string)=>{const current=areaRef.current;if(next===current)return;backRef.current.push(current);forwardRef.current=[];setForm({});setAreaRaw(next)};
  const back=()=>{const current=areaRef.current;if(current==="Dashboard"){onBack();return}const prev=backRef.current.pop()||"Dashboard";forwardRef.current.push(current);setForm({});setAreaRaw(prev)};
  const forward=()=>{const current=areaRef.current;const next=forwardRef.current.pop();if(!next)return;backRef.current.push(current);setForm({});setAreaRaw(next)};
  useEffect(()=>{const sub=BackHandler.addEventListener("hardwareBackPress",()=>{back();return true});return()=>sub.remove()},[]);

  const load=async(target=areaRef.current)=>{if(!isModerator)return;setLoading(true);setError("");try{let result:any=null;if(target==="Dashboard"){const[p,m]=await Promise.all([apiRequest("/api/moderator/players"),apiRequest("/api/moderator/matches")]);setPlayers(Array.isArray(p)?p:[]);result={players:Array.isArray(p)?p:[],matches:Array.isArray(m)?m:[]};}else if(target==="Players"){const[p,d]=await Promise.all([apiRequest("/api/moderator/players"),apiRequest("/api/moderator/divisions")]);setPlayers(Array.isArray(p)?p:[]);setDivisions(Array.isArray(d)?d:[]);result=Array.isArray(p)?p:[];}else if(target==="Matches"){const[m,p]=await Promise.all([apiRequest("/api/moderator/matches"),apiRequest("/api/moderator/players")]);setPlayers(Array.isArray(p)?p:[]);result=Array.isArray(m)?m:[];}setData(result);}catch(e:any){setError(String(e?.message||e||"Could not load moderator tools."));}finally{setLoading(false)}};
  useEffect(()=>{load(area)},[area]);
  const mutate=async(path:string,options:any,success:string)=>{setLoading(true);setError("");try{await apiRequest(path,options);Alert.alert("Server updated",success);setForm({});await load(areaRef.current);}catch(e:any){setError(String(e?.message||e||"Server update failed."));}finally{setLoading(false)}};
  const shell=(node:any)=><SwipeNavigationProvider onSwipeRight={back} onSwipeLeft={forward}><SwipeTouchSurface style={{flex:1}}>{node}</SwipeTouchSurface></SwipeNavigationProvider>;
  const top=<><Pressable onPress={back}><Text style={s.backLink}>{area==="Dashboard"?"‹ BACK TO SETTINGS":"‹ MODERATOR TOOLS"}</Text></Pressable><View style={s.managerHeader}><View style={[s.serverDot,{backgroundColor:error?"#ff453a":"#39d353"}]}/><View style={{flex:1}}><Text style={s.managerHeaderTitle}>SERVER MODERATOR</Text><Text style={s.managerHeaderSub}>{API_BASE_URL} • {currentPlayer?.display_name||currentPlayer?.username||"Moderator"}</Text></View><Pressable onPress={()=>load(area)}><Text style={s.serverRefresh}>↻</Text></Pressable></View></>;
  const busy=loading?<Text style={s.managerLoading}>CONNECTING / SYNCING…</Text>:null;const err=error?<View style={s.managerError}><Text style={s.managerErrorTitle}>SERVER MESSAGE</Text><Text style={s.managerErrorText}>{error}</Text></View>:null;
  if(!isModerator)return shell(<ScrollView><Pressable onPress={onBack}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable><Text style={s.title}>Server</Text><Text style={s.emptyStateText}>Moderator access required.</Text></ScrollView>);
  if(area==="Dashboard"){const pp=Array.isArray(data?.players)?data.players:[],mm=Array.isArray(data?.matches)?data.matches:[];return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Moderator Tools</Text><Text style={s.managerLead}>Moderators can add player accounts, reset player passwords, reschedule server-generated matches, and enter match results. Moderators cannot create matches.</Text>{busy}{err}<View style={s.managerMetricGrid}>{[["PLAYERS",pp.length],["MATCHES",mm.length],["ACCESS","LIMITED"]].map((x:any)=><View key={x[0]} style={s.managerMetric}><Text style={s.managerMetricLabel}>{x[0]}</Text><Text style={s.managerMetricValue}>{String(x[1])}</Text></View>)}</View>{[["Players","👥","Add player accounts and reset passwords"],["Matches","🎯","Reschedule generated matches and enter results"]].map((x:any)=><Pressable key={x[0]} style={s.managerMenuRow} onPress={()=>goto(x[0])}><View style={s.managerMenuIcon}><Text>{x[1]}</Text></View><View style={{flex:1}}><Text style={s.managerMenuTitle}>{x[0]}</Text><Text style={s.managerMenuSub}>{x[2]}</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>)}</ScrollView>)}
  if(area==="Players"){const divisionOptions=[{value:"0",label:"Unassigned"},...divisions.map((d:any)=>({value:String(d.id),label:String(d.name)}))];const add=()=>{if(!form.display_name?.trim()||!form.username?.trim()||!form.password){Alert.alert("Missing information","Display name, username and a 6+ character password are required.");return}mutate("/api/moderator/players",{method:"POST",body:JSON.stringify({display_name:form.display_name.trim(),username:form.username.trim(),email:(form.email||"").trim(),password:form.password,division_id:Number(form.division_id||0),timezone:form.timezone||"America/New_York"})},"Player account added.")};return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Players</Text>{busy}{err}<View style={s.managerForm}><Text style={s.managerFormTitle}>ADD PLAYER</Text><TextInput style={s.managerInput} placeholder="Display Name" placeholderTextColor="#6f8597" value={form.display_name||""} onChangeText={v=>setField("display_name",v)}/><TextInput style={s.managerInput} placeholder="AutoDarts / League Username" placeholderTextColor="#6f8597" autoCapitalize="none" value={form.username||""} onChangeText={v=>setField("username",v)}/><TextInput style={s.managerInput} placeholder="Email (optional)" placeholderTextColor="#6f8597" value={form.email||""} onChangeText={v=>setField("email",v)}/><TextInput style={s.managerInput} placeholder="Temporary Password" placeholderTextColor="#6f8597" secureTextEntry value={form.password||""} onChangeText={v=>setField("password",v)}/><ChoiceDropdown label="Division" value={form.division_id||"0"} options={divisionOptions} onChange={v=>setField("division_id",v)}/><ChoiceDropdown label="Time Zone" value={form.timezone||"America/New_York"} options={US_TIME_ZONES} onChange={v=>setField("timezone",v)}/><Pressable style={s.managerPrimary} onPress={add}><Text style={s.managerButtonText}>ADD PLAYER</Text></Pressable></View><Text style={s.managerSection}>PASSWORD RESETS</Text>{players.map((p:any)=><View key={p.id} style={s.managerListCard}><Text style={s.managerListTitle}>{p.display_name}</Text><Text style={s.managerListSub}>@{p.username} • {p.division_name||"Unassigned"}</Text><View style={s.managerResetRow}><TextInput style={[s.managerInput,{flex:1,marginBottom:0}]} placeholder="New password" placeholderTextColor="#6f8597" secureTextEntry value={form[`pw_${p.id}`]||""} onChangeText={v=>setField(`pw_${p.id}`,v)}/><Pressable style={s.managerDanger} onPress={()=>{const pw=form[`pw_${p.id}`]||"";if(pw.length<6){Alert.alert("Password","Enter at least 6 characters.");return}mutate(`/api/moderator/players/${p.id}/reset-password`,{method:"POST",body:JSON.stringify({password:pw})},"Password reset.")}}><Text style={s.managerButtonText}>RESET</Text></Pressable></View></View>)}</ScrollView>)}
  if(area==="Matches"){const rows=Array.isArray(data)?data:[];const matchOptions=rows.map((m:any)=>({value:String(m.id),label:`#${m.id} • ${m.player1_name} vs ${m.player2_name} • W${m.week_no||"—"}`}));const selected=rows.find((m:any)=>String(m.id)===String(form.match_id));const resultValue=form.result||"";return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Matches & Results</Text>{busy}{err}<View style={s.managerNotice}><Text style={s.managerNoticeTitle}>SERVER-GENERATED MATCHES ONLY</Text><Text style={s.managerNoticeText}>Moderators cannot create matches. Select an existing match to reschedule it or enter its result.</Text></View><ChoiceDropdown label="Match" value={form.match_id||""} options={matchOptions} onChange={v=>setField("match_id",v)} placeholder="Choose generated match"/>{selected?<View style={s.managerForm}><Text style={s.managerFormTitle}>{selected.player1_name} vs {selected.player2_name}</Text><Text style={s.managerListSub}>{selected.season_name||"Season"} • Week {selected.week_no||"—"} • Best of {selected.best_of||5}</Text><TextInput style={s.managerInput} placeholder="Match date YYYY-MM-DD" placeholderTextColor="#6f8597" value={form.scheduled_date??easternDateValue(selected)} onChangeText={v=>setField("scheduled_date",v)}/><ChoiceDropdown label="Match Time (Eastern)" value={form.scheduled_time_eastern??easternTimeValue(selected)} options={TIME_OPTIONS} onChange={v=>setField("scheduled_time_eastern",v)}/><Pressable style={s.managerPrimary} onPress={()=>mutate(`/api/moderator/matches/${selected.id}`,{method:"PUT",body:JSON.stringify({scheduled_date:form.scheduled_date??easternDateValue(selected),scheduled_time_eastern:form.scheduled_time_eastern??easternTimeValue(selected)})},"Match rescheduled.")}><Text style={s.managerButtonText}>SAVE RESCHEDULE</Text></Pressable><ChoiceDropdown label="Final Result" value={resultValue} options={legalResultOptions(selected.best_of)} onChange={v=>setField("result",v)} placeholder="Choose final score"/><Pressable style={s.managerPrimary} onPress={()=>{if(!form.result){Alert.alert("Result","Choose the final score first.");return}mutate(`/api/moderator/matches/${selected.id}/result`,{method:"POST",body:JSON.stringify({result:form.result})},"Match result saved.")}}><Text style={s.managerButtonText}>SAVE RESULT</Text></Pressable></View>:null}</ScrollView>)}
  return shell(<ScrollView>{top}{err}</ScrollView>);
}

function ManagerServerPanel({currentPlayer,onBack,onOpenPlayer}:{currentPlayer:any;onBack:()=>void;onOpenPlayer:(name:string,playerId:number)=>void}){
  const[area,setAreaRaw]=useState("Dashboard");const[loading,setLoading]=useState(false);const[error,setError]=useState("");const[data,setData]=useState<any>(null);const[form,setForm]=useState<Record<string,string>>({});const[players,setPlayers]=useState<any[]>([]);const[divisions,setDivisions]=useState<any[]>([]);const[seasons,setSeasons]=useState<any[]>([]);
  const backRef=useRef<string[]>([]),forwardRef=useRef<string[]>([]);const areaRef=useRef(area);areaRef.current=area;const isManager=normalizedServerRole(currentPlayer)==="manager";
  const ManagerPlayerLink=({name,playerId=0}:{name:string;playerId?:number})=>Number(playerId)>0?<Pressable onPress={()=>onOpenPlayer(name,Number(playerId))}><Text style={s.inlinePlayerLink}>{name}</Text></Pressable>:<Text style={s.managerBodyText}>{name}</Text>;
  const setField=(k:string,v:string)=>setForm(p=>({...p,[k]:v}));const goto=(next:string)=>{const current=areaRef.current;if(next===current)return;backRef.current.push(current);forwardRef.current=[];setForm({});setAreaRaw(next)};const back=()=>{const current=areaRef.current;if(current==="Dashboard"){onBack();return}const prev=backRef.current.pop()||"Dashboard";forwardRef.current.push(current);setForm({});setAreaRaw(prev)};const forward=()=>{const current=areaRef.current;const next=forwardRef.current.pop();if(!next)return;backRef.current.push(current);setForm({});setAreaRaw(next)};
  useEffect(()=>{const sub=BackHandler.addEventListener("hardwareBackPress",()=>{back();return true});return()=>sub.remove()},[]);

  const load=async(target=areaRef.current)=>{if(!isManager)return;setLoading(true);setError("");try{let result:any=null;if(target==="Dashboard")result=await apiRequest("/api/admin/dashboard");else if(target==="Season Setup"){const x=await apiRequest("/api/admin/seasons");setSeasons(Array.isArray(x?.seasons)?x.seasons:[]);result=x;}else if(target==="Players"){const[p,d]=await Promise.all([apiRequest("/api/admin/players"),apiRequest("/api/admin/divisions")]);setPlayers(Array.isArray(p)?p:[]);setDivisions(Array.isArray(d)?d:[]);result={players:Array.isArray(p)?p:[],divisions:Array.isArray(d)?d:[]};}else if(target==="Divisions"){const[d,p]=await Promise.all([apiRequest("/api/admin/divisions"),apiRequest("/api/admin/players")]);setDivisions(Array.isArray(d)?d:[]);setPlayers(Array.isArray(p)?p:[]);result={divisions:Array.isArray(d)?d:[],players:Array.isArray(p)?p:[]};}else if(target==="Matches"){const[m,p,d,se]=await Promise.all([apiRequest("/api/admin/matches"),apiRequest("/api/admin/players"),apiRequest("/api/admin/divisions"),apiRequest("/api/admin/seasons")]);setPlayers(Array.isArray(p)?p:[]);setDivisions(Array.isArray(d)?d:[]);setSeasons(Array.isArray(se?.seasons)?se.seasons:[]);result=Array.isArray(m)?m:[];}else if(target==="Tournaments / Playoffs"){const m=await apiRequest("/api/admin/matches");result=Array.isArray(m)?m:[];}else if(target==="Create Tournament"){const[t,p]=await Promise.all([apiRequest("/api/admin/manager-tournament"),apiRequest("/api/admin/players")]);setPlayers(Array.isArray(p)?p:[]);result=t;}else if(target==="Standings"){const[d,se]=await Promise.all([apiRequest("/api/admin/divisions"),apiRequest("/api/admin/seasons")]);setDivisions(Array.isArray(d)?d:[]);setSeasons(Array.isArray(se?.seasons)?se.seasons:[]);result=[];}else if(target==="Rules")result=await apiRequest("/api/admin/rules");else if(target==="Trophies & Badges"){try{result=await apiRequest("/api/award-catalog")}catch{result=bundledAwardCatalog}}else if(target==="Announcements")result=await apiRequest("/api/admin/announcements");else if(target==="Backups")result=await apiRequest("/api/admin/backups");else if(target==="League Settings")result=await apiRequest("/api/admin/settings");else if(target==="Audit Log")result=await apiRequest("/api/admin/audit");else if(target==="Tunnel & API")result=await apiRequest("/api/admin/tunnel");setData(result);}catch(e:any){setError(String(e?.message||e||"Could not load manager tools."));}finally{setLoading(false)}};
  useEffect(()=>{load(area)},[area]);const mutate=async(path:string,options:any,success:string)=>{setLoading(true);setError("");try{await apiRequest(path,options);Alert.alert("Server updated",success);setForm({});await load(areaRef.current);}catch(e:any){setError(String(e?.message||e||"Server update failed."));}finally{setLoading(false)}};const deleteSeasonRemote=async(id:number)=>{setLoading(true);setError("");try{await apiRequest(`/api/admin/seasons/${id}`,{method:"DELETE",timeoutMs:120000});Alert.alert("Server updated","Season deleted.");setForm({});await load("Season Setup");}catch(e:any){const raw=String(e?.message||e||"");const aborted=e?.name==="AbortError"||raw.toLowerCase().includes("abort");if(aborted){try{const check=await apiRequest("/api/admin/seasons",{timeoutMs:120000});const rows=Array.isArray(check?.seasons)?check.seasons:[];setSeasons(rows);setData(check);if(!rows.some((x:any)=>Number(x.id)===Number(id))){setForm({});Alert.alert("Server updated","Season deleted.");return;}}catch{}}setError(`Could not delete season: ${raw||"Server request failed."}`);}finally{setLoading(false)}};const confirm=(title:string,message:string,action:()=>void)=>Alert.alert(title,message,[{text:"Cancel",style:"cancel"},{text:"Confirm",style:"destructive",onPress:action}]);const shell=(node:any)=><SwipeNavigationProvider onSwipeRight={back} onSwipeLeft={forward}><SwipeTouchSurface style={{flex:1}}>{node}</SwipeTouchSurface></SwipeNavigationProvider>;
  const top=<><Pressable onPress={back}><Text style={s.backLink}>{area==="Dashboard"?"‹ BACK TO SETTINGS":"‹ MANAGER TOOLS"}</Text></Pressable><View style={s.managerHeader}><View style={[s.serverDot,{backgroundColor:error?"#ff453a":"#39d353"}]}/><View style={{flex:1}}><Text style={s.managerHeaderTitle}>SERVER MANAGER</Text><Text style={s.managerHeaderSub}>{API_BASE_URL} • {currentPlayer?.display_name||currentPlayer?.username||"Manager"}</Text></View><Pressable onPress={()=>load(area)}><Text style={s.serverRefresh}>↻</Text></Pressable></View></>;const busy=loading?<Text style={s.managerLoading}>CONNECTING / SYNCING…</Text>:null;const err=error?<View style={s.managerError}><Text style={s.managerErrorTitle}>SERVER MESSAGE</Text><Text style={s.managerErrorText}>{error}</Text></View>:null;
  if(!isManager)return shell(<ScrollView><Pressable onPress={onBack}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable><Text style={s.title}>Server</Text><Text style={s.emptyStateText}>Manager access required.</Text></ScrollView>);
  if(area==="Dashboard"){const d=data||{};const menu=[["Season Setup","📅","Create, edit, delete, generate and test seasons"],["Players","👥","Add and edit player accounts"],["Divisions","🛡","Manage divisions and membership"],["Matches","🎯","Edit/reschedule server-generated matches and results"],["Tournaments / Playoffs","🏆","View official tournament and playoff matches"],["Create Tournament","🏅","Create and manage manager-created tournaments"],["Standings","🏆","View or rebuild standings"],["Rules","📘","View server-authoritative rule set"],["Trophies & Badges","🏅","View server award catalog"],["Announcements","📣","Publish announcements"],["Backups","💾","Create and review backups"],["League Settings","⚙","Rule-safe server settings"],["Tunnel & API","☁","View API/tunnel status"],["Audit Log","▤","Review server changes"]];return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Manager Tools</Text><Text style={s.managerLead}>The server creates regular-season matches and playoff brackets. The manager app edits/reschedules existing matches but never creates a match manually.</Text>{busy}{err}<View style={s.managerMetricGrid}>{[["PLAYERS",d.players??0],["DIVISIONS",d.divisions??0],["MATCHES",d.matches??0],["PENDING",d.pending??0]].map((x:any)=><View key={x[0]} style={s.managerMetric}><Text style={s.managerMetricLabel}>{x[0]}</Text><Text style={s.managerMetricValue}>{String(x[1])}</Text></View>)}</View>{menu.map((x:any)=><Pressable key={x[0]} style={s.managerMenuRow} onPress={()=>goto(x[0])}><View style={s.managerMenuIcon}><Text>{x[1]}</Text></View><View style={{flex:1}}><Text style={s.managerMenuTitle}>{x[0]}</Text><Text style={s.managerMenuSub}>{x[2]}</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>)}</ScrollView>)}
  if(area==="Season Setup"){const payload=data||{};const rows=Array.isArray(payload?.seasons)?payload.seasons:seasons;const seasonOptions=[{value:"new",label:"+ New Season"},...rows.map((x:any)=>({value:String(x.id),label:`${x.name} (${x.year}) • ${x.status}`}))];const selected=rows.find((x:any)=>String(x.id)===String(form.season_select));const val=(k:string,def="")=>form[k]??(selected?String(selected[k]??def):def);const choose=(v:string)=>{if(v==="new"){setForm({season_select:"new",status:"draft",schedule_type:"single",match_day:"Thursday",match_time_eastern:"19:00",playoff_day:"Thursday",playoff_time_eastern:"19:00"});return}const x=rows.find((q:any)=>String(q.id)===v);if(!x)return;setForm({season_select:v,name:String(x.name||""),year:String(x.year||""),status:String(x.status||"draft"),start_date:String(x.start_date||""),schedule_type:String(x.schedule_type||"single"),match_day:String(x.match_day||"Thursday"),match_time_eastern:String(x.match_time_eastern||"19:00"),playoff_day:String(x.playoff_day||x.match_day||"Thursday"),playoff_time_eastern:String(x.playoff_time_eastern||x.match_time_eastern||"19:00")})};const save=()=>{const body={name:val("name"),year:Number(val("year")||new Date().getFullYear()),status:val("status","draft"),start_date:val("start_date"),schedule_type:val("schedule_type","single"),match_day:val("match_day","Thursday"),match_time_eastern:val("match_time_eastern","19:00"),playoff_day:val("playoff_day","Thursday"),playoff_time_eastern:val("playoff_time_eastern","19:00")};if(!body.name||!body.start_date){Alert.alert("Season","Season name and Week 1 start date are required.");return}if(selected)mutate(`/api/admin/seasons/${selected.id}`,{method:"PUT",body:JSON.stringify(body)},"Season updated.");else mutate("/api/admin/seasons",{method:"POST",body:JSON.stringify(body)},"Season created.")};return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Season Setup</Text>{busy}{err}<ChoiceDropdown label="Season" value={form.season_select||"new"} options={seasonOptions} onChange={choose}/><View style={s.managerForm}><TextInput style={s.managerInput} placeholder="Season Name" placeholderTextColor="#6f8597" value={val("name")} onChangeText={v=>setField("name",v)}/><TextInput style={s.managerInput} placeholder="Year" placeholderTextColor="#6f8597" keyboardType="numeric" value={val("year",String(new Date().getFullYear()))} onChangeText={v=>setField("year",v)}/><ChoiceDropdown label="Status" value={val("status","draft")} options={SEASON_STATUS_OPTIONS} onChange={v=>setField("status",v)}/><TextInput style={s.managerInput} placeholder="Week 1 Start Date YYYY-MM-DD" placeholderTextColor="#6f8597" value={val("start_date")} onChangeText={v=>setField("start_date",v)}/><ChoiceDropdown label="Schedule Type" value={val("schedule_type","single")} options={SCHEDULE_TYPE_OPTIONS} onChange={v=>setField("schedule_type",v)}/><ChoiceDropdown label="Regular Match Day" value={val("match_day","Thursday")} options={WEEKDAY_OPTIONS} onChange={v=>setField("match_day",v)}/><ChoiceDropdown label="Regular Match Time" value={val("match_time_eastern","19:00")} options={TIME_OPTIONS} onChange={v=>setField("match_time_eastern",v)}/><ChoiceDropdown label="Playoff Day" value={val("playoff_day","Thursday")} options={WEEKDAY_OPTIONS} onChange={v=>setField("playoff_day",v)}/><ChoiceDropdown label="Playoff Time" value={val("playoff_time_eastern","19:00")} options={TIME_OPTIONS} onChange={v=>setField("playoff_time_eastern",v)}/><Pressable style={s.managerPrimary} onPress={save}><Text style={s.managerButtonText}>{selected?"SAVE SEASON CHANGES":"CREATE SEASON"}</Text></Pressable>{selected?<><View style={s.managerButtonRow}><Pressable style={s.managerSecondary} onPress={()=>confirm("Generate Schedule","This regenerates this season's server-created regular-season schedule.",()=>mutate(`/api/admin/seasons/${selected.id}/generate`,{method:"POST"},"Season schedule generated."))}><Text style={s.managerButtonText}>GENERATE / REGENERATE</Text></Pressable><Pressable style={s.managerSecondary} onPress={()=>mutate(`/api/admin/seasons/${selected.id}/playoffs`,{method:"POST"},"Eligible playoff matches generated.")}><Text style={s.managerButtonText}>CHECK PLAYOFFS</Text></Pressable></View><Pressable style={s.managerDanger} onPress={()=>confirm("Delete Season","Delete this season and its season matches? This is allowed for testing.",()=>deleteSeasonRemote(Number(selected.id)))}><Text style={s.managerButtonText}>DELETE SEASON</Text></Pressable></>:null}</View><Text style={s.managerHint}>All manager-entered match times are Eastern Time. Player match screens use the time zone stored on each player's server account.</Text></ScrollView>)}
  if(area==="Players"){const pp=Array.isArray(data?.players)?data.players:players,dd=Array.isArray(data?.divisions)?data.divisions:divisions;const playerOptions=[{value:"new",label:"+ New Player"},...pp.map((x:any)=>({value:String(x.id),label:`${x.display_name} (@${x.username})`}))];const selected=pp.find((x:any)=>String(x.id)===String(form.player_select));const divisionOptions=[{value:"0",label:"Unassigned"},...dd.map((x:any)=>({value:String(x.id),label:String(x.name)}))];const choose=(v:string)=>{if(v==="new"){setForm({player_select:"new",role:"player",active:"true",timezone:"America/New_York",division_id:"0"});return}const x=pp.find((q:any)=>String(q.id)===v);if(x)setForm({player_select:v,display_name:String(x.display_name||""),username:String(x.username||""),email:String(x.email||""),role:String(x.role||"player"),active:String(x.active!==false),timezone:String(x.timezone||"America/New_York"),division_id:String(x.division_id||0)})};const save=()=>{if(!form.display_name?.trim()||!form.username?.trim()){Alert.alert("Player","Display name and username are required.");return}const body:any={display_name:form.display_name.trim(),username:form.username.trim(),email:form.email||"",role:form.role||"player",active:form.active!=="false",timezone:form.timezone||"America/New_York",division_id:Number(form.division_id||0)};if(selected)mutate(`/api/admin/players/${selected.id}`,{method:"PUT",body:JSON.stringify(body)},"Player updated.");else{if((form.password||"").length<6){Alert.alert("Password","New players need a 6+ character password.");return}body.password=form.password;mutate("/api/admin/players",{method:"POST",body:JSON.stringify(body)},"Player created.")}};return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Players</Text>{busy}{err}<ChoiceDropdown label="Player" value={form.player_select||"new"} options={playerOptions} onChange={choose}/><View style={s.managerForm}><TextInput style={s.managerInput} placeholder="Display Name" placeholderTextColor="#6f8597" value={form.display_name||""} onChangeText={v=>setField("display_name",v)}/><TextInput style={s.managerInput} placeholder="AutoDarts / League Username" placeholderTextColor="#6f8597" value={form.username||""} onChangeText={v=>setField("username",v)}/><TextInput style={s.managerInput} placeholder="Email" placeholderTextColor="#6f8597" value={form.email||""} onChangeText={v=>setField("email",v)}/>{!selected?<TextInput style={s.managerInput} placeholder="Temporary Password" placeholderTextColor="#6f8597" secureTextEntry value={form.password||""} onChangeText={v=>setField("password",v)}/>:null}<ChoiceDropdown label="Role" value={form.role||"player"} options={ROLE_OPTIONS} onChange={v=>setField("role",v)}/><ChoiceDropdown label="Account Status" value={form.active||"true"} options={ACTIVE_OPTIONS} onChange={v=>setField("active",v)}/><ChoiceDropdown label="Division" value={form.division_id||"0"} options={divisionOptions} onChange={v=>setField("division_id",v)}/><ChoiceDropdown label="Time Zone" value={form.timezone||"America/New_York"} options={US_TIME_ZONES} onChange={v=>setField("timezone",v)}/><Pressable style={s.managerPrimary} onPress={save}><Text style={s.managerButtonText}>{selected?"SAVE PLAYER":"ADD PLAYER"}</Text></Pressable>{selected?<><TextInput style={s.managerInput} placeholder="New password (optional)" placeholderTextColor="#6f8597" secureTextEntry value={form.reset_password||""} onChangeText={v=>setField("reset_password",v)}/><Pressable style={s.managerDanger} onPress={()=>{if((form.reset_password||"").length<6){Alert.alert("Password","Enter at least 6 characters.");return}mutate(`/api/admin/players/${selected.id}/reset-password`,{method:"POST",body:JSON.stringify({password:form.reset_password})},"Password reset.")}}><Text style={s.managerButtonText}>RESET PASSWORD</Text></Pressable></>:null}</View></ScrollView>)}
  if(area==="Divisions"){const dd=Array.isArray(data?.divisions)?data.divisions:divisions,pp=Array.isArray(data?.players)?data.players:players;const divisionOptions=[{value:"new",label:"+ New Division"},...dd.map((x:any)=>({value:String(x.id),label:String(x.name)}))];const selected=dd.find((x:any)=>String(x.id)===String(form.division_select));const assigned=selected?pp.filter((x:any)=>Number(x.division_id)===Number(selected.id)):[];const playerOptions=pp.filter((x:any)=>!selected||Number(x.division_id)!==Number(selected.id)).map((x:any)=>({value:String(x.id),label:`${x.display_name} • ${x.division_name||"Unassigned"}`}));const choose=(v:string)=>{if(v==="new")setForm({division_select:"new",capacity:"12"});else{const x=dd.find((q:any)=>String(q.id)===v);if(x)setForm({division_select:v,name:String(x.name||""),capacity:String(x.capacity||12)})}};const save=()=>{if(!form.name?.trim()){Alert.alert("Division","Enter a division name.");return}const body={name:form.name.trim(),capacity:Number(form.capacity||12)};if(selected)mutate(`/api/admin/divisions/${selected.id}`,{method:"PUT",body:JSON.stringify(body)},"Division updated.");else mutate("/api/admin/divisions",{method:"POST",body:JSON.stringify(body)},"Division created.")};return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Divisions</Text>{busy}{err}<ChoiceDropdown label="Division" value={form.division_select||"new"} options={divisionOptions} onChange={choose}/><View style={s.managerForm}><TextInput style={s.managerInput} placeholder="Division Name" placeholderTextColor="#6f8597" value={form.name||""} onChangeText={v=>setField("name",v)}/><ChoiceDropdown label="Capacity" value={form.capacity||"12"} options={CAPACITY_OPTIONS} onChange={v=>setField("capacity",v)}/><Pressable style={s.managerPrimary} onPress={save}><Text style={s.managerButtonText}>{selected?"SAVE DIVISION":"ADD DIVISION"}</Text></Pressable></View>{selected?<><Text style={s.managerSection}>ASSIGNED PLAYERS</Text>{assigned.map((x:any)=><View key={x.id} style={s.managerListCard}><Text style={s.managerListTitle}>{x.display_name}</Text><Pressable style={s.managerDanger} onPress={()=>mutate(`/api/admin/divisions/${selected.id}/players/${x.id}`,{method:"DELETE"},"Player removed from division.")}><Text style={s.managerButtonText}>REMOVE</Text></Pressable></View>)}<ChoiceDropdown label="Add / Move Player" value={form.assign_player||""} options={playerOptions} onChange={v=>setField("assign_player",v)} placeholder="Choose player"/><Pressable style={s.managerPrimary} onPress={()=>{if(!form.assign_player)return;mutate(`/api/admin/divisions/${selected.id}/players`,{method:"POST",body:JSON.stringify({player_id:Number(form.assign_player)})},"Player assigned to division.")}}><Text style={s.managerButtonText}>ADD / MOVE PLAYER</Text></Pressable></>:null}</ScrollView>)}
  if(area==="Matches"){const mm=Array.isArray(data)?data:[];const matchOptions=mm.map((m:any)=>({value:String(m.id),label:`#${m.id} • ${m.player1_name} vs ${m.player2_name} • ${m.season_name||"Season"} W${m.week_no||"—"}`}));const selected=mm.find((x:any)=>String(x.id)===String(form.match_select));const playerOptions=players.map((x:any)=>({value:String(x.id),label:String(x.display_name)})),divisionOptions=divisions.map((x:any)=>({value:String(x.id),label:String(x.name)})),seasonOptions=seasons.map((x:any)=>({value:String(x.id),label:`${x.name} (${x.year})`}));const maxWeek=Math.max(1,Number(seasons.find((x:any)=>Number(x.id)===Number(selected?.season_id))?.regular_weeks||20)+2);const weekOptions=Array.from({length:Math.max(20,maxWeek)},(_,i)=>({value:String(i+1),label:`Week ${i+1}`}));const val=(k:string,def="")=>form[k]??(selected?String(selected[k]??def):def);return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Matches & Results</Text>{busy}{err}<View style={s.managerNotice}><Text style={s.managerNoticeTitle}>NO MANUAL MATCH CREATION</Text><Text style={s.managerNoticeText}>Season Setup generates matches. Manager tools only adjust, reschedule, approve, void, or correct existing matches.</Text></View><ChoiceDropdown label="Generated Match" value={form.match_select||""} options={matchOptions} onChange={v=>{const x=mm.find((q:any)=>String(q.id)===v);if(!x)return;setForm({match_select:v,player1_id:String(x.player1_id),player2_id:String(x.player2_id),season_id:String(x.season_id),division_id:String(x.division_id),week_no:String(x.week_no||1),status:String(x.status||"scheduled"),scheduled_date:easternDateValue(x),scheduled_time_eastern:easternTimeValue(x)})}} placeholder="Choose match to edit"/>{selected?<View style={s.managerForm}><ChoiceDropdown label="Player 1" value={val("player1_id")} options={playerOptions} onChange={v=>setField("player1_id",v)}/><ChoiceDropdown label="Player 2" value={val("player2_id")} options={playerOptions} onChange={v=>setField("player2_id",v)}/><ChoiceDropdown label="Season" value={val("season_id")} options={seasonOptions} onChange={v=>setField("season_id",v)}/><ChoiceDropdown label="Division" value={val("division_id")} options={divisionOptions} onChange={v=>setField("division_id",v)}/><ChoiceDropdown label="Week" value={val("week_no","1")} options={weekOptions} onChange={v=>setField("week_no",v)}/><TextInput style={s.managerInput} placeholder="Match Date YYYY-MM-DD" placeholderTextColor="#6f8597" value={val("scheduled_date",easternDateValue(selected))} onChangeText={v=>setField("scheduled_date",v)}/><ChoiceDropdown label="Match Time (Eastern)" value={val("scheduled_time_eastern",easternTimeValue(selected))} options={TIME_OPTIONS} onChange={v=>setField("scheduled_time_eastern",v)}/><ChoiceDropdown label="Status" value={val("status","scheduled")} options={MATCH_STATUS_OPTIONS} onChange={v=>setField("status",v)}/><Pressable style={s.managerPrimary} onPress={()=>mutate(`/api/admin/matches/${selected.id}`,{method:"PUT",body:JSON.stringify({player1_id:Number(val("player1_id")),player2_id:Number(val("player2_id")),season_id:Number(val("season_id")),division_id:Number(val("division_id")),week_no:Number(val("week_no")),scheduled_date:val("scheduled_date"),scheduled_time_eastern:val("scheduled_time_eastern"),status:val("status","scheduled")})},"Match changes saved.")}><Text style={s.managerButtonText}>SAVE MATCH CHANGES</Text></Pressable><ChoiceDropdown label="Final Result" value={form.result||""} options={legalResultOptions(selected.best_of)} onChange={v=>setField("result",v)} placeholder="Choose final score"/><Pressable style={s.managerPrimary} onPress={()=>{if(!form.result){Alert.alert("Result","Choose a final result.");return}mutate(`/api/admin/matches/${selected.id}/result`,{method:"POST",body:JSON.stringify({result:form.result})},"Result saved.")}}><Text style={s.managerButtonText}>SAVE / CORRECT RESULT</Text></Pressable><View style={s.managerButtonRow}><Pressable style={s.managerSecondary} onPress={()=>mutate(`/api/admin/matches/${selected.id}/approve`,{method:"POST"},"Result approved.")}><Text style={s.managerButtonText}>APPROVE</Text></Pressable><Pressable style={s.managerDanger} onPress={()=>confirm("Void Match","Void this existing match?",()=>mutate(`/api/admin/matches/${selected.id}/void`,{method:"POST"},"Match voided."))}><Text style={s.managerButtonText}>VOID</Text></Pressable></View></View>:null}</ScrollView>)}

  if(area==="Tournaments / Playoffs"){
    const rows=(Array.isArray(data)?data:[]).filter((m:any)=>isTournamentMatch(m));
    return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Tournaments / Playoffs</Text>{busy}{err}<View style={s.managerNotice}><Text style={s.managerNoticeTitle}>OFFICIAL LEAGUE TOURNAMENTS</Text><Text style={s.managerNoticeText}>These are server-generated playoff/tournament matches. Manager-created tournaments stay separate and never change league statistics.</Text></View><Pressable style={s.managerPrimary} onPress={()=>goto("Create Tournament")}><Text style={s.managerButtonText}>CREATE / MANAGE TOURNAMENT</Text></Pressable><Text style={s.managerSection}>OFFICIAL TOURNAMENT / PLAYOFF MATCHES</Text>{rows.length?rows.map((m:any)=><View key={String(m.id)} style={s.managerListCard}><Text style={s.managerListTitle}>{String(m.round_label||m.stage||"Tournament Match")} · #{m.id}</Text><View style={s.matchPlayersLeft}><ManagerPlayerLink name={String(m.player1_name||"TBD")} playerId={Number(m.player1_id||0)}/><Text style={s.managerBodyText}> vs </Text><ManagerPlayerLink name={String(m.player2_name||"TBD")} playerId={Number(m.player2_id||0)}/></View><Text style={s.managerListSub}>{String(m.season_name||"")} • {String(m.division_name||"")} • {String(m.status||"scheduled")}</Text></View>):<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>NO OFFICIAL BRACKET YET</Text><Text style={s.emptyStateText}>Official league playoff/tournament matches will appear after the server generates them.</Text></View>}</ScrollView>);
  }
  if(area==="Create Tournament"){
    const payload=data||{};
    const tournamentList=Array.isArray(payload?.tournaments)?payload.tournaments:(payload?.tournament?[payload.tournament]:[]);
    const selectedTournamentId=Number(form.manager_tournament_select||payload?.tournament?.id||tournamentList[0]?.id||0);
    const t=tournamentList.find((x:any)=>Number(x?.id||0)===selectedTournamentId)||payload?.tournament||tournamentList[0]||null;
    const canCreate=true;
    const editable=!!t&&t.entry_editable!==false;
    const dateOptions=managerTournamentDateOptions();
    const responseRows=Array.isArray(t?.signup_responses)?t.signup_responses:[];
    const responseById=new Map(responseRows.map((r:any)=>[Number(r.player_id),r]));
    const activePlayers=players.filter((p:any)=>p.active!==false);
    const tournamentMatches=Array.isArray(t?.matches)?t.matches:[];
    const existingTiming=managerTournamentEasternParts(t);
    const rescheduleDateKey=t?`tournament_reschedule_date_${t.id}`:"";
    const rescheduleTimeKey=t?`tournament_reschedule_time_${t.id}`:"";
    const rescheduleDate=t?String(form[rescheduleDateKey]??existingTiming.date):"";
    const rescheduleTime=t?String(form[rescheduleTimeKey]??existingTiming.time):"";
    const rescheduleDateOptions=managerTournamentDateOptions(rescheduleDate);
    const create=()=>{
      const name=String(form.tournament_name||"").trim(),date=String(form.tournament_date||""),time=String(form.tournament_time||"");
      if(!name||!date||!time){Alert.alert("Tournament","Choose a tournament name, date, and start time.");return}
      confirm("Create Tournament",`Create ${name} and send Join Tournament / Don't Join to all active league members?`,()=>mutate("/api/admin/manager-tournament",{method:"POST",body:JSON.stringify({name,date,time})},"Tournament created and signup announcement sent."));
    };
    const reschedule=()=>{
      if(!t)return;
      if(!rescheduleDate||!rescheduleTime){Alert.alert("Tournament","Choose the new tournament date and Eastern start time.");return}
      const en=easternNowForTournament();
      const timeLabel=TIME_OPTIONS.find(x=>x.value===rescheduleTime)?.label||rescheduleTime;
      confirm("Reschedule Tournament",`Change ${String(t.name||"this tournament")} to ${rescheduleDate} at ${timeLabel}?`,()=>mutate("/api/admin/manager-tournament",{method:"PUT",body:JSON.stringify({id:Number(t.id),date:rescheduleDate,time:rescheduleTime,client_now_utc:new Date().toISOString(),client_now_eastern_date:en.date,client_now_eastern_time:en.time})},"Tournament date and time updated."));
    };
    const deleteTournament=()=>{
      if(!t)return;
      const name=String(t.name||"this tournament");
      Alert.alert("Delete Tournament",`Delete ${name}? This permanently removes the tournament, bracket, signup responses, and tournament signup announcement.`,[
        {text:"Cancel",style:"cancel"},
        {text:"Continue",style:"destructive",onPress:()=>Alert.alert("Are you sure?",`Permanently delete ${name}?`,[
          {text:"Cancel",style:"cancel"},
          {text:"DELETE",style:"destructive",onPress:()=>mutate("/api/admin/manager-tournament",{method:"DELETE",body:JSON.stringify({id:Number(t.id)})},"Tournament deleted.")}
        ])}
      ]);
    };
    return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Create Tournament</Text>{busy}{err}<View style={s.managerNotice}><Text style={s.managerNoticeTitle}>MANAGER-CREATED TOURNAMENT</Text><Text style={s.managerNoticeText}>Multiple tournaments may run at the same time • Single elimination • Best of 5 • No draws • Separate from regular-season and official tournament statistics.</Text></View>{canCreate?<View style={s.managerForm}><Text style={s.managerFormTitle}>CREATE ANOTHER TOURNAMENT</Text><TextInput style={s.managerInput} placeholder="Tournament Name" placeholderTextColor="#6f8597" value={form.tournament_name||""} onChangeText={v=>setField("tournament_name",v)}/><ChoiceDropdown label="Tournament Date" value={form.tournament_date||""} options={dateOptions} onChange={v=>setField("tournament_date",v)} placeholder="Choose date"/><ChoiceDropdown label="Start Time (Eastern)" value={form.tournament_time||""} options={TIME_OPTIONS} onChange={v=>setField("tournament_time",v)} placeholder="Choose time"/><View style={s.managerNotice}><Text style={s.managerNoticeTitle}>SIGNUP TIMING</Text><Text style={s.managerNoticeText}>If everyone responds early, the bracket is built immediately. Otherwise signup stays open until 10 minutes before start; unanswered players become Don't Join.</Text></View><Pressable style={s.managerPrimary} onPress={create}><Text style={s.managerButtonText}>CREATE & SEND ANNOUNCEMENT</Text></Pressable></View>:null}{tournamentList.length?<ChoiceDropdown label="Manage Tournament" value={String(t?.id||"")} options={tournamentList.map((x:any)=>({value:String(x.id),label:`${String(x.name||"Tournament")} • ${String(x.status||"").replace(/_/g," ")}`}))} onChange={v=>setField("manager_tournament_select",v)} placeholder="Choose tournament"/>:null}{t?<><View style={s.managerListCard}><Text style={s.managerListTitle}>{String(t.name||"Tournament")}</Text><Text style={s.managerListSub}>{String(t.start_label||t.start_at||"")} • {String(t.status||"").toUpperCase()}</Text><Text style={s.managerBodyText}>Signup cutoff: {String(t.signup_cutoff_label||t.signup_cutoff||"")}</Text>{t.champion_name?<View style={s.matchPlayersLeft}><Text style={s.uploadReady}>TOURNAMENT CHAMPION: </Text><ManagerPlayerLink name={String(t.champion_name)} playerId={Number(t.champion_player_id||0)}/></View>:null}</View><View style={s.managerForm}><Text style={s.managerFormTitle}>TOURNAMENT DATE & TIME</Text><ChoiceDropdown label="Change Tournament Date" value={rescheduleDate} options={rescheduleDateOptions} onChange={v=>setField(rescheduleDateKey,v)} placeholder="Choose date"/><ChoiceDropdown label="Change Start Time (Eastern)" value={rescheduleTime} options={TIME_OPTIONS} onChange={v=>setField(rescheduleTimeKey,v)} placeholder="Choose time"/><Pressable disabled={!editable} style={[s.managerPrimary,!editable&&{opacity:.35}]} onPress={reschedule}><Text style={s.managerButtonText}>SAVE NEW DATE & TIME</Text></Pressable>{!editable?<Text style={s.managerHint}>Tournament date and time are locked after play has started.</Text>:null}<Pressable style={s.managerDanger} onPress={deleteTournament}><Text style={s.managerButtonText}>DELETE TOURNAMENT</Text></Pressable></View><View style={s.managerMetricGrid}>{[["JOINED",t.joined_count||0],["DON'T JOIN",t.declined_count||0],["NO RESPONSE",t.no_response_count||0],["MEMBERS",t.eligible_count||activePlayers.length]].map((x:any)=><View key={x[0]} style={s.managerMetric}><Text style={s.managerMetricLabel}>{x[0]}</Text><Text style={s.managerMetricValue}>{String(x[1])}</Text></View>)}</View><Text style={s.managerSection}>SIGNUP RESPONSES · ADD / DROP</Text><View style={s.managerNotice}><Text style={s.managerNoticeTitle}>{editable?"MANAGER CORRECTION ENABLED":"ENTRIES LOCKED"}</Text><Text style={s.managerNoticeText}>{editable?"Use Add or Drop if a player tapped the wrong choice. If an unplayed bracket already exists, the server rebuilds it automatically.":"Tournament play has started, so the entrant list can no longer be changed."}</Text></View>{activePlayers.map((p:any)=>{const r:any=responseById.get(Number(p.id));const decision=!r?"NO RESPONSE":r.join?"JOINED":"DON'T JOIN";const source=!r?"Waiting for player":r.manager_override?"Manager Add / Drop":r.automatic?"Automatic at cutoff":"Player response";return <View key={String(p.id)} style={s.managerListCard}><ManagerPlayerLink name={String(p.display_name||p.username)} playerId={Number(p.id||0)}/><Text style={s.managerListSub}>{decision} • {source}</Text>{r?.responded_at?<Text style={s.managerBodyText}>{String(r.responded_at)}</Text>:null}<View style={s.managerButtonRow}><Pressable disabled={!editable||r?.join===true} style={[s.managerPrimary,{flex:1},(!editable||r?.join===true)&&{opacity:.35}]} onPress={()=>confirm("Add Player",`Add ${String(p.display_name||p.username)} to this tournament?`,()=>mutate("/api/admin/manager-tournament/entry",{method:"POST",body:JSON.stringify({tournament_id:Number(t?.id||0),player_id:Number(p.id),join:true})},"Player added to tournament."))}><Text style={s.managerButtonText}>ADD</Text></Pressable><Pressable disabled={!editable||r?.join===false} style={[s.managerDanger,{flex:1},(!editable||r?.join===false)&&{opacity:.35}]} onPress={()=>confirm("Drop Player",`Drop ${String(p.display_name||p.username)} from this tournament?`,()=>mutate("/api/admin/manager-tournament/entry",{method:"POST",body:JSON.stringify({tournament_id:Number(t?.id||0),player_id:Number(p.id),join:false})},"Player dropped from tournament."))}><Text style={s.managerButtonText}>DROP</Text></Pressable></View></View>})}<Text style={s.managerSection}>BRACKET / MATCHES</Text>{tournamentMatches.length?tournamentMatches.map((m:any)=><View key={String(m.id)} style={s.managerListCard}><Text style={s.managerListTitle}>{String(m.round_label||"Tournament Match")} · #{m.id}</Text><View style={s.matchPlayersLeft}><ManagerPlayerLink name={String(m.player1_name||"TBD")} playerId={Number(m.player1_id||0)}/><Text style={s.managerBodyText}> vs </Text><ManagerPlayerLink name={String(m.player2_name||"TBD")} playerId={Number(m.player2_id||0)}/></View><Text style={s.managerListSub}>{m.player1_legs??"—"} - {m.player2_legs??"—"} • {String(m.status||"scheduled")}{m.bye?" • BYE":""}{Number(m.evidence_count||0)>0?` • Evidence ${Number(m.evidence_count)}`:""}</Text></View>):<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>BRACKET NOT GENERATED YET</Text><Text style={s.emptyStateText}>The server will generate it immediately when everyone responds, or at the 10-minute cutoff if responses are still missing.</Text></View>}</>:null}</ScrollView>);
  }
  if(area==="Standings"){const divisionOptions=divisions.map((x:any)=>({value:String(x.id),label:String(x.name)})),seasonOptions=seasons.map((x:any)=>({value:String(x.id),label:`${x.name} (${x.year})`}));const rows=Array.isArray(data)?data:[];const loadStandings=async()=>{if(!form.division_id)return;setLoading(true);try{const x=await apiRequest(`/api/admin/standings?division_id=${encodeURIComponent(form.division_id)}&season_id=${encodeURIComponent(form.season_id||"")}`);setData(Array.isArray(x)?x:[])}catch(e:any){setError(String(e?.message||e))}finally{setLoading(false)}};return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Standings</Text>{busy}{err}<ChoiceDropdown label="Division" value={form.division_id||""} options={divisionOptions} onChange={v=>setField("division_id",v)} placeholder="Choose division"/><ChoiceDropdown label="Season" value={form.season_id||""} options={seasonOptions} onChange={v=>setField("season_id",v)} placeholder="Current season"/><Pressable style={s.managerPrimary} onPress={loadStandings}><Text style={s.managerButtonText}>LOAD STANDINGS</Text></Pressable><Pressable style={s.managerSecondary} onPress={()=>mutate("/api/admin/standings/rebuild",{method:"POST"},"Standings rebuilt from authoritative match data.")}><Text style={s.managerButtonText}>REBUILD STANDINGS</Text></Pressable>{rows.map((r:any,i:number)=><View key={r.player_id||i} style={s.managerListCard}><Text style={s.managerListTitle}>#{r.rank??i+1} {r.player}</Text><Text style={s.managerListSub}>P {r.played||0} • W {r.wins||0} • L {r.losses||0} • LD {r.leg_difference||0} • PTS {r.points||0}</Text></View>)}</ScrollView>)}
  if(area==="Rules"){const book=normalizeRulebook(data);return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>League Rules</Text>{err}<Text style={s.managerHint}>{book.title} • {book.version} • server authoritative</Text>{book.sections.map((r:any)=><RuleCard key={r.n} rule={r}/>)}</ScrollView>)}
  if(area==="Trophies & Badges"){const catalog=normalizeAwardCatalog(data);const shown=catalog.length?catalog:bundledAwardCatalog;return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Trophies & Badges</Text><View style={s.managerNotice}><Text style={s.managerNoticeTitle}>{shown.length} ACTIVE AWARDS</Text><Text style={s.managerNoticeText}>The app is ready for the server-managed award catalog and server artwork endpoint. Until that server patch is installed, the existing bundled artwork remains the visual fallback.</Text></View>{shown.map((a:any)=><View key={a.type} style={s.managerListCard}><Text style={s.managerListTitle}>{a.name}</Text><Text style={s.managerListSub}>{a.category}</Text><Text style={s.managerBodyText}>{a.detail}</Text></View>)}</ScrollView>)}
  if(area==="Announcements"){const rows=Array.isArray(data)?data:[];return shell(<ScrollView showsVerticalScrollIndicator={false}>{top}<Text style={s.title}>Announcements</Text>{busy}{err}<View style={s.managerForm}><TextInput style={s.managerInput} placeholder="Announcement title" placeholderTextColor="#6f8597" value={form.title||""} onChangeText={v=>setField("title",v)}/><TextInput style={[s.managerInput,{minHeight:90,textAlignVertical:"top"}]} multiline placeholder="Message" placeholderTextColor="#6f8597" value={form.body||""} onChangeText={v=>setField("body",v)}/><Pressable style={s.managerPrimary} onPress={()=>mutate("/api/admin/announcements",{method:"POST",body:JSON.stringify({title:form.title||"",body:form.body||""})},"Announcement published.")}><Text style={s.managerButtonText}>PUBLISH</Text></Pressable></View>{rows.map((a:any)=><View key={a.id} style={s.managerListCard}><Text style={s.managerListTitle}>{a.title}</Text><Text style={s.managerBodyText}>{a.body}</Text></View>)}</ScrollView>)}
  if(area==="Backups"){const rows=Array.isArray(data)?data:[];return shell(<ScrollView>{top}<Text style={s.title}>Backups</Text>{busy}{err}<Pressable style={s.managerPrimary} onPress={()=>mutate("/api/admin/backups",{method:"POST"},"Server backup created.")}><Text style={s.managerButtonText}>CREATE BACKUP</Text></Pressable>{rows.map((b:any,i:number)=><View key={b.name||i} style={s.managerListCard}><Text style={s.managerListTitle}>{b.name}</Text><Text style={s.managerListSub}>{b.date||b.modified||""} • {b.size||""}</Text></View>)}</ScrollView>)}
  if(area==="League Settings"){const d=data||{};return shell(<ScrollView>{top}<Text style={s.title}>League Settings</Text>{busy}{err}<View style={s.managerForm}><ChoiceDropdown label="Division Capacity" value={form.division_capacity||String(d.division_capacity||12)} options={CAPACITY_OPTIONS} onChange={v=>setField("division_capacity",v)}/><Pressable style={s.managerPrimary} onPress={()=>mutate("/api/admin/settings",{method:"PUT",body:JSON.stringify({division_capacity:Number(form.division_capacity||d.division_capacity||12)})},"League settings saved.")}><Text style={s.managerButtonText}>SAVE SETTINGS</Text></Pressable><Text style={s.managerHint}>Rule-controlled settings are read-only: Best of {d.best_of||5}, draws {String(d.draws_allowed??false)}, {d.points_win||3} points per win, playoff semifinals Best of {d.playoff_semifinal_best_of||7}, final Best of {d.playoff_final_best_of||9}. Scheduling is entered in Eastern Time.</Text></View></ScrollView>)}
  if(area==="Tunnel & API"){const d=data||{};return shell(<ScrollView>{top}<Text style={s.title}>Tunnel & API</Text>{busy}{err}<View style={s.managerListCard}><Text style={s.managerListTitle}>{d.api_hostname||"api.usautodartsleague.com"}</Text><Text style={s.managerListSub}>API local: {d.api_local||"http://127.0.0.1:8080"}</Text><Text style={s.managerListSub}>Website: {d.website_hostname||"play.usautodartsleague.com"}</Text><Text style={s.managerListSub}>Website local: {d.website_local||"http://127.0.0.1:8081"}</Text></View><View style={s.managerButtonRow}><Pressable style={s.managerSecondary} onPress={()=>mutate("/api/admin/tunnel/test",{method:"POST"},"Local API test complete.")}><Text style={s.managerButtonText}>TEST API</Text></Pressable><Pressable style={s.managerSecondary} onPress={()=>mutate("/api/admin/tunnel/check",{method:"POST"},"Tunnel status checked.")}><Text style={s.managerButtonText}>CHECK TUNNEL</Text></Pressable></View></ScrollView>)}
  if(area==="Audit Log"){const rows=Array.isArray(data)?data:[];return shell(<ScrollView>{top}<Text style={s.title}>Audit Log</Text>{busy}{err}{rows.map((r:any,i:number)=><View key={r.id||i} style={s.managerListCard}><Text style={s.managerListTitle}>{r.action}</Text><Text style={s.managerListSub}>{r.created_at||r.time||""} • {r.actor||r.role||""}</Text><Text style={s.managerBodyText}>{r.details||""}</Text></View>)}</ScrollView>)}
  return shell(<ScrollView>{top}{err}</ScrollView>);
}


export default function App(){
const[showSplash,setShowSplash]=useState(true);
const[signedIn,setSignedIn]=useState(false);
const[tab,setTabRaw]=useState("Home");
const navBackRef=useRef<string[]>([]);
const navForwardRef=useRef<string[]>([]);
const[selectedPlayer,setSelectedPlayer]=useState<string|null>(null);
const[selectedPlayerId,setSelectedPlayerId]=useState(0);
const[selectedDivision,setSelectedDivision]=useState("Unassigned");
const[fontScale,setFontScale]=useState(1);
const[playerName,setPlayerName]=useState("");
const[screenName,setScreenName]=useState("");
const[timeZone,setTimeZone]=useState(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York"}catch{return"America/New_York"}});
const[profileImage,setProfileImage]=useState<string|null>(null);
const[matchScreenshots,setMatchScreenshots]=useState<Record<string,any[]>>({});
const[matchUploadWorkingId,setMatchUploadWorkingId]=useState<string>("");
const[currentPlayer,setCurrentPlayer]=useState<any>(null);
const[authReady,setAuthReady]=useState(false);
const[autoSignInMessage,setAutoSignInMessage]=useState("");
const[currentPassword,setCurrentPassword]=useState("");
const[newPassword,setNewPassword]=useState("");
const[confirmPassword,setConfirmPassword]=useState("");
const[passwordWorking,setPasswordWorking]=useState(false);
const[passwordError,setPasswordError]=useState("");
const serverRole=normalizedServerRole(currentPlayer);
const[serverOnline,setServerOnline]=useState<boolean|null>(null);
const[serverDivisions,setServerDivisions]=useState<any[]>([]);
const[serverStandings,setServerStandings]=useState<Record<string,any[]>>({});
const[serverAnnouncements,setServerAnnouncements]=useState<any[]>([]);
const[serverMatches,setServerMatches]=useState<any[]>([]);
const[serverPlayers,setServerPlayers]=useState<any[]>([]);
const[serverLeagueHistoryMatches,setServerLeagueHistoryMatches]=useState<any[]>([]);
const[historyPlayerFilter,setHistoryPlayerFilter]=useState("mine");
const[serverTournamentMatches,setServerTournamentMatches]=useState<any[]>([]);
const[tournamentEndpointReady,setTournamentEndpointReady]=useState(true);
const[serverSeasons,setServerSeasons]=useState<any[]>([]);
const[currentSeasonId,setCurrentSeasonId]=useState(0);
const[selectedSeasonId,setSelectedSeasonId]=useState("");
const[serverRulebook,setServerRulebook]=useState<any>({title:"US AutoDarts League — Rules v1.0 Draft",version:"1.0 Draft",sections:leagueRules});
const[serverAwardCatalog,setServerAwardCatalog]=useState<any[]>(bundledAwardCatalog);
const[serverEarnedAwards,setServerEarnedAwards]=useState<any[]>([]);
const[,setAwardRevision]=useState(0);
const[serverSeasonStats,setServerSeasonStats]=useState<any>({});
const[serverCareerStats,setServerCareerStats]=useState<any>({});
const[selectedPlayerSeasonStats,setSelectedPlayerSeasonStats]=useState<any>({});
const[selectedPlayerCareerStats,setSelectedPlayerCareerStats]=useState<any>({});
const[selectedPlayerStatsLoading,setSelectedPlayerStatsLoading]=useState(false);
const[selectedPlayerStatsError,setSelectedPlayerStatsError]=useState("");
const[managerTournament,setManagerTournament]=useState<any>(null);
const[managerTournaments,setManagerTournaments]=useState<any[]>([]);
const[managerTournamentTab,setManagerTournamentTab]=useState("Matches");
const[announcementPopup,setAnnouncementPopup]=useState<any>(null);
const[announcementBusy,setAnnouncementBusy]=useState(false);
const[updateWorking,setUpdateWorking]=useState(false);
const[updateStatus,setUpdateStatus]=useState("Ready to check for updates.");
const[updateDownloaded,setUpdateDownloaded]=useState(false);
const[updateLastChecked,setUpdateLastChecked]=useState("");
const autoUpdateStartedRef=useRef(false);
const tabRef=useRef(tab);tabRef.current=tab;
const setTab=(next:string)=>{const current=tabRef.current;if(next===current)return;navBackRef.current.push(current);navForwardRef.current=[];setTabRaw(next)};
const goBackTab=()=>{const current=tabRef.current;const submenu=["Settings","ProfileSetup","FontSize","Security","LeagueRules","TrophyCase","Updates","AppInfo","ModeratorServer","ManagerServer","Contact","PlayerStats","DivisionPicker","ManagerTournament"].includes(current);if(!submenu)return;const prev=navBackRef.current.pop();if(!prev)return;navForwardRef.current.push(current);setTabRaw(prev)};
const goForwardTab=()=>{const current=tabRef.current;const next=navForwardRef.current.pop();if(!next)return;navBackRef.current.push(current);setTabRaw(next)};
useEffect(()=>{
  if(Platform.OS==="web")return;
  const sub=BackHandler.addEventListener("hardwareBackPress",()=>{
    if(!signedIn)return false;
    const current=tabRef.current;
    if(current==="ManagerServer"||current==="ModeratorServer")return false;
    const submenu=["Settings","ProfileSetup","FontSize","Security","LeagueRules","TrophyCase","Updates","AppInfo","Contact","PlayerStats","DivisionPicker","ManagerTournament"].includes(current);
    if(submenu)goBackTab();
    // Consume Android back even on top-level tabs so an edge swipe cannot close the APK.
    return true;
  });
  return()=>sub.remove();
},[signedIn]);


const checkForAppUpdate=async(manual=false)=>{
  if(Platform.OS==="web"){setUpdateStatus("Website updates are applied on the server and do not use the APK updater.");return;}
  if(updateWorking)return;
  setUpdateWorking(true);
  try{
    if(!Updates.isEnabled){
      setUpdateStatus("App updates are not enabled in this build.");
      return;
    }
    setUpdateStatus(manual?"Checking for update…":"Checking for update in the background…");
    const result:any=await Updates.checkForUpdateAsync();
    setUpdateLastChecked(new Date().toLocaleString());
    if(!result?.isAvailable){
      setUpdateDownloaded(false);
      setUpdateStatus("You’re up to date.");
      return;
    }
    setUpdateStatus("Update found. Downloading…");
    const fetched:any=await Updates.fetchUpdateAsync();
    if(fetched?.isNew===false){
      setUpdateStatus("You’re up to date.");
      setUpdateDownloaded(false);
      return;
    }
    setUpdateDownloaded(true);
    if(manual){
      setUpdateStatus("Update downloaded. Tap INSTALL & RESTART to apply it.");
    }else{
      setUpdateStatus("Update downloaded. Restarting app…");
      setTimeout(()=>{Updates.reloadAsync().catch(()=>{});},450);
    }
  }catch(e:any){
    const msg=String(e?.message||e||"Update check failed.");
    if(manual)setUpdateStatus(`Could not check for updates: ${msg}`);
    else setUpdateStatus("Automatic update check could not reach the update server. The app will continue normally.");
  }finally{setUpdateWorking(false);}
};

const installDownloadedUpdate=async()=>{
  if(Platform.OS==="web")return;
  if(!updateDownloaded){await checkForAppUpdate(true);return;}
  setUpdateWorking(true);
  setUpdateStatus("Restarting with update…");
  try{await Updates.reloadAsync();}
  catch(e:any){setUpdateStatus(`Could not restart app: ${String(e?.message||e||"unknown error")}`);setUpdateWorking(false);}
};

useEffect(()=>{
  if(Platform.OS==="web"||autoUpdateStartedRef.current)return;
  autoUpdateStartedRef.current=true;
  const timer=setTimeout(()=>{checkForAppUpdate(false);},1200);
  return()=>clearTimeout(timer);
},[]);

const applyServerPlayer=(player:any)=>{
  setCurrentPlayer(player);
  const name=String(player?.display_name||player?.username||"").trim();
  const screen=String(player?.screen_name||player?.username||name).trim();
  setPlayerName(name);
  setScreenName(screen);
  if(player?.division_name)setSelectedDivision(player.division_name);
  if(player?.timezone)setTimeZone(player.timezone);
};

const clearStoredAuth=async(clearPassword=true)=>{
  runtimeAuthToken=null;
  await storage.deleteItemAsync("league_session");
  await storage.deleteItemAsync("league_player");
  if(clearPassword){
    await storage.deleteItemAsync("league_password");
    await storage.deleteItemAsync("league_keep_signed_in");
  }
};

const logout=async()=>{
  try{
    await clearStoredAuth(true);
  }finally{
    runtimeAuthToken=null;
    setAnnouncementPopup(null);
    setCurrentPlayer(null);
    setSelectedPlayer(null);
    setSelectedPlayerId(0);
    setServerEarnedAwards([]);
    Object.keys(playerAwards).forEach(k=>delete playerAwards[k]);
    navBackRef.current=[];
    navForwardRef.current=[];
    setTabRaw("Home");
    setAutoSignInMessage("You have been logged out.");
    setSignedIn(false);
  }
};

useEffect(()=>{
  (async()=>{
    try{
      const savedScale=await storage.getItemAsync("gui_font_scale");
      const savedProfile=await storage.getItemAsync("player_profile");
      if(savedScale)setFontScale(Number(savedScale)||1);
      if(savedProfile){
        try{
          const p=JSON.parse(savedProfile);
          if(p.timeZone)setTimeZone(p.timeZone);
          if(p.profileImage)setProfileImage(p.profileImage);
        }catch{}
      }

      const keep=await storage.getItemAsync("league_keep_signed_in");
      const savedUsername=await storage.getItemAsync("league_username");
      const savedPassword=await storage.getItemAsync("league_password");
      if(keep==="1"&&savedUsername&&savedPassword){
        try{
          const auth=await apiRequest("/api/auth/login",{method:"POST",body:JSON.stringify({username:savedUsername,password:savedPassword})});
          if(!auth?.token||!auth?.player)throw new Error("The server returned an invalid login response.");
          runtimeAuthToken=auth.token;
          await storage.setItemAsync("league_session",auth.token);
          await storage.setItemAsync("league_player",JSON.stringify(auth.player));
          applyServerPlayer(auth.player);
          setSignedIn(true);
        }catch(e:any){
          const status=Number(e?.status||0);
          if(status===401||status===403){
            await clearStoredAuth(true);
            setAutoSignInMessage("Your saved sign-in is no longer valid. Enter the current password from the league server to continue.");
          }else{
            runtimeAuthToken=null;
            setAutoSignInMessage("The league server could not verify your saved sign-in. Connect to the server and sign in again.");
          }
        }
      }else{
        runtimeAuthToken=null;
        await storage.deleteItemAsync("league_session");
        await storage.deleteItemAsync("league_player");
      }
    }catch{}
    finally{setAuthReady(true);}
  })();
},[]);

const refreshStandingsForSeason=async(seasonId:string)=>{
  const mapped:Record<string,any[]>={};
  for(const d of serverDivisions){try{const q=seasonId?`&season_id=${encodeURIComponent(seasonId)}`:"";const rows=await apiRequest(`/api/standings?division_id=${encodeURIComponent(String(d.id))}${q}`,{method:"GET"});if(Array.isArray(rows))mapped[d.name]=rows;}catch{}}
  if(Object.keys(mapped).length)setServerStandings(mapped);
};
const refreshOwnStats=async(seasonId:number|string=0)=>{
  try{
    const sid=String(seasonId||"");
    const[career,season]=await Promise.all([apiRequest("/api/player-stats"),sid?apiRequest(`/api/player-stats?season_id=${encodeURIComponent(sid)}`):apiRequest("/api/player-stats")]);
    setServerCareerStats(career&&typeof career==="object"?career:{});
    setServerSeasonStats(season&&typeof season==="object"?season:{});
  }catch{}
};
const refreshLeagueHistory=async(seasonId:number|string="")=>{
  const isPast=(m:any)=>{const st=String(m?.status||"").toLowerCase();return st==="completed"||st==="approved"||m?.approved===true;};
  try{
    const sid=String(seasonId||"");
    const q=sid?`&season_id=${encodeURIComponent(sid)}`:"";
    // Ask for the whole league match list and apply the same completed/approved
    // rule locally. This also keeps history working against older servers whose
    // history endpoint was too strict about the stored Status field.
    const rows=await apiRequest(`/api/matches?view=league${q}`,{method:"GET"});
    setServerLeagueHistoryMatches(Array.isArray(rows)?rows.filter(isPast):[]);
  }catch{
    setServerLeagueHistoryMatches(serverMatches.filter(isPast));
  }
};
const playerIdForName=(name:string)=>{
  const needle=String(name||"").trim().toLowerCase();
  if(!needle)return 0;
  const ownName=String(currentPlayer?.display_name||currentPlayer?.username||"").trim().toLowerCase();
  if(needle===ownName&&Number(currentPlayer?.id||0)>0)return Number(currentPlayer.id);
  const publicPlayer=serverPlayers.find((r:any)=>String(r?.display_name??r?.username??"").trim().toLowerCase()===needle);
  const publicID=Number(publicPlayer?.id??0);
  if(publicID>0)return publicID;
  const rows=Object.values(serverStandings).flat() as any[];
  const row=rows.find((r:any)=>String(r?.player??r?.display_name??r?.username??"").trim().toLowerCase()===needle);
  const standingID=Number(row?.player_id??row?.id??0);
  if(standingID>0)return standingID;
  const matchSources=[...serverMatches,...serverLeagueHistoryMatches,...(Array.isArray(managerTournament?.matches)?managerTournament.matches:[])];
  for(const m of matchSources){
    if(String(m?.player1_name||"").trim().toLowerCase()===needle&&Number(m?.player1_id||0)>0)return Number(m.player1_id);
    if(String(m?.player2_name||"").trim().toLowerCase()===needle&&Number(m?.player2_id||0)>0)return Number(m.player2_id);
  }
  return 0;
};
const refreshSelectedPlayerStats=async(name:string,seasonId:number|string=0,explicitPlayerId:number=0)=>{
  const pid=Number(explicitPlayerId||playerIdForName(name));
  if(pid<=0){setSelectedPlayerSeasonStats({});setSelectedPlayerCareerStats({});setSelectedPlayerStatsError("Player stats could not be matched to a server player ID.");return;}
  setSelectedPlayerStatsLoading(true);
  setSelectedPlayerStatsError("");
  try{
    const sid=String(seasonId||"");
    const base=`/api/player-stats?player_id=${encodeURIComponent(String(pid))}`;
    const[career,season]=await Promise.all([apiRequest(base),sid?apiRequest(`${base}&season_id=${encodeURIComponent(sid)}`):apiRequest(base)]);
    setSelectedPlayerCareerStats(career&&typeof career==="object"?career:{});
    setSelectedPlayerSeasonStats(season&&typeof season==="object"?season:{});
  }catch(e:any){
    setSelectedPlayerSeasonStats({});
    setSelectedPlayerCareerStats({});
    setSelectedPlayerStatsError(String(e?.message||e||"Player statistics could not be loaded."));
  }finally{setSelectedPlayerStatsLoading(false);}
};
const awardRowsToMarks=(rows:any[])=>rows.map((a:any)=>({type:String(a.type||a.code||"award"),count:Number(a.count||1)}));
const cacheAwardsForPlayers=(rows:any[],players:any[]=serverPlayers)=>{
  const namesById=new Map<number,string>();
  for(const p of players||[]){const pid=Number(p?.id||0);const name=String(p?.display_name||p?.username||"");if(pid>0&&name)namesById.set(pid,name);}
  if(Number(currentPlayer?.id||0)>0){const ownName=String(currentPlayer?.display_name||currentPlayer?.username||"");if(ownName)namesById.set(Number(currentPlayer.id),ownName);}
  const grouped=new Map<number,any[]>();
  for(const a of rows||[]){const pid=Number(a?.player_id||0);if(pid<=0)continue;if(!grouped.has(pid))grouped.set(pid,[]);grouped.get(pid)!.push(a);}
  for(const [pid,name] of namesById.entries())playerAwards[name]=awardRowsToMarks(grouped.get(pid)||[]);
  setAwardRevision(v=>v+1);
};
const refreshSelectedPlayerAwards=async(name:string,explicitPlayerId:number=0)=>{
  const pid=Number(explicitPlayerId||playerIdForName(name));
  if(pid<=0)return;
  try{const rows=await apiRequest(`/api/awards?player_id=${encodeURIComponent(String(pid))}`);if(Array.isArray(rows)){playerAwards[name]=awardRowsToMarks(rows);setAwardRevision(v=>v+1);}}catch{}
};
const refreshTournamentForSeason=async(seasonId:string,fallbackSource:any[]=serverMatches)=>{
  const q=seasonId?`?season_id=${encodeURIComponent(seasonId)}`:"";
  try{
    const payload=await apiRequest(`/api/tournaments${q}`,{method:"GET"});
    const rows=tournamentMatchesFromPayload(payload).filter((m:any)=>!seasonId||Number(m?.season_id||0)===Number(seasonId));
    setServerTournamentMatches(rows);
    setTournamentEndpointReady(true);
  }catch{
    const fallback=(Array.isArray(fallbackSource)?fallbackSource:[]).filter((m:any)=>isTournamentMatch(m)&&(!seasonId||Number(m?.season_id||0)===Number(seasonId)));
    setServerTournamentMatches(fallback);
    setTournamentEndpointReady(false);
  }
};
const refreshManagerTournament=async()=>{
  try{
    const payload=await apiRequest("/api/manager-tournament/current",{method:"GET"});
    const current=payload?.tournament??payload?.current??((payload&&typeof payload==="object"&&Number(payload?.id||0)>0)?payload:null);
    const rawList=Array.isArray(payload?.available_tournaments)?payload.available_tournaments:Array.isArray(payload?.tournaments)?payload.tournaments:(current?[current]:[]);
    const seen=new Set<number>();
    const rows=rawList.filter((x:any)=>{const id=Number(x?.id||0);if(id<=0||seen.has(id))return false;seen.add(id);return true;}).sort((a:any,b:any)=>String(a?.start_at||"").localeCompare(String(b?.start_at||"")));
    setManagerTournaments(rows);
    setManagerTournament((prev:any)=>{
      const prevId=Number(prev?.id||0);
      if(prevId>0){const keep=rows.find((x:any)=>Number(x?.id||0)===prevId);if(keep)return keep;}
      const currentId=Number(current?.id||0);
      if(currentId>0){const selected=rows.find((x:any)=>Number(x?.id||0)===currentId);if(selected)return selected;}
      return rows[0]||null;
    });
  }catch(e:any){
    if(Number(e?.status||0)===404){setManagerTournament(null);setManagerTournaments([]);}
  }
};
const refreshAnnouncementPopups=async()=>{
  if(announcementPopup||announcementBusy)return;
  try{
    const payload=await apiRequest("/api/announcements/pending",{method:"GET"});
    const rows=Array.isArray(payload)?payload:Array.isArray(payload?.announcements)?payload.announcements:[];
    if(rows.length)setAnnouncementPopup(rows[0]);
  }catch{}
};
const refreshServerData=async()=>{
  try{
    await apiRequest("/health",{method:"GET"});setServerOnline(true);
    const[divisions,announcements,matches,seasonsPayload,playersPayload]=await Promise.all([apiRequest("/api/divisions"),apiRequest("/api/announcements"),apiRequest("/api/matches"),apiRequest("/api/seasons"),apiRequest("/api/players").catch(()=>[])]);
    const divs=Array.isArray(divisions)?divisions:[];setServerDivisions(divs);if(Array.isArray(announcements))setServerAnnouncements(announcements);if(Array.isArray(matches))setServerMatches(matches);if(Array.isArray(playersPayload))setServerPlayers(playersPayload);
    const seasons=Array.isArray(seasonsPayload?.seasons)?seasonsPayload.seasons:[];setServerSeasons(seasons);const current=Number(seasonsPayload?.current_season_id||0);setCurrentSeasonId(current);setSelectedSeasonId(prev=>prev||String(current||seasons[0]?.id||""));
    const statsSeasonID=String(current||seasons[0]?.id||"");
    await refreshOwnStats(statsSeasonID);
    await refreshLeagueHistory(statsSeasonID);
    try{const rb=normalizeRulebook(await apiRequest("/api/rules"));setServerRulebook(rb);await storage.setItemAsync("league_rules_cache",JSON.stringify(rb));}catch{try{const cached=await storage.getItemAsync("league_rules_cache");if(cached)setServerRulebook(JSON.parse(cached));}catch{}}
    try{const leagueAwards=await apiRequest("/api/awards?scope=league");if(Array.isArray(leagueAwards)){cacheAwardsForPlayers(leagueAwards,Array.isArray(playersPayload)?playersPayload:[]);const own=leagueAwards.filter((a:any)=>Number(a?.player_id||0)===Number(currentPlayer?.id||0));setServerEarnedAwards(own);}}catch{try{const awards=await apiRequest("/api/awards");const earned=Array.isArray(awards)?awards:Array.isArray(awards?.earned)?awards.earned:[];setServerEarnedAwards(earned);const name=String(currentPlayer?.display_name||currentPlayer?.username||"");if(name){playerAwards[name]=awardRowsToMarks(earned);setAwardRevision(v=>v+1);}}catch{}}
    try{const cat=normalizeAwardCatalog(await apiRequest("/api/award-catalog"));if(cat.length){setServerAwardCatalog(cat);await storage.setItemAsync("league_award_catalog_cache",JSON.stringify(cat));}}catch{try{const cached=await storage.getItemAsync("league_award_catalog_cache");if(cached){const cat=JSON.parse(cached);if(Array.isArray(cat)&&cat.length)setServerAwardCatalog(cat)}}catch{}}
    const mapped:Record<string,any[]>={};const sid=String(current||seasons[0]?.id||"");for(const d of divs){try{const q=sid?`&season_id=${encodeURIComponent(sid)}`:"";const rows=await apiRequest(`/api/standings?division_id=${encodeURIComponent(String(d.id))}${q}`,{method:"GET"});if(Array.isArray(rows))mapped[d.name]=rows;}catch{}}setServerStandings(mapped);
    await refreshTournamentForSeason(sid,Array.isArray(matches)?matches:[]);
    await refreshManagerTournament();
    await refreshAnnouncementPopups();
  }catch{setServerOnline(false);}
};
useEffect(()=>{if(signedIn)refreshServerData();},[signedIn]);
useEffect(()=>{if(signedIn&&selectedSeasonId){if(serverDivisions.length)refreshStandingsForSeason(selectedSeasonId);refreshTournamentForSeason(selectedSeasonId);refreshLeagueHistory(selectedSeasonId);}},[selectedSeasonId]);
useEffect(()=>{if(signedIn&&(tab==="Home"||tab==="Stats"||tab==="PlayerStats")){refreshOwnStats(currentSeasonId||selectedSeasonId||0);}},[tab,signedIn,currentSeasonId]);
useEffect(()=>{if(signedIn&&tab==="PlayerStats"&&selectedPlayer){refreshSelectedPlayerStats(selectedPlayer,selectedSeasonId||currentSeasonId||0,selectedPlayerId);refreshSelectedPlayerAwards(selectedPlayer,selectedPlayerId);}},[tab,signedIn,selectedPlayer,selectedPlayerId,selectedSeasonId,currentSeasonId,serverStandings,serverMatches,serverPlayers,serverLeagueHistoryMatches]);
useEffect(()=>{if(signedIn&&(tab==="Tournament"||tab==="ManagerTournament"))refreshManagerTournament();},[tab,signedIn]);
useEffect(()=>{
  if(!signedIn)return;
  refreshAnnouncementPopups();
  const timer=setInterval(refreshAnnouncementPopups,15000);
  const sub=AppState.addEventListener("change",state=>{if(state==="active")refreshAnnouncementPopups();});
  return()=>{clearInterval(timer);sub.remove();};
},[signedIn,announcementPopup,announcementBusy]);

const setGlobalFontScale=async(scale:number)=>{
  setFontScale(scale);
  try{await storage.setItemAsync("gui_font_scale",String(scale));}catch{}
};

const saveProfile=async()=>{
  const profile={timeZone,profileImage};
  try{await storage.setItemAsync("player_profile",JSON.stringify(profile));}catch{}
  Alert.alert("Profile saved","Your profile picture and time zone were saved on this device. Player name and screen name always come from the league server.");
};

const changeOwnPassword=async()=>{
  setPasswordError("");
  if(!currentPassword||!newPassword||!confirmPassword){setPasswordError("Fill in all three password fields.");return;}
  if(newPassword.length<6){setPasswordError("New password must be at least 6 characters.");return;}
  if(newPassword!==confirmPassword){setPasswordError("New password and confirmation do not match.");return;}
  if(newPassword===currentPassword){setPasswordError("Choose a new password different from the current password.");return;}
  setPasswordWorking(true);
  try{
    const username=String(currentPlayer?.username||await storage.getItemAsync("league_username")||"").trim();
    let changed:any=null;
    try{
      changed=await apiRequest("/api/auth/change-password",{method:"POST",body:JSON.stringify({current_password:currentPassword,new_password:newPassword}),timeoutMs:120000});
    }catch(primary:any){
      const raw=String(primary?.message||primary||"").toLowerCase();
      const aborted=primary?.name==="AbortError"||raw.includes("abort");
      if(!aborted||!username)throw primary;
      // A remote connection can close after the server has already committed the
      // password. Verify the new credential before reporting a false failure.
      try{changed=await apiRequest("/api/auth/login",{method:"POST",body:JSON.stringify({username,password:newPassword}),timeoutMs:120000});}
      catch{throw primary;}
    }
    let auth=changed;
    if(!auth?.token||!auth?.player){
      if(!username)throw new Error("Could not determine the signed-in username.");
      auth=await apiRequest("/api/auth/login",{method:"POST",body:JSON.stringify({username,password:newPassword}),timeoutMs:120000});
    }
    if(!auth?.token||!auth?.player)throw new Error("The server changed the password but did not return a valid new session.");
    runtimeAuthToken=auth.token;
    await storage.setItemAsync("league_session",auth.token);
    await storage.setItemAsync("league_player",JSON.stringify(auth.player));
    const keep=await storage.getItemAsync("league_keep_signed_in");
    if(keep==="1")await storage.setItemAsync("league_password",newPassword);
    applyServerPlayer(auth.player);
    setCurrentPassword("");setNewPassword("");setConfirmPassword("");
    Alert.alert("Password changed","Your league password was changed on the server. Other old sessions are no longer valid.");
  }catch(e:any){
    const status=Number(e?.status||0);
    const raw=String(e?.message||e||"");
    if(status===404)setPasswordError("The app is ready, but the Windows server still needs the player change-password endpoint enabled.");
    else if(status===401||raw.includes("invalid_credentials")||raw.includes("current_password"))setPasswordError("Current password is incorrect, or this session is no longer valid.");
    else setPasswordError(`Could not change password: ${raw}`);
  }finally{setPasswordWorking(false);}
};

const pickProfileImage=async()=>{
  const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
  if(!permission.granted){Alert.alert("Permission needed","Photo access is needed to choose a profile picture.");return;}
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:true,aspect:[1,1],quality:.8});
  if(!result.canceled&&result.assets?.[0]?.uri)setProfileImage(result.assets[0].uri);
};

const evidenceAssetKey=(a:any)=>String(a?.assetId||a?.fileName||a?.filename||a?.uri||"");
const addQueuedEvidence=(queueKey:string,assets:any[])=>{
  setMatchScreenshots(prev=>{
    const current=Array.isArray(prev[queueKey])?prev[queueKey]:[];
    const seen=new Set(current.map(evidenceAssetKey));
    const added=assets.filter((a:any)=>{const k=evidenceAssetKey(a);if(!k||seen.has(k))return false;seen.add(k);return true;});
    return {...prev,[queueKey]:[...current,...added]};
  });
};
const removeQueuedEvidence=(queueKey:string,index:number)=>setMatchScreenshots(prev=>({...prev,[queueKey]:(prev[queueKey]||[]).filter((_:any,i:number)=>i!==index)}));
const clearQueuedEvidence=(queueKey:string)=>setMatchScreenshots(prev=>({...prev,[queueKey]:[]}));

const pickMatchScreenshots=async(matchId:string)=>{
  if(matchUploadWorkingId)return;
  const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
  if(!permission.granted){Alert.alert("Permission needed","Photo access is needed to choose AutoDarts match screenshots or photos.");return;}
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsMultipleSelection:true,selectionLimit:10,quality:1});
  if(result.canceled||!result.assets?.length)return;
  addQueuedEvidence(matchId,result.assets);
};

const uploadQueuedMatchEvidence=async(matchId:string)=>{
  if(matchUploadWorkingId)return;
  let remaining=[...(matchScreenshots[matchId]||[])];
  if(!remaining.length){Alert.alert("Nothing queued","Add at least one screenshot or photo first.");return;}
  const originalCount=remaining.length;
  let uploaded=0;
  setMatchUploadWorkingId(matchId);
  try{
    while(remaining.length){
      const batch=remaining.slice(0,10);
      const receipt=await uploadMatchEvidence(matchId,batch);
      const received=Math.max(0,Number(receipt?.received||batch.length));
      uploaded+=received;
      remaining=remaining.slice(batch.length);
      setMatchScreenshots(prev=>({...prev,[matchId]:remaining}));
    }
    await refreshServerData();
    Alert.alert("Evidence uploaded",`${uploaded||originalCount} file${(uploaded||originalCount)===1?"":"s"} stored on the league server for Match #${matchId}. The server will combine all active, non-rejected evidence.`);
  }catch(e:any){
    setMatchScreenshots(prev=>({...prev,[matchId]:remaining}));
    const message=String(e?.message||e||"Server request failed.");
    Alert.alert(uploaded?"Upload partly completed":"Upload failed",uploaded?`${uploaded} file${uploaded===1?"":"s"} reached the server. ${remaining.length} remain queued and can be retried. ${message}`:message);
  }finally{setMatchUploadWorkingId("");}
};

async function uploadManagerTournamentEvidence(matchId:string,assets:any[]){
  const token=runtimeAuthToken||await storage.getItemAsync("league_session");
  if(!token)throw new Error("You are not signed in.");
  const form:any=new FormData();
  for(let i=0;i<assets.length;i++){
    const a:any=assets[i],uri=String(a?.uri||""),original=String(a?.fileName||a?.filename||`tournament-${matchId}-${i+1}.png`);
    let type=String(a?.mimeType||a?.type||"");
    if(!type||!type.includes("/")){const lower=original.toLowerCase();type=lower.endsWith(".jpg")||lower.endsWith(".jpeg")?"image/jpeg":lower.endsWith(".webp")?"image/webp":"image/png";}
    if(Platform.OS==="web"){const blob:any=await(await fetch(uri)).blob();form.append("files",blob,original);}else form.append("files",{uri,name:original,type} as any);
  }
  const response=await fetch(`${API_BASE_URL}/api/manager-tournament/matches/${encodeURIComponent(matchId)}/evidence`,{method:"POST",headers:{Accept:"application/json",Authorization:`Bearer ${token}`},body:form});
  let data:any=null;try{data=await response.json();}catch{}
  if(!response.ok)throw new Error(data?.message||data?.error||`Server returned HTTP ${response.status}`);
  return data;
}

const pickManagerTournamentScreenshots=async(matchId:string)=>{
  if(matchUploadWorkingId)return;
  const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
  if(!permission.granted){Alert.alert("Permission needed","Photo access is needed to choose AutoDarts tournament screenshots or photos.");return;}
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsMultipleSelection:true,selectionLimit:10,quality:1});
  if(result.canceled||!result.assets?.length)return;
  addQueuedEvidence(`t-${matchId}`,result.assets);
};

const uploadQueuedManagerTournamentEvidence=async(matchId:string)=>{
  const queueKey=`t-${matchId}`;
  if(matchUploadWorkingId)return;
  let remaining=[...(matchScreenshots[queueKey]||[])];
  if(!remaining.length){Alert.alert("Nothing queued","Add at least one screenshot or photo first.");return;}
  const originalCount=remaining.length;
  let uploaded=0;
  setMatchUploadWorkingId(queueKey);
  try{
    while(remaining.length){
      const batch=remaining.slice(0,10);
      const data=await uploadManagerTournamentEvidence(matchId,batch);
      const received=Math.max(0,Number(data?.received||batch.length));
      uploaded+=received;
      remaining=remaining.slice(batch.length);
      setMatchScreenshots(prev=>({...prev,[queueKey]:remaining}));
    }
    await refreshManagerTournament();
    Alert.alert("Tournament evidence uploaded",`${uploaded||originalCount} file${(uploaded||originalCount)===1?"":"s"} uploaded. The server will combine all active, non-rejected evidence for this match.`);
  }catch(e:any){
    setMatchScreenshots(prev=>({...prev,[queueKey]:remaining}));
    const message=String(e?.message||e||"Upload failed.");
    Alert.alert(uploaded?"Upload partly completed":"Tournament upload failed",uploaded?`${uploaded} file${uploaded===1?"":"s"} reached the server. ${remaining.length} remain queued and can be retried. ${message}`:message);
  }finally{setMatchUploadWorkingId("");}
};

const queuedEvidenceTray=(queueKey:string,onAdd:()=>void,onUpload:()=>void)=>{
  const queued=matchScreenshots[queueKey]||[];
  if(!queued.length)return null;
  const working=matchUploadWorkingId===queueKey;
  return <View style={s.evidenceTray}>
    <View style={s.evidenceTrayHeader}><Text style={s.evidenceTrayTitle}>READY TO UPLOAD • {queued.length}</Text><Pressable disabled={working} onPress={()=>clearQueuedEvidence(queueKey)}><Text style={s.evidenceClear}>CLEAR ALL</Text></Pressable></View>
    <Text style={s.evidenceTrayHint}>Add every screenshot/photo you need, remove any wrong ones, then tap Upload All once.</Text>
    {queued.map((a:any,i:number)=><View key={`${evidenceAssetKey(a)}-${i}`} style={s.evidenceQueueRow}><Image source={{uri:String(a?.uri||"")}} style={s.evidenceThumb}/><Text numberOfLines={1} style={s.evidenceQueueName}>{String(a?.fileName||a?.filename||`Image ${i+1}`)}</Text><Pressable disabled={working} onPress={()=>removeQueuedEvidence(queueKey,i)} style={s.evidenceRemove}><Text style={s.evidenceRemoveText}>REMOVE</Text></Pressable></View>)}
    <View style={s.evidenceTrayActions}><Pressable disabled={working} style={[s.evidenceAddMore,working&&{opacity:.45}]} onPress={onAdd}><Text style={s.evidenceActionText}>+ ADD MORE</Text></Pressable><Pressable disabled={working} style={[s.evidenceUploadAll,working&&{opacity:.45}]} onPress={onUpload}><Text style={s.evidenceActionText}>{working?"UPLOADING…":"UPLOAD ALL"}</Text></Pressable></View>
  </View>;
};
const respondToAnnouncement=async(choice:string)=>{
  if(!announcementPopup||announcementBusy)return;
  setAnnouncementBusy(true);
  try{
    const id=String(announcementPopup?.id||"");
    const kind=String(announcementPopup?.kind||announcementPopup?.type||"").toLowerCase();
    const tournamentId=String(announcementPopup?.tournament_id||announcementPopup?.tournament?.id||"");
    if((kind==="tournament_signup"||kind==="manager_tournament_signup")&&tournamentId){
      await apiRequest(`/api/manager-tournament/${encodeURIComponent(tournamentId)}/signup`,{method:"POST",body:JSON.stringify({join:choice==="join"})});
    }
    if(id)await apiRequest(`/api/announcements/${encodeURIComponent(id)}/response`,{method:"POST",body:JSON.stringify({choice})});
    setAnnouncementPopup(null);
    await refreshManagerTournament();
  }catch(e:any){Alert.alert("Response not saved",String(e?.message||e||"The server could not save your response."));}
  finally{setAnnouncementBusy(false);}
};
const wrap=(node:any)=><FontScaleContext.Provider value={fontScale}>{node}</FontScaleContext.Provider>;
if(showSplash)return wrap(<Splash onDone={()=>setShowSplash(false)}/>);
if(!authReady)return wrap(<SafeAreaView style={s.safe}><AmericanFlagBackground/><View style={s.signInOverlay}><View style={s.authCheckCard}><Text style={s.signInTitle}>VERIFYING SAVED SIGN-IN</Text><Text style={s.signInSub}>Checking your saved credentials against the league server…</Text></View></View></SafeAreaView>);
if(!signedIn)return wrap(<SignIn initialMessage={autoSignInMessage} onSignedIn={(player:any)=>{applyServerPlayer(player);setSignedIn(true);setAutoSignInMessage("")}}/>);

const openPlayer=(name:string,playerId:number=0)=>{setSelectedPlayerSeasonStats({});setSelectedPlayerCareerStats({});setSelectedPlayerStatsError("");setSelectedPlayerId(Number(playerId)||0);setSelectedPlayer(name);setTab("PlayerStats")};
const PlayerLink=({name,playerId=0,textStyle=null}:{name:string;playerId?:number;textStyle?:any})=>{const resolved=Number(playerId)||playerIdForName(name);if(!resolved||String(name||"").toUpperCase()==="TBD")return <Text style={textStyle||s.matchSelfName}>{name}</Text>;return <Pressable onPress={()=>openPlayer(name,resolved)}><Text style={[s.inlinePlayerLink,textStyle]}>{name}</Text></Pressable>};
const isCompletedMatch=(m:any)=>{const st=String(m?.status||"").toLowerCase();return st==="completed"||st==="approved"||m?.approved===true;};
const visibleMatches=(selectedSeasonId?serverMatches.filter((m:any)=>Number(m.season_id)===Number(selectedSeasonId)):serverMatches);
const upcomingMatches=visibleMatches.filter((m:any)=>!isCompletedMatch(m)&&String(m.status||"").toLowerCase()!=="void").sort((a:any,b:any)=>String(a.scheduled_at||"").localeCompare(String(b.scheduled_at||"")));
const completedMatches=visibleMatches.filter((m:any)=>isCompletedMatch(m)).sort((a:any,b:any)=>String(b.scheduled_at||"").localeCompare(String(a.scheduled_at||"")));
const leagueHistoryForSeason=(selectedSeasonId?serverLeagueHistoryMatches.filter((m:any)=>Number(m.season_id)===Number(selectedSeasonId)):serverLeagueHistoryMatches).filter((m:any)=>isCompletedMatch(m)).sort((a:any,b:any)=>String(b.scheduled_at||"").localeCompare(String(a.scheduled_at||"")));
const historyTargetPlayerId=historyPlayerFilter.startsWith("player:")?Number(historyPlayerFilter.slice(7)):historyPlayerFilter==="mine"?Number(currentPlayer?.id||0):0;
const filteredHistoryMatches=historyPlayerFilter==="league"?leagueHistoryForSeason:leagueHistoryForSeason.filter((m:any)=>Number(m.player1_id)===historyTargetPlayerId||Number(m.player2_id)===historyTargetPlayerId);
const currentSeasonMatches=currentSeasonId?serverMatches.filter((m:any)=>Number(m.season_id)===Number(currentSeasonId)):serverMatches;
const homeUpcomingMatches=currentSeasonMatches.filter((m:any)=>!isCompletedMatch(m)&&String(m.status||"").toLowerCase()!=="void").sort((a:any,b:any)=>String(a.scheduled_at||"").localeCompare(String(b.scheduled_at||"")));
const homeCompletedMatches=currentSeasonMatches.filter((m:any)=>isCompletedMatch(m)).sort((a:any,b:any)=>String(b.scheduled_at||"").localeCompare(String(a.scheduled_at||"")));
const allLiveStandings=Object.values(serverStandings).flat() as any[];
const myStanding=allLiveStandings.find((r:any)=>Number(r.player_id??r.id)===Number(currentPlayer?.id))||null;
const playerStandingByName=(name:string)=>allLiveStandings.find((r:any)=>String(r.player??r.display_name??"").toLowerCase()===String(name||"").toLowerCase())||null;
const matchResultForPlayer=(m:any,pid:number)=>{const p1=Number(m.player1_id||0),p2=Number(m.player2_id||0);const a=Number(m.player1_legs??0),b=Number(m.player2_legs??0);if(!pid||(!p1&&!p2)||a===b||pid!==p1&&pid!==p2)return"";const won=p1===pid?a>b:b>a;return won?"W":"L";};
const matchResultForMe=(m:any)=>matchResultForPlayer(m,Number(currentPlayer?.id||0));
const publicPlayerNameById=(pid:number)=>{const p=serverPlayers.find((x:any)=>Number(x?.id||0)===Number(pid));return String(p?.display_name||p?.username||"")};
let body:any;
if(tab==="Standings"){
const liveRows=serverStandings[selectedDivision]||[];const standings=liveRows.map((r:any,i:number)=>[String(r.rank??i+1),String(r.player??r.display_name??"Player"),String(r.played??r.matches_played??0),String(r.wins??0),String(r.losses??0),String(Number(r.leg_difference??r.leg_diff??0)>=0?`+${Number(r.leg_difference??r.leg_diff??0)}`:Number(r.leg_difference??r.leg_diff??0)),String(r.points??0)]);const divisionOptions=serverDivisions.map((d:any)=>({value:String(d.name),label:String(d.name)}));const seasonOptions=serverSeasons.map((x:any)=>({value:String(x.id),label:`${x.name} (${x.year})${Number(x.id)===currentSeasonId?" • Current":""}`}));
body=<ScrollView showsVerticalScrollIndicator={false}><Text style={s.title}>Standings</Text><ChoiceDropdown label="Division" value={selectedDivision} options={divisionOptions} onChange={setSelectedDivision}/><ChoiceDropdown label="Season" value={selectedSeasonId} options={seasonOptions} onChange={setSelectedSeasonId} placeholder="Current Season"/><View style={s.tableCard}><View style={[s.row,s.standingsHeader]}><Text style={[s.standCell,s.rankCell]}>RANK</Text><Text style={[s.standCell,s.nameCell]}>NAME</Text><Text style={s.standCell}>P</Text><Text style={s.standCell}>W</Text><Text style={s.standCell}>L</Text><Text style={[s.standCell,s.legsCell]}>LD</Text><Text style={s.standCell}>PTS</Text></View>{standings.length?standings.map((r:any)=><View key={`${r[0]}-${r[1]}`} style={s.row}><Text style={[s.standCell,s.rankCell]}>{r[0]}</Text><Pressable style={s.nameCell} onPress={()=>openPlayer(r[1])}><Text style={s.playerLink} numberOfLines={1}>{r[1]}</Text></Pressable><Text style={s.standCell}>{r[2]}</Text><Text style={s.standCell}>{r[3]}</Text><Text style={s.standCell}>{r[4]}</Text><Text style={[s.standCell,s.legsCell]}>{r[5]}</Text><Text style={s.standCell}>{r[6]}</Text></View>):<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>NO STANDINGS YET</Text><Text style={s.emptyStateText}>No standings are stored for this division and season yet.</Text></View>}<Text style={s.standingsKey}>P = Played   W = Wins   L = Losses   LD = Legs +/-   PTS = Points</Text></View></ScrollView>;}
else if(tab==="Matches"){
const seasonOptions=serverSeasons.map((x:any)=>({value:String(x.id),label:`${x.name} (${x.year})${Number(x.id)===currentSeasonId?" • Current":""}`}));
const me=Number(currentPlayer?.id||0);
const historyOptions=[
  {value:"mine",label:"My Matches"},
  ...serverPlayers.filter((p:any)=>p?.active!==false&&Number(p?.id||0)!==me).sort((a:any,b:any)=>String(a?.display_name||a?.username||"").localeCompare(String(b?.display_name||b?.username||""))).map((p:any)=>({value:`player:${Number(p.id)}`,label:String(p.display_name||p.username||`Player ${p.id}`)})),
  {value:"league",label:"Entire League"}
];
const historyRows=(serverLeagueHistoryMatches.length?filteredHistoryMatches:(historyPlayerFilter==="mine"?completedMatches:[]));
body=<ScrollView showsVerticalScrollIndicator={false}>
<Text style={s.title}>Matches</Text>
<ChoiceDropdown label="Season" value={selectedSeasonId} options={seasonOptions} onChange={setSelectedSeasonId} placeholder="Current Season"/>
<View style={s.managerNotice}><Text style={s.managerNoticeTitle}>RESULT SCREENSHOT EVIDENCE</Text><Text style={s.managerNoticeText}>Use the original AutoDarts result screenshot captured on the PC running AutoDarts. When you select it here, the app uploads the image directly to the league server and confirms receipt.</Text></View>
<Text style={s.statsSection}>UPCOMING — MY MATCHES</Text>
{upcomingMatches.length?upcomingMatches.map((m:any)=>{const key=String(m.id);const opponent=neutralOpponent(m,currentPlayer?.id);const opponentId=Number(m.player1_id)===me?Number(m.player2_id||0):Number(m.player1_id||0);const queued=matchScreenshots[key]?.length||0;return <View key={key} style={s.matchCard}><View style={s.matchCardRow}><View style={s.matchCardInfo}><Text style={s.matchDivision}>{String(m.division_name||currentPlayer?.division_name||"LEAGUE MATCH").toUpperCase()} • WEEK {m.week_no||"—"}</Text><View style={s.matchPlayersLeft}><Text style={s.matchSelfName}>{currentPlayer?.display_name||currentPlayer?.username||"YOU"}</Text><Text style={s.vsLarge}> VS </Text><PlayerLink name={String(opponent||"Opponent")} playerId={opponentId} textStyle={s.matchSelfName}/></View><Text style={s.matchDateLeft}>{localMatchLabel(m,timeZone)}</Text><Text style={s.matchMetaLeft}>{m.stage&&m.stage!=="regular_season"?String(m.round_label||m.stage):"Regular Season"} • Best of {m.best_of||5} • Server scheduled</Text>{Number(m.evidence_count||0)>0?<Text style={s.uploadReady}>✓ SERVER HAS {Number(m.evidence_count||0)} evidence file{Number(m.evidence_count||0)===1?"":"s"}</Text>:null}{queued?<Text style={s.uploadQueued}>LOCAL QUEUE: {queued} READY</Text>:null}</View><Pressable style={[s.uploadResultsButton,!!matchUploadWorkingId&&{opacity:.55}]} disabled={!!matchUploadWorkingId} onPress={()=>pickMatchScreenshots(key)}><Text style={s.uploadResultsIcon}>＋</Text><Text style={s.uploadResultsText}>{queued?"ADD MORE":"ADD"}</Text><Text style={s.uploadResultsText}>EVIDENCE</Text></Pressable></View>{queuedEvidenceTray(key,()=>pickMatchScreenshots(key),()=>uploadQueuedMatchEvidence(key))}</View>}):<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>NO UPCOMING MATCHES</Text><Text style={s.emptyStateText}>Server-generated matches for this season will appear here automatically.</Text></View>}
<Text style={s.statsSection}>COMPLETED / HISTORY</Text>
<ChoiceDropdown label="Past Matches" value={historyPlayerFilter} options={historyOptions} onChange={setHistoryPlayerFilter}/>
{historyRows.length?historyRows.map((m:any)=>{const p1id=Number(m.player1_id||0),p2id=Number(m.player2_id||0),p1=String(m.player1_name||publicPlayerNameById(p1id)||"Player 1"),p2=String(m.player2_name||publicPlayerNameById(p2id)||"Player 2");const leagueView=historyPlayerFilter==="league";const perspectiveId=historyTargetPlayerId;const perspectiveP1=p1id===perspectiveId;const subjectId=perspectiveP1?p1id:p2id;const opponentId=perspectiveP1?p2id:p1id;const subjectName=perspectiveP1?p1:p2;const opponentName=perspectiveP1?p2:p1;const myScore=perspectiveP1?m.player1_legs:m.player2_legs;const oppScore=perspectiveP1?m.player2_legs:m.player1_legs;const result=leagueView?"":matchResultForPlayer(m,perspectiveId);const canUpload=p1id===me||p2id===me;const queueKey=String(m.id);const queued=matchScreenshots[queueKey]?.length||0;return <View key={String(m.id)} style={s.matchCard}><View style={s.matchCardRow}><View style={s.matchCardInfo}><Text style={s.matchDivision}>{String(m.division_name||"LEAGUE MATCH").toUpperCase()} • WEEK {m.week_no||"—"}</Text>{leagueView?<View style={s.matchPlayersLeft}><PlayerLink name={p1} playerId={p1id} textStyle={s.matchSelfName}/><Text style={s.vsLarge}> {m.player1_legs??"–"} - {m.player2_legs??"–"} </Text><PlayerLink name={p2} playerId={p2id} textStyle={s.matchSelfName}/></View>:<View style={s.matchPlayersLeft}><Text style={[s.matchResultLetter,result==="L"&&{color:"#ff5d67"}]}>{result||"•"}</Text><PlayerLink name={subjectName} playerId={subjectId} textStyle={s.matchSelfName}/><Text style={s.vsLarge}> {myScore??"–"} - {oppScore??"–"} </Text><PlayerLink name={opponentName} playerId={opponentId} textStyle={s.matchSelfName}/></View>}<Text style={s.matchDateLeft}>{localMatchLabel(m,timeZone)}</Text><Text style={s.matchMetaLeft}>Completed • Best of {m.best_of||5} • Stored on league server • Evidence {Number(m.evidence_count||0)}</Text>{Number(m.evidence_count||0)>0?<Text style={s.uploadReady}>✓ SERVER HAS {Number(m.evidence_count||0)} evidence file{Number(m.evidence_count||0)===1?"":"s"}</Text>:null}{queued?<Text style={s.uploadQueued}>LOCAL QUEUE: {queued} READY</Text>:null}</View>{canUpload?<Pressable style={[s.uploadResultsButton,!!matchUploadWorkingId&&{opacity:.55}]} disabled={!!matchUploadWorkingId} onPress={()=>pickMatchScreenshots(queueKey)}><Text style={s.uploadResultsIcon}>＋</Text><Text style={s.uploadResultsText}>{queued?"ADD MORE":"ADD"}</Text><Text style={s.uploadResultsText}>EVIDENCE</Text></Pressable>:null}</View>{canUpload?queuedEvidenceTray(queueKey,()=>pickMatchScreenshots(queueKey),()=>uploadQueuedMatchEvidence(queueKey)):null}</View>}):<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>NO COMPLETED MATCHES</Text><Text style={s.emptyStateText}>{historyPlayerFilter==="league"?"No completed league matches are stored for this season.":"No completed matches are stored for this selection and season."}</Text></View>}
</ScrollView>;
}
else if(tab==="Tournament"){
const seasonOptions=serverSeasons.map((x:any)=>({value:String(x.id),label:`${x.name} (${x.year})${Number(x.id)===currentSeasonId?" • Current":""}`}));
const tournamentRows=serverTournamentMatches.filter((m:any)=>!selectedSeasonId||!m?.season_id||Number(m.season_id)===Number(selectedSeasonId));
const groups:Record<string,any[]>={};for(const m of tournamentRows){const key=String(m?.division_name||m?.division||"League Tournament");(groups[key]||(groups[key]=[])).push(m);}
const roundOrder=(m:any)=>{const r=String(m?.round_label||m?.round_name||m?.round||m?.stage||"").toLowerCase();if(r.includes("quarter"))return 0;if(r.includes("semi"))return 1;if(r.includes("final")||r.includes("championship"))return 2;return 1;};
body=<ScrollView showsVerticalScrollIndicator={false}><Text style={s.title}>Tournament Brackets</Text><ChoiceDropdown label="Season" value={selectedSeasonId} options={seasonOptions} onChange={setSelectedSeasonId} placeholder="Current Season"/>{!tournamentEndpointReady?<View style={s.managerNotice}><Text style={s.managerNoticeTitle}>TOURNAMENT SERVER LINK PENDING</Text><Text style={s.managerNoticeText}>This section is reserved for the official league tournament and division playoff system. It remains completely separate from manager-created tournaments.</Text></View>:<View style={s.managerNotice}><Text style={s.managerNoticeTitle}>OFFICIAL LEAGUE TOURNAMENTS</Text><Text style={s.managerNoticeText}>Official tournament and division-playoff brackets are loaded from the league server and are not changed by manager-created tournaments.</Text></View>}{Object.keys(groups).length?Object.entries(groups).map(([division,rows]:any)=><View key={division}><Text style={s.statsSection}>{String(division).toUpperCase()}</Text>{[...rows].sort((a:any,b:any)=>roundOrder(a)-roundOrder(b)||String(a?.scheduled_at||"").localeCompare(String(b?.scheduled_at||""))).map((m:any)=>{const done=isCompletedMatch(m);const p1=String(m?.player1_name||m?.player1||"TBD");const p2=String(m?.player2_name||m?.player2||"TBD");const score=done?`${m?.player1_legs??"–"} - ${m?.player2_legs??"–"}`:"VS";return <View key={String(m?.id||`${division}-${tournamentRoundLabel(m)}-${p1}-${p2}`)} style={s.matchCard}><View style={s.matchCardInfo}><Text style={s.matchDivision}>{tournamentRoundLabel(m).toUpperCase()}</Text><View style={s.matchPlayersLeft}><PlayerLink name={p1} playerId={Number(m?.player1_id||0)} textStyle={s.matchSelfName}/><Text style={s.vsLarge}> {score} </Text><PlayerLink name={p2} playerId={Number(m?.player2_id||0)} textStyle={s.matchSelfName}/></View><Text style={s.matchDateLeft}>{localMatchLabel(m,timeZone)}</Text><Text style={s.matchMetaLeft}>Best of {m?.best_of||5} • {done?"Completed":"Scheduled"} • Official server bracket</Text></View></View>})}</View>):<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>NO OFFICIAL TOURNAMENT BRACKET YET</Text><Text style={s.emptyStateText}>Official division playoffs or league tournament brackets will appear here automatically.</Text></View>}{managerTournaments.length?<View style={s.managerTournamentLinkSection}><Text style={s.statsSection}>MANAGER-CREATED TOURNAMENTS</Text>{managerTournaments.map((mt:any)=><Pressable key={String(mt?.id||mt?.name)} style={s.managerTournamentLink} onPress={()=>{setManagerTournament(mt);setManagerTournamentTab("Matches");setTab("ManagerTournament")}}><View style={s.managerTournamentLinkIcon}><Text style={s.managerTournamentLinkIconText}>🏅</Text></View><View style={{flex:1}}><Text style={s.managerTournamentLinkName}>{String(mt?.name||"Tournament")}</Text><Text style={s.managerTournamentLinkMeta}>{String(mt?.start_label||mt?.scheduled_label||mt?.start_at||"")} • {String(mt?.status||"scheduled").replace(/_/g," ").toUpperCase()} • Single Elimination</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>)}</View>:null}</ScrollView>;}
else if(tab==="ManagerTournament"&&managerTournament){
const mt:any=managerTournament||{};const matches=Array.isArray(mt.matches)?mt.matches:[];const bracketMatches=Array.isArray(mt.bracket?.matches)?mt.bracket.matches:Array.isArray(mt.bracket)?mt.bracket:matches;const me=Number(currentPlayer?.id||0);const rounds:Record<string,any[]>={};for(const m of bracketMatches){const r=String(m?.round_label||m?.round_name||m?.round||"Round 1");(rounds[r]||(rounds[r]=[])).push(m);}const ruleRows=Array.isArray(mt.rules)&&mt.rules.length?mt.rules:["Single Elimination","Best of 5 Legs","No Draws","Current league match rules apply","Tournament results do not affect league statistics","Upload result evidence the same way as regular-season matches"];
body=<ScrollView showsVerticalScrollIndicator={false}><View style={s.tournamentDetailHeader}><Pressable onPress={()=>setTab("Tournament")} hitSlop={10}><Text style={s.tournamentBack}>‹</Text></Pressable><View style={{flex:1}}><Text style={s.tournamentDetailTitle}>{String(mt.name||"Tournament")}</Text><Text style={s.tournamentDetailMeta}>{String(mt.start_label||mt.scheduled_label||mt.start_at||"")} • SINGLE ELIMINATION</Text></View></View><View style={s.tournamentTabs}>{["Matches","Bracket","Rules"].map(x=><Pressable key={x} style={[s.tournamentTabButton,managerTournamentTab===x&&s.tournamentTabButtonActive]} onPress={()=>setManagerTournamentTab(x)}><Text style={[s.tournamentTabText,managerTournamentTab===x&&s.tournamentTabTextActive]}>{x.toUpperCase()}</Text></Pressable>)}</View>{managerTournamentTab==="Matches"?<View><Text style={s.statsSection}>UPCOMING / ACTIVE MATCHES</Text>{matches.length?matches.map((m:any)=>{const p1=String(m?.player1_name||m?.player1||"TBD"),p2=String(m?.player2_name||m?.player2||"TBD");const mine=Number(m?.player1_id||0)===me||Number(m?.player2_id||0)===me;const done=isCompletedMatch(m);const key=String(m?.id||`${p1}-${p2}`);return <View key={key} style={s.matchCard}><View style={s.matchCardRow}><View style={s.matchCardInfo}><Text style={s.matchDivision}>{String(m?.round_label||m?.round_name||"TOURNAMENT MATCH").toUpperCase()}</Text><View style={s.matchPlayersLeft}><PlayerLink name={p1} playerId={Number(m?.player1_id||0)} textStyle={s.matchSelfName}/><Text style={s.vsLarge}> {done?`${m?.player1_legs??"–"} - ${m?.player2_legs??"–"}`:"VS"} </Text><PlayerLink name={p2} playerId={Number(m?.player2_id||0)} textStyle={s.matchSelfName}/></View><Text style={s.matchDateLeft}>{String(m?.scheduled_label||m?.scheduled_at||mt?.start_label||mt?.start_at||"")}</Text><Text style={s.matchMetaLeft}>Best of {m?.best_of||mt?.best_of||5} • {done?"Completed":"Single elimination"} • Does not affect league stats</Text></View>{mine&&!done?<Pressable style={[s.uploadResultsButton,!!matchUploadWorkingId&&{opacity:.55}]} disabled={!!matchUploadWorkingId} onPress={()=>pickManagerTournamentScreenshots(key)}><Text style={s.uploadResultsIcon}>＋</Text><Text style={s.uploadResultsText}>{(matchScreenshots[`t-${key}`]?.length||0)>0?"ADD MORE":"ADD"}</Text><Text style={s.uploadResultsText}>EVIDENCE</Text></Pressable>:null}</View>{mine&&!done?queuedEvidenceTray(`t-${key}`,()=>pickManagerTournamentScreenshots(key),()=>uploadQueuedManagerTournamentEvidence(key)):null}</View>}):<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>BRACKET NOT GENERATED YET</Text><Text style={s.emptyStateText}>The server will create the bracket after signup closes 10 minutes before the tournament starts.</Text></View>}</View>:managerTournamentTab==="Bracket"?<View><Text style={s.statsSection}>LIVE BRACKET</Text>{Object.keys(rounds).length?<RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bracketScroll}>{Object.entries(rounds).map(([round,rows]:any)=><View key={round} style={s.bracketColumn}><Text style={s.bracketRoundTitle}>{String(round).toUpperCase()}</Text>{rows.map((m:any,i:number)=><View key={String(m?.id||i)} style={s.bracketMatch}><View style={{flexDirection:"row",alignItems:"center"}}><PlayerLink name={String(m?.player1_name||m?.player1||"TBD")} playerId={Number(m?.player1_id||0)} textStyle={s.bracketPlayer}/>{isCompletedMatch(m)?<Text style={s.bracketPlayer}> {String(m?.player1_legs??"")}</Text>:null}</View><View style={s.bracketDivider}/><View style={{flexDirection:"row",alignItems:"center"}}><PlayerLink name={String(m?.player2_name||m?.player2||"TBD")} playerId={Number(m?.player2_id||0)} textStyle={s.bracketPlayer}/>{isCompletedMatch(m)?<Text style={s.bracketPlayer}> {String(m?.player2_legs??"")}</Text>:null}</View></View>)}</View>)}</RNScrollView>:<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>BRACKET NOT GENERATED YET</Text><Text style={s.emptyStateText}>Confirmed entrants will be placed into the single-elimination bracket automatically when signup closes.</Text></View>}</View>:<View><Text style={s.statsSection}>TOURNAMENT RULES</Text><View style={s.tournamentRulesCard}>{ruleRows.map((r:any,i:number)=><View key={i} style={s.tournamentRuleRow}><Text style={s.tournamentRuleCheck}>✓</Text><Text style={s.tournamentRuleText}>{String(r)}</Text></View>)}</View><View style={s.managerNotice}><Text style={s.managerNoticeTitle}>SEPARATE FROM LEAGUE STATISTICS</Text><Text style={s.managerNoticeText}>This manager-created tournament never changes regular-season standings, regular-season statistics, or official league tournament statistics.</Text></View></View>}</ScrollView>;}
else if(tab==="ManagerTournament"){body=<ScrollView showsVerticalScrollIndicator={false}><Pressable onPress={()=>setTab("Tournament")}><Text style={s.backLink}>‹ BACK TO TOURNAMENTS</Text></Pressable><Text style={s.title}>Tournament</Text><View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>NO ACTIVE MANAGER-CREATED TOURNAMENT</Text><Text style={s.emptyStateText}>When the manager creates the next tournament, its named link will appear under the Tournament tab.</Text></View></ScrollView>;}
else if(tab==="PlayerStats"&&selectedPlayer){
const live=playerStandingByName(selectedPlayer);
const played=Number(live?.played??live?.matches_played??0);
const wins=Number(live?.wins??0);
const losses=Number(live?.losses??0);
const winPct=played?`${((wins/played)*100).toFixed(1)}%`:"0.0%";
const selectedIsMe=String(selectedPlayer).toLowerCase()===String(currentPlayer?.display_name||currentPlayer?.username||"").toLowerCase();
const profilePlayerId=selectedIsMe?Number(currentPlayer?.id||0):Number(selectedPlayerId||playerIdForName(selectedPlayer));
const profilePlayerRecord=serverPlayers.find((p:any)=>Number(p?.id||0)===profilePlayerId)||null;
const profileSeasonStats=selectedIsMe?serverSeasonStats:selectedPlayerSeasonStats;
const profileCareerStats=selectedIsMe?serverCareerStats:selectedPlayerCareerStats;
const recentSource=serverLeagueHistoryMatches.length?serverLeagueHistoryMatches:completedMatches;
const recent=recentSource.filter((m:any)=>Number(m?.player1_id||0)===profilePlayerId||Number(m?.player2_id||0)===profilePlayerId).sort((a:any,b:any)=>String(b?.scheduled_at||"").localeCompare(String(a?.scheduled_at||""))).slice(0,5);
body=<ScrollView showsVerticalScrollIndicator={false}>
<View style={s.profileHeaderRow}><Pressable onPress={()=>setTab("Standings")} hitSlop={8}><Text style={s.profileBack}>‹</Text></Pressable><Text style={s.profilePageTitle}>PLAYER PROFILE</Text><Text style={s.profileMore}>•••</Text></View>
<View style={s.profileHero}><View style={s.profileAvatarWrap}><View style={s.profileAvatarCircle}><Text style={s.profileAvatarInitial}>{selectedPlayer.slice(0,1).toUpperCase()}</Text></View></View><View style={s.profileHeroRight}><Text style={s.profileBigName}>{selectedPlayer.toUpperCase()}</Text><View style={s.profileAwardsLarge}><AwardsOnly name={selectedPlayer}/></View></View></View>
<View style={s.profileMetaRow}><View style={s.profileMetaItem}><Text style={s.profileMetaIcon}>🛡</Text><Text style={s.profileMetaLabel}>DIVISION</Text><Text style={s.profileMetaValue}>{selectedIsMe?(currentPlayer?.division_name||"—"):(profilePlayerRecord?.division_name||live?.division_name||"—")}</Text></View><View style={s.profileMetaDivider}/><View style={s.profileMetaItem}><Text style={s.profileMetaIcon}>▥</Text><Text style={s.profileMetaLabel}>RANK</Text><Text style={s.profileMetaValue}>{live?.rank?`#${live.rank}`:"—"}</Text></View><View style={s.profileMetaDivider}/><View style={s.profileMetaItem}><Text style={s.profileMetaIcon}>▣</Text><Text style={s.profileMetaLabel}>MATCHES</Text><Text style={s.profileMetaValue}>{played}</Text></View><View style={s.profileMetaDivider}/><View style={s.profileMetaItem}><Text style={s.profileMetaIcon}>◷</Text><Text style={s.profileMetaLabel}>TIME ZONE</Text><Text style={s.profileMetaValue}>{selectedIsMe?(US_TIME_ZONES.find(z=>z.value===(currentPlayer?.timezone||timeZone))?.label||"—"):"—"}</Text></View></View>
<View style={s.profileTabs}><Text style={[s.profileTab,s.profileTabActive]}>OVERVIEW</Text><Text style={s.profileTab}>MATCH HISTORY</Text><Text style={s.profileTab}>STATS DETAIL</Text><Text style={s.profileTab}>ACHIEVEMENTS</Text></View>
<View style={s.profileSectionCard}><View style={s.profileSectionHeader}><Text style={s.profileSectionTitle}>SEASON STATS</Text><Text style={s.profileSeasonYear}>SERVER DATA</Text></View><View style={s.profileStatsMatrix}>{[["MATCHES",String(played),"#ffffff"],["WINS",String(wins),"#35c759"],["LOSSES",String(losses),"#ff5d67"],["WIN %",winPct,"#9b6cff"],["3-DART AVG",selectedPlayerStatsLoading&&!selectedIsMe?"…":formatStat(profileSeasonStats.three_dart_average),"#2f80ed"],["FIRST 9",selectedPlayerStatsLoading&&!selectedIsMe?"…":formatStat(profileSeasonStats.first9_average),"#f2c94c"],["CHECKOUT %",selectedPlayerStatsLoading&&!selectedIsMe?"…":`${formatStat(profileSeasonStats.checkout_pct,1)}%`,"#2ec4b6"],["HIGH FINISH",selectedPlayerStatsLoading&&!selectedIsMe?"…":formatStatInt(profileSeasonStats.highest_checkout),"#ff453a"],["BEST LEG",selectedPlayerStatsLoading&&!selectedIsMe?"…":(Number(profileSeasonStats.best_leg)>0?`${formatStatInt(profileSeasonStats.best_leg)} DARTS`:"—"),"#35c759"]].map((x:any,i:number)=><View key={i} style={s.profileStatBox}><Text style={s.profileStatLabel}>{x[0]}</Text><Text style={[s.profileStatValue,{color:x[2]}]}>{x[1]}</Text></View>)}</View><Text style={s.statsNote}>{selectedPlayerStatsError&&!selectedIsMe?`SERVER STATS ERROR • ${selectedPlayerStatsError}`:`LIVE SERVER STATS • ${formatStatInt(profileSeasonStats.matches_with_stats)} approved match${Number(profileSeasonStats.matches_with_stats||0)===1?"":"es"} with imported dart statistics.`}</Text></View>
<View style={s.profileSectionCard}><View style={s.profileSectionHeader}><Text style={s.profileSectionTitle}>CAREER STATS</Text><Text style={s.profileSeasonYear}>SERVER DATA ONLY</Text></View><View style={s.profileStatsMatrix}>{[["MATCHES",String(played),"#ffffff"],["WINS",String(wins),"#35c759"],["LOSSES",String(losses),"#ff5d67"],["WIN %",winPct,"#9b6cff"],["3-DART AVG",selectedPlayerStatsLoading&&!selectedIsMe?"…":formatStat(profileCareerStats.three_dart_average),"#2f80ed"],["FIRST 9",selectedPlayerStatsLoading&&!selectedIsMe?"…":formatStat(profileCareerStats.first9_average),"#f2c94c"],["CHECKOUT %",selectedPlayerStatsLoading&&!selectedIsMe?"…":`${formatStat(profileCareerStats.checkout_pct,1)}%`,"#2ec4b6"],["HIGH FINISH",selectedPlayerStatsLoading&&!selectedIsMe?"…":formatStatInt(profileCareerStats.highest_checkout),"#ff453a"],["BEST LEG",selectedPlayerStatsLoading&&!selectedIsMe?"…":(Number(profileCareerStats.best_leg)>0?`${formatStatInt(profileCareerStats.best_leg)} DARTS`:"—"),"#35c759"]].map((x:any,i:number)=><View key={i} style={s.profileStatBox}><Text style={s.profileStatLabel}>{x[0]}</Text><Text style={[s.profileStatValue,{color:x[2]}]}>{x[1]}</Text></View>)}</View></View>
<View style={s.profileSectionCard}><View style={s.profileRecentHeader}><Text style={s.profileSectionTitle}>RECENT MATCHES</Text></View>{recent.length?recent.map((m:any)=>{const isP1=Number(m.player1_id)===profilePlayerId;const opponent=isP1?m.player2_name:m.player1_name;const opponentId=isP1?Number(m.player2_id||0):Number(m.player1_id||0);const myScore=isP1?m.player1_legs:m.player2_legs;const oppScore=isP1?m.player2_legs:m.player1_legs;const result=matchResultForPlayer(m,profilePlayerId);return <View key={String(m.id)} style={s.profileMatchRow}><View style={[s.profileResultBadge,result==="L"&&s.profileResultLoss]}><Text style={s.profileResultText}>{result||"•"}</Text></View><View style={s.profileOpponentAvatar}><Text style={s.profileOpponentInitial}>{String(opponent||"?")[0]}</Text></View><View style={s.profileOpponentInfo}><PlayerLink name={String(opponent||"Opponent")} playerId={opponentId} textStyle={s.profileOpponentName}/><Text style={s.profileOpponentSub}>Server match record</Text></View><Text style={[s.profileScore,result==="L"&&{color:"#ff453a"}]}>{myScore??"–"} - {oppScore??"–"}</Text><View style={s.profileMatchDateWrap}><Text style={s.profileMatchDate}>{localMatchLabel(m,timeZone)}</Text><Text style={s.profileMatchType}>Completed</Text></View></View>}):<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>NO MATCH HISTORY AVAILABLE</Text><Text style={s.emptyStateText}>Completed server matches for this player and season will appear here.</Text></View>}</View>
</ScrollView>;
}else if(tab==="Stats"){
const played=Number(myStanding?.played??myStanding?.matches_played??0);
const wins=Number(myStanding?.wins??0);
const losses=Number(myStanding?.losses??0);
const points=Number(myStanding?.points??0);
body=<ScrollView showsVerticalScrollIndicator={false}>
<Text style={s.title}>My Stats</Text>
<Text style={s.statsSection}>MATCH RECORD</Text>
<View style={s.statsGrid}>{[["PLAYED",String(played)],["WINS",String(wins)],["LOSSES",String(losses)],["POINTS",String(points)],["RANK",myStanding?.rank?`#${myStanding.rank}`:"—"]].map(x=><View key={x[0]} style={s.statsTile}><Text style={s.statsValue}>{x[1]}</Text><Text style={s.statsLabel}>{x[0]}</Text></View>)}</View>
<Text style={s.statsSection}>AVERAGES & CHECKOUTS</Text>
<View style={s.statsGrid}>{[["3-DART AVERAGE",formatStat(serverSeasonStats.three_dart_average)],["AVG UNTIL 170",formatStat(serverSeasonStats.average_until_170)],["FIRST 9 DART AVG",formatStat(serverSeasonStats.first9_average)],["CHECKOUT %",`${formatStat(serverSeasonStats.checkout_pct,1)}%`],["HIGHEST CHECKOUT",formatStatInt(serverSeasonStats.highest_checkout)],["BEST LEG (DARTS)",Number(serverSeasonStats.best_leg)>0?formatStatInt(serverSeasonStats.best_leg):"—"]].map(x=><View key={x[0]} style={s.statsTile}><Text style={s.statsValue}>{x[1]}</Text><Text style={s.statsLabel}>{x[0]}</Text></View>)}</View>
<Text style={s.statsSection}>3-DART TOTALS</Text>
<View style={s.statsGrid}>{[["60+",formatStatInt(serverSeasonStats["60_plus"])],["100+",formatStatInt(serverSeasonStats["100_plus"])],["140+",formatStatInt(serverSeasonStats["140_plus"])],["170+",formatStatInt(serverSeasonStats["170_plus"])],["180",formatStatInt(serverSeasonStats["180s"])]].map(x=><View key={x[0]} style={s.statsTile}><Text style={s.statsValue}>{x[1]}</Text><Text style={s.statsLabel}>{x[0]}</Text></View>)}</View>
<Text style={s.statsNote}>LIVE FROM LEAGUE SERVER • {formatStatInt(serverSeasonStats.matches_with_stats)} approved match{Number(serverSeasonStats.matches_with_stats||0)===1?"":"es"} currently contribute detailed dart statistics. No sample or test values are used.</Text>
</ScrollView>;}
else if(tab==="Settings")body=<ScrollView showsVerticalScrollIndicator={false}>
<Text style={s.title}>Settings</Text>
<Pressable style={s.settingsRow} onPress={()=>setTab("ProfileSetup")}><View><Text style={s.settingsTitle}>Profile Setup</Text><Text style={s.settingsSub}>Player name, profile and account preferences</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>
<Pressable style={s.settingsRow} onPress={()=>setTab("FontSize")}><View><Text style={s.settingsTitle}>GUI Font Size</Text><Text style={s.settingsSub}>Adjust text size throughout the app</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>
<Pressable style={s.settingsRow} onPress={()=>setTab("Security")}><View><Text style={s.settingsTitle}>Security</Text><Text style={s.settingsSub}>Change password and manage account security</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>
<Pressable style={s.settingsRow} onPress={()=>setTab("LeagueRules")}><View><Text style={s.settingsTitle}>League Rules</Text><Text style={s.settingsSub}>View official US AutoDarts League rules</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>
<Pressable style={s.settingsRow} onPress={()=>setTab("TrophyCase")}><View><Text style={s.settingsTitle}>Trophies</Text><Text style={s.settingsSub}>Pictures and meanings for every official trophy and badge</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>
{serverRole==="manager"?<Pressable style={[s.settingsRow,s.managerSettingsRow]} onPress={()=>setTab("ManagerServer")}><View style={{flex:1}}><Text style={s.settingsTitle}>Server</Text><Text style={s.settingsSub}>Full league management • read/write access to the Windows server</Text></View><View style={s.managerNewPill}><Text style={s.managerNewText}>MANAGER</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>:serverRole==="moderator"?<Pressable style={[s.settingsRow,s.managerSettingsRow]} onPress={()=>setTab("ModeratorServer")}><View style={{flex:1}}><Text style={s.settingsTitle}>Server</Text><Text style={s.settingsSub}>Add players, reset passwords, reschedule generated matches, and enter results</Text></View><View style={s.managerNewPill}><Text style={s.managerNewText}>MODERATOR</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>:null}
<Pressable style={s.settingsRow} onPress={()=>setTab("Updates")}><View><Text style={s.settingsTitle}>Updates</Text><Text style={s.settingsSub}>Automatic small fixes and manual update check</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>
<Pressable style={s.settingsRow} onPress={()=>setTab("AppInfo")}><View><Text style={s.settingsTitle}>App Info</Text><Text style={s.settingsSub}>Installed app version and build information</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>
<Pressable style={s.settingsRow} onPress={()=>setTab("Contact")}><View><Text style={s.settingsTitle}>Contact</Text><Text style={s.settingsSub}>League support and contact information</Text></View><Text style={s.settingsArrow}>›</Text></Pressable>
<Pressable style={[s.settingsRow,s.logoutSettingsRow]} onPress={logout}><View><Text style={[s.settingsTitle,s.logoutSettingsTitle]}>Logout</Text><Text style={s.settingsSub}>Sign out of this account on this device</Text></View><Text style={[s.settingsArrow,s.logoutSettingsTitle]}>›</Text></Pressable>
<Text style={[s.settingsSub,{textAlign:"center",marginTop:12,marginBottom:8}]}>{Platform.OS==="web"?`WEB v${APP_VERSION}`:`APP v${APP_VERSION}`} • LIVE SERVER STATS</Text>
</ScrollView>;
else if(tab==="ProfileSetup")body=<ScrollView showsVerticalScrollIndicator={false}>
<Pressable onPress={()=>setTab("Settings")}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable>
<Text style={s.title}>Profile Setup</Text>
<View style={s.settingsPanel}>
<Text style={s.settingsTitle}>Player Profile</Text>
<View style={s.profilePhotoRow}>
<Pressable style={s.profilePhotoButton} onPress={pickProfileImage}>
{profileImage?<Image source={{uri:profileImage}} style={s.profilePhoto}/>:<Text style={s.profilePhotoIcon}>📷</Text>}
</Pressable>
<View style={s.profilePhotoText}><Text style={s.securityLabel}>Profile Picture</Text><Text style={s.settingsSub}>Tap the picture to choose or crop a photo.</Text></View>
</View>
<Text style={s.securityLabel}>Player Name</Text>
<TextInput value={playerName||currentPlayer?.display_name||""} editable={false} selectTextOnFocus={false} style={[s.profileInput,s.profileReadOnly]}/>
<Text style={s.profileReadOnlyNote}>READ ONLY • MANAGED BY LEAGUE SERVER</Text>
<Text style={s.securityLabel}>Screen Name</Text>
<TextInput value={screenName||currentPlayer?.username||""} editable={false} selectTextOnFocus={false} style={[s.profileInput,s.profileReadOnly]}/>
<Text style={s.profileReadOnlyNote}>READ ONLY • MANAGED BY LEAGUE SERVER</Text>
<ChoiceDropdown label="Time Zone" value={timeZone} options={US_TIME_ZONES} onChange={setTimeZone}/>
<Pressable style={s.securityButton} onPress={saveProfile}><Text style={s.securityButtonText}>SAVE PROFILE</Text></Pressable>
</View>
</ScrollView>;
else if(tab==="FontSize")body=<ScrollView showsVerticalScrollIndicator={false}><Pressable onPress={()=>setTab("Settings")}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable><Text style={s.title}>GUI Font Size</Text><View style={s.settingsPanel}><ChoiceDropdown label="Display Size" value={String(fontScale)} options={[{value:"0.9",label:"Small"},{value:"1",label:"Normal"},{value:"1.15",label:"Large"}]} onChange={v=>setGlobalFontScale(Number(v))}/><Text style={[s.fontPreview,{fontSize:18*fontScale}]}>US AutoDarts League</Text></View></ScrollView>;
else if(tab==="Security")body=<ScrollView showsVerticalScrollIndicator={false}><Pressable onPress={()=>setTab("Settings")}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable><Text style={s.title}>Security</Text><View style={s.settingsPanel}><Text style={s.settingsTitle}>Change Password</Text><Text style={s.settingsSub}>Change your own league password directly on the server. A successful change invalidates older sessions. If Keep me signed in is enabled, the new credential replaces the saved one in secure device storage.</Text><View style={s.securityItem}><Text style={s.securityLabel}>Current Password</Text><TextInput value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" placeholderTextColor="#6f8597" style={s.signInInput} secureTextEntry autoCapitalize="none"/></View><View style={s.securityItem}><Text style={s.securityLabel}>New Password</Text><TextInput value={newPassword} onChangeText={setNewPassword} placeholder="New password" placeholderTextColor="#6f8597" style={s.signInInput} secureTextEntry autoCapitalize="none"/></View><View style={s.securityItem}><Text style={s.securityLabel}>Confirm New Password</Text><TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" placeholderTextColor="#6f8597" style={s.signInInput} secureTextEntry autoCapitalize="none" onSubmitEditing={changeOwnPassword}/></View>{passwordError?<Text style={s.signInError}>{passwordError}</Text>:null}<Pressable style={[s.securityButton,passwordWorking&&{opacity:.65}]} onPress={changeOwnPassword} disabled={passwordWorking}><Text style={s.securityButtonText}>{passwordWorking?"CHANGING…":"CHANGE PASSWORD"}</Text></Pressable></View></ScrollView>;
else if(tab==="Updates")body=<ScrollView showsVerticalScrollIndicator={false}><Pressable onPress={()=>setTab("Settings")}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable><Text style={s.title}>Updates</Text><View style={s.settingsPanel}><Text style={s.settingsTitle}>App Updates</Text><Text style={s.settingsSub}>The app checks for compatible small updates automatically when it opens. These updates can fix JavaScript, interface, wording, and API-handling problems without downloading a whole new APK. Native Android changes still require a new APK.</Text><View style={s.updateStatusCard}><Text style={s.updateStatusLabel}>STATUS</Text><Text style={s.updateStatusText}>{updateStatus}</Text>{updateLastChecked?<Text style={s.updateLastChecked}>Last checked: {updateLastChecked}</Text>:null}<Text style={s.updateRuntime}>Installed version: {APP_VERSION}</Text><Text style={s.updateRuntime}>OTA runtime: {String(Updates.runtimeVersion||"0.7.25")}</Text></View><Pressable style={[s.securityButton,updateWorking&&{opacity:.65}]} onPress={()=>checkForAppUpdate(true)} disabled={updateWorking}><Text style={s.securityButtonText}>{updateWorking?"CHECKING…":"CHECK FOR UPDATE"}</Text></Pressable>{updateDownloaded?<Pressable style={[s.securityButton,{marginTop:10},updateWorking&&{opacity:.65}]} onPress={installDownloadedUpdate} disabled={updateWorking}><Text style={s.securityButtonText}>INSTALL & RESTART</Text></Pressable>:null}</View></ScrollView>;
else if(tab==="AppInfo")body=<ScrollView showsVerticalScrollIndicator={false}><Pressable onPress={()=>setTab("Settings")}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable><Text style={s.title}>App Info</Text><View style={s.settingsPanel}><Text style={s.settingsTitle}>US AutoDarts League</Text><View style={s.updateStatusCard}><Text style={s.updateStatusLabel}>INSTALLED VERSION</Text><Text style={s.updateStatusText}>Version {APP_VERSION}</Text>{Platform.OS!=="web"&&APP_VERSION_CODE?<Text style={s.updateLastChecked}>Android build {APP_VERSION_CODE}</Text>:null}</View><Text style={s.settingsSub}>This version is read from the same app configuration used to build the APK, so it matches the version Android reports in system App info.</Text></View></ScrollView>;
else if(tab==="LeagueRules")body=<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.rulesPage}><Pressable onPress={()=>setTab("Settings")}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable><View style={s.rulesHero}><Text style={s.rulesKicker}>US AUTODARTS LEAGUE</Text><Text style={s.rulesHeroTitle}>OFFICIAL LEAGUE RULES</Text><Text style={s.rulesUpdated}>{serverRulebook.title} • {serverRulebook.version} • LIVE FROM SERVER</Text><View style={s.rulesFormatBar}><View style={s.rulesFormatItem}><Text style={s.rulesFormatValue}>501</Text><Text style={s.rulesFormatLabel}>DOUBLE OUT</Text></View><View style={s.rulesFormatDivider}/><View style={s.rulesFormatItem}><Text style={s.rulesFormatValue}>BO5</Text><Text style={s.rulesFormatLabel}>FIRST TO 3</Text></View><View style={s.rulesFormatDivider}/><View style={s.rulesFormatItem}><Text style={s.rulesFormatValue}>3 PTS</Text><Text style={s.rulesFormatLabel}>MATCH WIN</Text></View></View><Text style={s.rulesHeroNote}>This page reads the rulebook directly from the league server. New server rules populate here without rebuilding the APK.</Text></View><View style={s.rulesSectionHeadingRow}><Text style={s.rulesSectionHeading}>LEAGUE RULEBOOK</Text><Text style={s.rulesSectionCount}>{serverRulebook.sections.length} SECTIONS</Text></View>{serverRulebook.sections.map((rule:any)=><RuleCard key={rule.n} rule={rule}/>)}<View style={s.rulesAuthorityCard}><View style={s.rulesAuthorityTop}><Text style={s.rulesAuthorityIcon}>◈</Text><Text style={s.rulesAuthorityTitle}>SERVER-AUTHORITATIVE RULES</Text></View><Text style={s.rulesAuthorityText}>The server is the source of truth. The last successfully downloaded rulebook is cached only as an offline fallback.</Text></View></ScrollView>;
else if(tab==="TrophyCase")body=<TrophyCase onBack={()=>setTab("Settings")} catalog={serverAwardCatalog} earned={serverEarnedAwards}/>;
else if(tab==="ModeratorServer")body=<ModeratorServerPanel currentPlayer={currentPlayer} onBack={()=>setTab("Settings")}/>;
else if(tab==="ManagerServer")body=<ManagerServerPanel currentPlayer={currentPlayer} onBack={()=>setTab("Settings")} onOpenPlayer={(name,playerId)=>openPlayer(name,playerId)}/>;
else if(tab==="Contact")body=<ScrollView showsVerticalScrollIndicator={false}><Pressable onPress={()=>setTab("Settings")}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable><Text style={s.title}>Contact</Text><View style={s.settingsPanel}><Text style={s.settingsTitle}>US AutoDarts League Support</Text><Text style={s.settingsSub}>We can add league email, Discord, website and administrator contact options here when those details are finalized.</Text></View></ScrollView>;
else body=<ScrollView showsVerticalScrollIndicator={false}>
<View style={s.homeTop}><Text style={s.homeWelcomeSmall}>WELCOME BACK,</Text><Text style={s.homeWelcomeBig}>{(currentPlayer?.display_name||playerName||"PLAYER").toUpperCase()}!</Text><Text style={s.homeDivision}>{currentPlayer?.division_name||"Unassigned"}</Text></View>
<View style={s.serverStatusCard}><View style={[s.serverDot,{backgroundColor:serverOnline===true?"#39d353":serverOnline===false?"#ff453a":"#f2c94c"}]}/><View style={{flex:1}}><Text style={s.serverStatusTitle}>{serverOnline===true?"SERVER CONNECTED":serverOnline===false?"SERVER OFFLINE":"CHECKING SERVER"}</Text><Text style={s.serverStatusUrl}>{API_BASE_URL}</Text></View><Pressable onPress={refreshServerData} hitSlop={8}><Text style={s.serverRefresh}>↻</Text></Pressable></View>
<View style={s.heroCompact}><Text style={s.brandUS}>US</Text><Text style={s.brandAuto}>AUTODARTS</Text><Text style={s.brandLeague}>LEAGUE</Text></View>
<View style={s.quickGrid}><Pressable style={s.quickTile} onPress={()=>setTab("Stats")}><Text style={s.quickIcon}>📊</Text><Text style={s.quickText}>My Stats</Text></Pressable><Pressable style={s.quickTile} onPress={()=>setTab("Standings")}><Text style={s.quickIcon}>🏆</Text><Text style={s.quickText}>Standings</Text></Pressable><Pressable style={s.quickTile} onPress={()=>setTab("Matches")}><Text style={s.quickIcon}>🎯</Text><Text style={s.quickText}>Matches</Text></Pressable><Pressable style={s.quickTile} onPress={()=>setTab("Matches")}><Text style={s.quickIcon}>📅</Text><Text style={s.quickText}>Schedule</Text></Pressable></View>
{homeUpcomingMatches.length?(()=>{const m=homeUpcomingMatches[0];const opponent=neutralOpponent(m,currentPlayer?.id);return <View style={s.previewCard}><Text style={s.previewCardLabel}>NEXT MATCH</Text><View style={s.matchPlayersLarge}><Text style={s.matchSelfName}>{currentPlayer?.display_name||currentPlayer?.username||"YOU"}</Text><Text style={s.vsLarge}> VS </Text><PlayerLink name={String(opponent||"Opponent")}/></View><Text style={s.matchDate}>{localMatchLabel(m,timeZone)}</Text><Text style={s.matchMeta}>{m.division_name||currentPlayer?.division_name||"League Match"} • Week {m.week_no||"—"} • Best of {m.best_of||5} legs</Text></View>})():<View style={s.previewCard}><Text style={s.previewCardLabel}>NEXT MATCH</Text><Text style={s.emptyStateTitle}>NO UPCOMING MATCH</Text><Text style={s.emptyStateText}>The server has not scheduled another match for your account yet.</Text></View>}
<View style={s.previewCard}><Text style={s.previewCardLabel}>YOUR 3-DART AVERAGE</Text><Text style={s.previewAverage}>{formatStat(serverSeasonStats.three_dart_average)}</Text><Text style={s.previewSub}>{Number(serverSeasonStats.matches_with_stats||0)>0?`LIVE • ${formatStatInt(serverSeasonStats.matches_with_stats)} MATCH${Number(serverSeasonStats.matches_with_stats||0)===1?"":"ES"} WITH STATS`:"NO APPROVED DART STATS YET"}</Text></View>
<View style={s.previewStatRow}><View style={s.previewMini}><Text style={s.previewMiniValue}>{String(myStanding?.wins??0)}</Text><Text style={s.previewMiniLabel}>WINS</Text></View><View style={s.previewMini}><Text style={s.previewMiniValue}>{String(myStanding?.losses??0)}</Text><Text style={s.previewMiniLabel}>LOSSES</Text></View><View style={s.previewMini}><Text style={s.previewMiniValue}>{myStanding?.rank?`#${myStanding.rank}`:"—"}</Text><Text style={s.previewMiniLabel}>RANK</Text></View></View>
<View style={s.previewStatRow}><View style={s.previewMini}><Text style={s.previewMiniValue}>{formatStatInt(serverSeasonStats["180s"])}</Text><Text style={s.previewMiniLabel}>180s</Text></View><View style={s.previewMini}><Text style={s.previewMiniValue}>{formatStatInt(serverSeasonStats.highest_checkout)}</Text><Text style={s.previewMiniLabel}>HIGH CO</Text></View><View style={s.previewMini}><Text style={s.previewMiniValue}>{formatStatInt(serverSeasonStats.best_leg)}</Text><Text style={s.previewMiniLabel}>BEST LEG</Text></View></View>
<View style={s.previewCard}><Text style={s.previewCardLabel}>RECENT FORM</Text>{homeCompletedMatches.length?<View style={s.form}>{homeCompletedMatches.slice(0,5).map((m:any,i:number)=>{const x=matchResultForMe(m)||"•";return <View key={String(m.id||i)} style={[s.badge,x==="L"&&{backgroundColor:"#ef3d3d"},x==="•"&&{backgroundColor:"#566474"}]}><Text style={s.bold}>{x}</Text></View>})}</View>:<Text style={s.emptyStateText}>No completed server matches yet.</Text>}</View>
</ScrollView>;
const popupKind=String(announcementPopup?.kind||announcementPopup?.type||"").toLowerCase();
const popupIsTournament=popupKind==="tournament_signup"||popupKind==="manager_tournament_signup";
const rawChoices=Array.isArray(announcementPopup?.response_options)?announcementPopup.response_options:Array.isArray(announcementPopup?.choices)?announcementPopup.choices:[];
const popupChoices=popupIsTournament?[{value:"join",label:"JOIN TOURNAMENT",tone:"join"},{value:"do_not_join",label:"DON'T JOIN",tone:"decline"}]:rawChoices.length?rawChoices.map((x:any)=>typeof x==="string"?{value:x,label:x,tone:"choice"}:{value:String(x?.value??x?.id??x?.label??""),label:String(x?.label??x?.text??x?.value??"CHOICE"),tone:"choice"}):[{value:"ok",label:"OK",tone:"ok"}];
return wrap(<><SwipeNavigationProvider enabled={tab!=="ManagerServer"&&tab!=="ModeratorServer"} onSwipeRight={goBackTab} onSwipeLeft={goForwardTab}><SwipeTouchSurface style={{flex:1}}><SafeAreaView style={s.safe}><AmericanFlagBackground/><View style={s.appOverlay}><View style={s.header}><Text style={s.bold}>US AUTODARTS LEAGUE</Text>{tab==="Home"?<Pressable hitSlop={12} style={s.gearButton} onPress={()=>setTab("Settings")} accessibilityRole="button" accessibilityLabel="Open settings"><Text style={s.gearIcon}>⚙</Text></Pressable>:<View style={s.headerSpacer}/>}</View><View style={s.content}>{body}</View><View style={s.nav}>{[["Home","⌂"],["Matches","🎯"],["Tournament","🏅"],["Standings","🏆"],["Stats","📊"]].map(x=><Pressable key={x[0]} style={s.navI} onPress={()=>setTab(x[0])}><Text style={s.navIcon}>{x[1]}</Text><Text style={[s.muted,tab===x[0]&&{color:"#ef3d3d"}]}>{x[0]}</Text></Pressable>)}</View></View></SafeAreaView></SwipeTouchSurface></SwipeNavigationProvider><Modal visible={!!announcementPopup} transparent animationType="fade" statusBarTranslucent onRequestClose={()=>{}}><View style={s.announcementModalShade}><View style={s.announcementModalCard}><View style={s.announcementModalIcon}><Text style={s.announcementModalIconText}>{popupIsTournament?"🏆":rawChoices.length?"?":"📣"}</Text></View><Text style={s.announcementModalKicker}>{popupIsTournament?"TOURNAMENT ANNOUNCEMENT":"ANNOUNCEMENT"}</Text><Text style={s.announcementModalTitle}>{String(announcementPopup?.title||announcementPopup?.tournament_name||"League Announcement")}</Text><Text style={s.announcementModalBody}>{String(announcementPopup?.body||announcementPopup?.message||"")}</Text>{popupIsTournament?<View style={s.announcementTournamentInfo}><Text style={s.announcementTournamentInfoText}>{String(announcementPopup?.tournament_date_label||announcementPopup?.start_label||"")}</Text><Text style={s.announcementTournamentInfoText}>Single Elimination • Best of 5 • No Draws</Text><Text style={s.announcementDeadline}>Signup closes 10 minutes before tournament start.</Text></View>:null}<View style={s.announcementChoiceStack}>{popupChoices.map((c:any)=><Pressable key={c.value} disabled={announcementBusy} onPress={()=>respondToAnnouncement(c.value)} style={[s.announcementChoice,c.tone==="join"&&s.announcementJoin,c.tone==="decline"&&s.announcementDecline,c.tone==="ok"&&s.announcementOkay,announcementBusy&&{opacity:.55}]}><Text style={s.announcementChoiceText}>{announcementBusy?"SAVING…":c.label}</Text></Pressable>)}</View></View></View></Modal></>)}


function PlayerNameWithAwards({name,onPress,compact=false}:{name:string;onPress:()=>void;compact?:boolean}){
  const awards=(playerAwards[name]||[]);
  const[rowWidth,setRowWidth]=useState(0);
  const[nameWidth,setNameWidth]=useState(0);

  const awardWidth=compact?18:26;
  const plusWidth=compact?12:16;
  const gap=4;
  const available=Math.max(0,rowWidth-nameWidth-gap);

  let visibleCount=awards.length;
  let hasMore=false;

  if(rowWidth>0&&nameWidth>0){
    const allWidth=awards.length*awardWidth;
    if(allWidth>available){
      hasMore=true;
      visibleCount=Math.max(0,Math.floor((available-plusWidth)/awardWidth));
    }
  }

  const visible=awards.slice(0,visibleCount);

  return <View
    style={s.playerNameAwardsRow}
    onLayout={e=>setRowWidth(e.nativeEvent.layout.width)}
  >
    <Pressable
      onPress={onPress}
      hitSlop={6}
      onLayout={e=>setNameWidth(e.nativeEvent.layout.width)}
    >
      <Text style={[s.inlinePlayerLink,compact&&s.inlinePlayerLinkCompact]} numberOfLines={1}>{name}</Text>
    </Pressable>

    <View style={s.awardsInline}>
      {visible.map((a:any,i:number)=><AwardMark key={`${a.type}-${i}`} type={String(a.type||"award")} count={Number(a.count||1)} compact={compact}/>)}
      {hasMore?<Pressable onPress={onPress} hitSlop={6}><Text style={[s.awardPlus,compact&&s.awardPlusCompact]}>+</Text></Pressable>:null}
    </View>
  </View>
}

function AwardsOnly({name}:{name:string}){
  const awards=(playerAwards[name]||[]);
  const[rowWidth,setRowWidth]=useState(0);
  const[expanded,setExpanded]=useState(false);

  // Actual profile award slot is 50 px (46 width + 4 margin).
  const awardSlot=50;
  const plusSlot=28;
  const allWidth=awards.length*awardSlot;
  const hasMore=rowWidth>0&&allWidth>rowWidth;
  const collapsedCount=hasMore?Math.max(1,Math.floor((rowWidth-plusSlot)/awardSlot)):awards.length;
  const visible=expanded?awards:awards.slice(0,collapsedCount);

  return <View style={s.profileAwardsArea}>
    <View
      style={[s.profileAwardsOnlyRow,expanded&&s.profileAwardsExpandedRow]}
      onLayout={e=>setRowWidth(e.nativeEvent.layout.width)}
    >
      {visible.map((a:any,i:number)=><AwardMark key={`${a.type}-${i}`} type={String(a.type||"award")} count={Number(a.count||1)} profileLarge/>)}
      {!expanded&&hasMore?<Pressable
        onPress={()=>setExpanded(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Show ${awards.length-collapsedCount} more awards`}
        style={s.profileAwardPlusButton}
      ><Text style={s.profileAwardPlus}>+</Text></Pressable>:null}
    </View>
    {expanded&&hasMore?<Pressable onPress={()=>setExpanded(false)} hitSlop={8} style={s.profileAwardsCloseButton}>
      <Text style={s.profileAwardsCloseText}>SHOW LESS  −</Text>
    </Pressable>:null}
  </View>
}

function awardImageSource(type:string){
  if(type==="goldCup")return require("./assets/award-gold-cup.png");
  if(type==="silverCup")return require("./assets/award-silver-cup.png");
  if(type==="diamondCup")return require("./assets/award-diamond-cup.png");
  if(type==="managerTournamentChampion")return require("./assets/award-tournament-champion.png");
  if(type==="most180s")return require("./assets/award-most-180s.png");
  if(type==="highestAverage")return require("./assets/award-highest-average.png");
  if(type==="highestCheckout")return require("./assets/award-highest-checkout.png");
  if(type==="bestCheckoutPct")return require("./assets/award-best-checkout-pct.png");
  if(type==="bestLeg")return require("./assets/award-best-leg.png");
  if(type==="mostWins")return require("./assets/award-most-wins.png");
  if(type==="nineDart")return require("./assets/award-9-dart.png");
  if(type==="twelveDart")return require("./assets/award-12-dart.png");
  if(type==="fifteenDart")return require("./assets/award-15-dart.png");
  if(type==="checkout170")return require("./assets/award-170-checkout.png");
  if(type==="checkout100Plus")return require("./assets/award-100-plus-checkout.png");
  if(type==="first180")return require("./assets/award-first-180.png");
  if(type==="career180_50")return require("./assets/award-50-career-180s.png");
  if(type==="career180_100")return require("./assets/award-100-career-180s.png");
  if(type==="winStreak")return require("./assets/award-win-streak.png");
  if(type==="promotion")return require("./assets/award-promotion.png");
  if(type==="fiveSeasons")return require("./assets/award-5-seasons.png");
  if(type==="tenSeasons")return require("./assets/award-10-seasons.png");
  if(type==="matches100")return require("./assets/award-100-matches.png");
  if(type==="matches250")return require("./assets/award-250-matches.png");
  if(type==="perfectSeason")return require("./assets/award-perfect-season.png");
  if(type==="undefeatedSeason")return require("./assets/award-undefeated-season.png");
  // Compatibility fallback for old locally cached demo award names.
  if(type==="seasonChampion")return require("./assets/award-silver-cup.png");
  if(type==="performance")return require("./assets/award-most-180s.png");
  return require("./assets/award-trophy.png");
}

function AwardMark({type,count,compact=false,profileLarge=false}:{type:string;count:number;compact?:boolean;profileLarge?:boolean}){
  return <View style={[
    s.awardWrap,
    compact&&s.awardWrapCompact,
    profileLarge&&s.awardWrapProfile
  ]}>
    <Image source={awardImageSource(type)} resizeMode="contain" style={[
      s.awardGraphic,
      compact&&s.awardGraphicCompact,
      profileLarge&&s.awardGraphicProfile
    ]}/>
    <Text style={[
      s.awardCount,
      compact&&s.awardCountCompact,
      profileLarge&&s.awardCountProfile
    ]}>{count}</Text>
  </View>
}

function AwardArtwork({award,style}:{award:any;style:any}){const remote=absoluteAwardUrl(award?.artwork_url||award?.image_url);const[useRemote,setUseRemote]=useState(Boolean(remote));return <Image source={useRemote?{uri:remote}:awardImageSource(String(award?.type||"award"))} onError={()=>setUseRemote(false)} resizeMode="contain" style={style}/>}
function TrophyCase({onBack,catalog,earned}:{onBack:()=>void;catalog:any[];earned:any[]}){
  const official=(Array.isArray(catalog)&&catalog.length?catalog:bundledAwardCatalog).filter((a:any)=>a.active!==false);const earnedRows=Array.isArray(earned)?earned:[];const earnedMap=new Map(earnedRows.map((a:any)=>[String(a.type),a]));const categories=["Championship Trophies","Performance Awards","Special Achievements",...Array.from(new Set(official.map((a:any)=>a.category))).filter((x:any)=>!["Championship Trophies","Performance Awards","Special Achievements"].includes(String(x)))];
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.trophyCasePage}><Pressable onPress={onBack}><Text style={s.backLink}>‹ BACK TO SETTINGS</Text></Pressable><View style={s.trophyHero}><Text style={s.trophyKicker}>US AUTODARTS LEAGUE</Text><Text style={s.trophyHeroTitle}>TROPHIES & BADGES</Text><Text style={s.trophyHeroCount}>{official.length} OFFICIAL AWARDS</Text><Text style={s.trophyHeroSub}>Your earned awards come from the league server. The official catalog below also syncs from the server when the server catalog endpoint is available; bundled artwork remains the fallback for the current set.</Text></View><View style={s.trophySection}><View style={s.trophySectionHeadingRow}><Text style={s.trophySectionTitle}>YOUR AWARDS</Text><View style={s.trophySectionLine}/></View>{earnedRows.length?<View style={s.trophyGrid}>{earnedRows.map((e:any)=>{const a=official.find((x:any)=>String(x.type)===String(e.type))||{type:e.type,name:e.name||e.type,category:"Earned Award",detail:"Award earned and stored on the league server.",image_url:e.image_url};return <View key={String(e.id||e.type)} style={s.trophyCard}><View style={s.trophyImageWrap}><View><AwardArtwork award={a} style={s.trophyImage}/><Text style={s.awardCountProfile}>{Number(e.count||1)}</Text></View></View><View style={s.trophyCardText}><Text style={s.trophyName}>{a.name}</Text><Text style={s.trophyMeaningLabel}>EARNED • COUNT {Number(e.count||1)}</Text><Text style={s.trophyDetail}>{a.detail}</Text></View></View>})}</View>:<View style={s.emptyStateCard}><Text style={s.emptyStateTitle}>NO AWARDS YET</Text><Text style={s.emptyStateText}>Awards earned on the league server will appear here automatically.</Text></View>}</View><View style={s.trophySectionHeadingRow}><Text style={s.trophySectionTitle}>AVAILABLE / OFFICIAL AWARDS</Text><View style={s.trophySectionLine}/></View>{categories.map(category=><View key={category} style={s.trophySection}><View style={s.trophySectionHeadingRow}><Text style={s.trophySectionTitle}>{String(category).toUpperCase()}</Text><View style={s.trophySectionLine}/></View><View style={s.trophyGrid}>{official.filter((a:any)=>a.category===category).map((a:any)=><View key={a.type} style={s.trophyCard}><View style={s.trophyImageWrap}><AwardArtwork award={a} style={s.trophyImage}/></View><View style={s.trophyCardText}><Text style={s.trophyName}>{a.name}{earnedMap.has(String(a.type))?`  ✓ x${Number(earnedMap.get(String(a.type))?.count||1)}`:""}</Text><Text style={s.trophyMeaningLabel}>WHAT IT'S FOR / HOW TO EARN</Text><Text style={s.trophyDetail}>{a.detail}</Text></View></View>)}</View></View>)}<View style={s.trophyPermanentNote}><Text style={s.trophyPermanentTitle}>SERVER-LINKED CATALOG</Text><Text style={s.trophyPermanentText}>New server-defined awards and server-hosted artwork can appear here without a future APK rebuild. Existing bundled artwork stays unchanged unless the server supplies an override.</Text></View></ScrollView>;
}

function SignIn({onSignedIn,initialMessage=""}:{onSignedIn:(player:any)=>void;initialMessage?:string}){
  const[username,setUsername]=useState("");
  const[password,setPassword]=useState("");
  const[keepSignedIn,setKeepSignedIn]=useState(true);
  const[error,setError]=useState(initialMessage);
  const[working,setWorking]=useState(false);

  useEffect(()=>{
    (async()=>{
      try{const saved=await storage.getItemAsync("league_username");if(saved)setUsername(saved);}catch{}
    })();
  },[]);

  const signIn=async()=>{
    if(!username.trim()||!password){setError("Enter the username and password supplied through the league manager.");return;}
    setError("");setWorking(true);
    try{
      const auth=await apiRequest("/api/auth/login",{method:"POST",body:JSON.stringify({username:username.trim(),password})});
      if(!auth?.token||!auth?.player)throw new Error("The server returned an invalid login response.");
      runtimeAuthToken=auth.token;
      if(keepSignedIn){
        await storage.setItemAsync("league_session",auth.token);
        await storage.setItemAsync("league_player",JSON.stringify(auth.player));
        await storage.setItemAsync("league_username",username.trim());
        await storage.setItemAsync("league_password",password);
        await storage.setItemAsync("league_keep_signed_in","1");
      }else{
        await storage.deleteItemAsync("league_session");
        await storage.deleteItemAsync("league_player");
        await storage.deleteItemAsync("league_password");
        await storage.deleteItemAsync("league_keep_signed_in");
        await storage.setItemAsync("league_username",username.trim());
      }
      setPassword("");
      onSignedIn(auth.player);
    }catch(e:any){
      const raw=String(e?.message||e||"");
      if(raw.includes("AbortError")||raw.toLowerCase().includes("network"))setError("Cannot reach the league server yet. The app is configured correctly, but the Cloudflare tunnel/API must be online before sign-in will work.");
      else if(raw.includes("invalid_credentials"))setError("Username or password is incorrect.");
      else setError(`Could not sign in: ${raw}`);
    }finally{setWorking(false);}
  };

  return <SafeAreaView style={s.safe}>
    <AmericanFlagBackground/>
    <View style={s.signInOverlay}>
      <ScrollView contentContainerStyle={s.signInContent} keyboardShouldPersistTaps="handled">
        <Image source={require("./assets/splash-logo.png")} resizeMode="contain" style={s.signInLogo}/>
        <View style={s.signInCard}>
          <Text style={s.signInTitle}>LEAGUE SIGN IN</Text>
          <Text style={s.signInSub}>Sign in with the league username and password created in the Server Manager. Your server role automatically controls which tools are visible.</Text>
          <Text style={s.securityLabel}>Username</Text>
          <TextInput value={username} onChangeText={setUsername} placeholder="League username" placeholderTextColor="#6f8597" style={s.signInInput} autoCapitalize="none" autoCorrect={false}/>
          <Text style={s.securityLabel}>Password</Text>
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#6f8597" style={s.signInInput} secureTextEntry autoCapitalize="none" onSubmitEditing={signIn}/>
          <Pressable style={s.keepRow} onPress={()=>setKeepSignedIn(!keepSignedIn)}>
            <View style={[s.checkBox,keepSignedIn&&s.checkBoxOn]}>{keepSignedIn?<Text style={s.checkMark}>✓</Text>:null}</View>
            <Text style={s.keepText}>Keep me signed in</Text>
          </Pressable>
          {error?<Text style={s.signInError}>{error}</Text>:null}
          <Pressable style={[s.signInButton,working&&{opacity:.65}]} onPress={signIn} disabled={working}><Text style={s.securityButtonText}>{working?"CONNECTING…":"SIGN IN"}</Text></Pressable>
          <Text style={s.signInNote}>Production server: {API_BASE_URL}{"\n"}When “Keep me signed in” is enabled, the username and password are kept in the device's secure credential storage and are re-checked against the league server every time the app starts. Password resets and disabled accounts therefore stop automatic sign-in.</Text>
        </View>
      </ScrollView>
    </View>
  </SafeAreaView>
}
function Splash({onDone}:{onDone:()=>void}){
  const fade=useRef(new Animated.Value(1)).current;
  useEffect(()=>{
    const t=setTimeout(()=>{
      Animated.timing(fade,{toValue:0,duration:400,useNativeDriver:true})
        .start(()=>onDone());
    },3400);
    return()=>clearTimeout(t);
  },[]);
  return <Animated.View style={[s.splash,{opacity:fade}]}>
    <AmericanFlagBackground/>
    <View style={s.splashShade}/>
    <Animated.Image
      source={require("./assets/splash-logo.png")}
      resizeMode="contain"
      style={s.splashImg}
    />
    <View style={s.loadingWrap}>
      <View style={s.loadingTrack}><View style={s.loadingFill}/></View>
      <Text style={s.loadingText}>Loading...</Text>
    </View>
  </Animated.View>
}
function AmericanFlagBackground(){
  return <ImageBackground
    source={require("./assets/wavy-flag-bg.jpg")}
    resizeMode="cover"
    style={s.flagBg}
    imageStyle={s.flagImage}
    pointerEvents="none"
  >
    <View style={s.flagDim}/>
  </ImageBackground>
}

function Card({children}:{children:React.ReactNode}){return <View style={s.card}>{children}</View>}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:"transparent"},splash:{flex:1,backgroundColor:"transparent",alignItems:"center",justifyContent:"center",overflow:"hidden"},splashImg:{width:"92%",height:"68%",zIndex:3,marginTop:-30},header:{height:82,paddingTop:22,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:"rgba(255,255,255,.14)",backgroundColor:"rgba(2,8,18,.72)",zIndex:20},content:{flex:1,padding:16},hero:{alignItems:"center",paddingVertical:12},logo:{color:"#fff",fontSize:32,fontWeight:"900"},logo2:{color:"#fff",fontSize:23,fontWeight:"900",letterSpacing:2},logo3:{color:"#ef3d3d",fontSize:23,fontWeight:"900",letterSpacing:3},season:{color:"#3ea4ff",marginTop:10,fontWeight:"800"},welcome:{color:"#fff",fontSize:20,fontWeight:"900",marginTop:4},muted:{color:"#8ea3b5",fontSize:12},card:{backgroundColor:"rgba(7,22,36,.84)",borderWidth:1,borderColor:"#1b3850",borderRadius:14,padding:14,marginVertical:5},red:{color:"#ef3d3d",fontWeight:"900"},avg:{color:"#fff",fontSize:52,fontWeight:"900"},statGrid:{flexDirection:"row",flexWrap:"wrap",gap:8,marginVertical:7},mini:{width:"31.5%",height:74,backgroundColor:"rgba(7,22,36,.84)",borderWidth:1,borderColor:"#1b3850",borderRadius:12,alignItems:"center",justifyContent:"center"},miniV:{color:"#fff",fontSize:23,fontWeight:"900"},form:{flexDirection:"row",gap:9,marginTop:6},badge:{width:36,height:36,borderRadius:18,backgroundColor:"#126bd6",alignItems:"center",justifyContent:"center"},bold:{color:"#fff",fontWeight:"900"},match:{color:"#fff",fontSize:19,fontWeight:"800",marginVertical:6},nav:{height:70,borderTopWidth:1,borderTopColor:"rgba(255,255,255,.14)",flexDirection:"row",backgroundColor:"rgba(2,8,18,.8)"},navI:{flex:1,alignItems:"center",paddingTop:8},navIcon:{fontSize:20},title:{color:"#fff",fontSize:28,fontWeight:"900",marginBottom:12},row:{flexDirection:"row",paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#193047"},cell:{color:"#ddd",flex:1,textAlign:"center"},stat:{color:"#fff",fontSize:36,fontWeight:"900"},
compactCard:{backgroundColor:"rgba(7,22,36,.84)",borderWidth:1,borderColor:"#1b3850",borderRadius:14,paddingVertical:13,paddingHorizontal:16,marginVertical:5},
compactRed:{color:"#ef3d3d",fontWeight:"900",fontSize:13,marginBottom:2},
compactMatch:{color:"#fff",fontSize:17,fontWeight:"800",marginVertical:2},
compactMuted:{color:"#8ea3b5",fontSize:11,lineHeight:14},
compactAvg:{color:"#fff",fontSize:46,fontWeight:"900",lineHeight:50}
,
statsSection:{color:"#ef3d3d",fontWeight:"900",fontSize:12,letterSpacing:1,marginTop:4,marginBottom:8},
statsGrid:{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:14},
statsTile:{width:"31.5%",minHeight:82,backgroundColor:"rgba(7,22,36,.84)",borderWidth:1,borderColor:"#1b3850",borderRadius:12,alignItems:"center",justifyContent:"center",padding:8},
statsValue:{color:"#fff",fontSize:22,fontWeight:"900"},
statsLabel:{color:"#8ea3b5",fontSize:9,fontWeight:"800",textAlign:"center",marginTop:4},
statsNote:{color:"#6f8597",fontSize:10,textAlign:"center",marginVertical:8}
,
tableCard:{backgroundColor:"rgba(7,22,36,.84)",borderWidth:1,borderColor:"#1b3850",borderRadius:12,overflow:"hidden"},
standingsHeader:{backgroundColor:"rgba(16,38,58,.9)"},
standCell:{color:"#dce7ef",flex:0.62,textAlign:"center",fontSize:10,fontWeight:"700"},
rankCell:{flex:0.9},
nameCell:{flex:2.2,textAlign:"left",paddingLeft:3},
legsCell:{flex:0.75},
standingsKey:{color:"#6f8597",fontSize:8,textAlign:"center",paddingVertical:9,paddingHorizontal:4}
,
playerLink:{color:"#3ea4ff",fontSize:10,fontWeight:"800",textDecorationLine:"underline",paddingLeft:3},
backLink:{color:"#3ea4ff",fontSize:11,fontWeight:"900",marginBottom:10}
,
matchPlayers:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",marginVertical:2},
inlinePlayerLink:{color:"#3ea4ff",fontSize:17,fontWeight:"800",textDecorationLine:"underline"},
vsText:{color:"#fff",fontSize:17,fontWeight:"800"}
,
divisionControl:{marginBottom:12},
divisionLabel:{color:"#8ea3b5",fontSize:10,fontWeight:"900",letterSpacing:1,marginBottom:5},
divisionDropdown:{backgroundColor:"rgba(7,22,36,.84)",borderWidth:1,borderColor:"#1b3850",borderRadius:10,paddingVertical:11,paddingHorizontal:13,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
divisionValue:{color:"#fff",fontSize:15,fontWeight:"800"},
divisionArrow:{color:"#3ea4ff",fontSize:12},
divisionChoice:{backgroundColor:"rgba(7,22,36,.84)",borderWidth:1,borderColor:"#1b3850",borderRadius:12,paddingVertical:16,paddingHorizontal:16,marginBottom:10,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
divisionChoiceActive:{borderColor:"#3ea4ff"},
divisionChoiceText:{color:"#fff",fontSize:16,fontWeight:"800"},
divisionChoiceTextActive:{color:"#3ea4ff"},
divisionChevron:{color:"#8ea3b5",fontSize:24}
,appOverlay:{flex:1,backgroundColor:"rgba(1,7,16,.20)",zIndex:2},
flagBg:{...StyleSheet.absoluteFillObject,zIndex:0,overflow:"hidden"},
flagStripes:{...StyleSheet.absoluteFillObject},
flagStripe:{flex:1},
flagCanton:{position:"absolute",top:0,left:0,width:"56%",height:"54%",backgroundColor:"#3c3b6e",flexDirection:"row",flexWrap:"wrap",alignContent:"flex-start",paddingTop:4,paddingLeft:5},
flagStar:{color:"#fff",fontSize:8,width:"14%",textAlign:"center",lineHeight:12},
flagDim:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,5,15,.30)"},
splashShade:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,.15)",zIndex:1},
matchCard:{backgroundColor:"rgba(7,22,36,.86)",borderWidth:1,borderColor:"rgba(90,150,210,.45)",borderRadius:14,padding:14,marginBottom:10},
matchDivision:{color:"#ef3d3d",fontSize:11,fontWeight:"900",letterSpacing:1,marginBottom:8},
matchPlayersLarge:{flexDirection:"row",alignItems:"center",justifyContent:"center",flexWrap:"wrap",marginVertical:4},
vsLarge:{color:"#fff",fontSize:18,fontWeight:"900"},
matchDate:{color:"#fff",fontSize:13,fontWeight:"700",textAlign:"center",marginTop:8},
matchMeta:{color:"#8ea3b5",fontSize:11,textAlign:"center",marginTop:3}
,loadingWrap:{position:"absolute",bottom:38,width:"76%",alignItems:"center",zIndex:4},
loadingTrack:{width:"100%",height:12,borderRadius:8,backgroundColor:"rgba(4,18,36,.9)",borderWidth:1,borderColor:"rgba(255,255,255,.3)",overflow:"hidden"},
loadingFill:{width:"72%",height:"100%",backgroundColor:"#1477ff",borderRadius:8},
loadingText:{color:"#fff",fontSize:11,marginTop:6,fontWeight:"700"},
homeTop:{marginTop:2,marginBottom:4},
homeWelcomeSmall:{color:"#dce7ef",fontSize:10,fontWeight:"700"},
homeWelcomeBig:{color:"#fff",fontSize:23,fontWeight:"900"},
homeDivision:{color:"#a8bfd1",fontSize:11,marginTop:1},
heroCompact:{alignItems:"center",marginVertical:4},
brandUS:{color:"#fff",fontSize:36,fontWeight:"900",letterSpacing:2,textShadowColor:"#1c67ff",textShadowRadius:8},
brandAuto:{color:"#fff",fontSize:20,fontWeight:"900",letterSpacing:2},
brandLeague:{color:"#ef3d3d",fontSize:14,fontWeight:"900",letterSpacing:4},
quickGrid:{flexDirection:"row",flexWrap:"wrap",gap:8,marginVertical:6},
quickTile:{width:"48.7%",height:82,backgroundColor:"rgba(2,15,35,.86)",borderWidth:1,borderColor:"rgba(45,112,255,.65)",borderRadius:14,alignItems:"center",justifyContent:"center"},
quickIcon:{fontSize:24,marginBottom:3},
quickText:{color:"#fff",fontSize:12,fontWeight:"800"},
previewCard:{backgroundColor:"rgba(2,15,35,.88)",borderWidth:1,borderColor:"rgba(45,112,255,.58)",borderRadius:14,padding:12,marginVertical:4},
previewCardLabel:{color:"#ef3d3d",fontSize:10,fontWeight:"900",letterSpacing:1,marginBottom:4},
previewAverage:{color:"#ef3d3d",fontSize:42,fontWeight:"900",lineHeight:45},
previewSub:{color:"#9bb0c2",fontSize:9,fontWeight:"700"},
previewStatRow:{flexDirection:"row",gap:7,marginVertical:3},
previewMini:{flex:1,height:62,backgroundColor:"rgba(2,15,35,.88)",borderWidth:1,borderColor:"rgba(45,112,255,.5)",borderRadius:12,alignItems:"center",justifyContent:"center"},
previewMiniValue:{color:"#fff",fontSize:20,fontWeight:"900"},
previewMiniLabel:{color:"#9bb0c2",fontSize:8,fontWeight:"800",marginTop:1},
flagImage:{opacity:.96}
,gearButton:{width:46,height:46,borderRadius:23,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(3,18,40,.88)",borderWidth:1,borderColor:"rgba(255,255,255,.45)",zIndex:30},
gearIcon:{color:"#fff",fontSize:27,fontWeight:"900"},
headerSpacer:{width:40},
settingsRow:{backgroundColor:"rgba(2,15,35,.88)",borderWidth:1,borderColor:"rgba(45,112,255,.55)",borderRadius:14,padding:15,marginBottom:10,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
logoutSettingsRow:{borderColor:"rgba(230,57,70,.9)"},
logoutSettingsTitle:{color:"#ff6b6b"},
settingsPanel:{backgroundColor:"rgba(2,15,35,.88)",borderWidth:1,borderColor:"rgba(45,112,255,.55)",borderRadius:14,padding:16},
updateStatusCard:{backgroundColor:"rgba(4,25,53,.88)",borderWidth:1,borderColor:"rgba(62,164,255,.55)",borderRadius:12,padding:14,marginTop:16,marginBottom:14},
updateStatusLabel:{color:"#6fb8ff",fontSize:10,fontWeight:"900",letterSpacing:1.1},
updateStatusText:{color:"#fff",fontSize:14,fontWeight:"800",marginTop:6,lineHeight:20},
updateLastChecked:{color:"#9bb0c2",fontSize:10,marginTop:8},
updateRuntime:{color:"#6f8597",fontSize:10,marginTop:4},
settingsTitle:{color:"#fff",fontSize:16,fontWeight:"900"},
settingsSub:{color:"#9bb0c2",fontSize:11,marginTop:4,lineHeight:16,maxWidth:"92%"},
settingsArrow:{color:"#3ea4ff",fontSize:26},
fontButtons:{flexDirection:"row",gap:8,marginTop:16,marginBottom:20},
fontButton:{flex:1,paddingVertical:12,borderRadius:10,backgroundColor:"rgba(7,22,36,.9)",borderWidth:1,borderColor:"rgba(90,150,210,.45)",alignItems:"center"},
fontButtonActive:{borderColor:"#ef3d3d",backgroundColor:"rgba(90,15,25,.75)"},
fontButtonText:{color:"#fff",fontWeight:"800"},
fontPreview:{color:"#fff",fontWeight:"900",textAlign:"center",paddingVertical:12}
,securityItem:{marginTop:14},
securityLabel:{color:"#dce7ef",fontSize:11,fontWeight:"800",marginBottom:5},
securityField:{backgroundColor:"rgba(5,15,30,.9)",borderWidth:1,borderColor:"rgba(90,150,210,.45)",borderRadius:10,paddingVertical:12,paddingHorizontal:12},
securityPlaceholder:{color:"#8ea3b5",fontSize:14,letterSpacing:2},
securityButton:{marginTop:18,backgroundColor:"#126bd6",borderRadius:10,paddingVertical:13,alignItems:"center"},
securityButtonText:{color:"#fff",fontWeight:"900",letterSpacing:.5}
,
profilePhotoRow:{flexDirection:"row",alignItems:"center",marginTop:16,marginBottom:18},
profilePhotoButton:{width:82,height:82,borderRadius:41,backgroundColor:"rgba(5,15,30,.9)",borderWidth:2,borderColor:"rgba(90,150,210,.65)",alignItems:"center",justifyContent:"center",overflow:"hidden"},
profilePhoto:{width:82,height:82,borderRadius:41},
profilePhotoIcon:{fontSize:30},
profilePhotoText:{flex:1,marginLeft:14},
profileInput:{backgroundColor:"rgba(5,15,30,.9)",borderWidth:1,borderColor:"rgba(90,150,210,.45)",borderRadius:10,paddingVertical:11,paddingHorizontal:12,color:"#fff",fontSize:14,marginBottom:14},
profileReadOnly:{backgroundColor:"rgba(28,39,52,.88)",borderColor:"rgba(130,150,170,.35)",color:"#cbd6df",marginBottom:4},
profileReadOnlyNote:{color:"#7890a3",fontSize:9,fontWeight:"900",letterSpacing:.6,marginBottom:14},
serverStatus:{flexDirection:"row",alignItems:"center",marginTop:16,padding:10,borderRadius:10,backgroundColor:"rgba(5,15,30,.8)"},
serverStatusDot:{color:"#3ea4ff",fontSize:12,marginRight:7},
serverStatusText:{color:"#9bb0c2",fontSize:11,fontWeight:"700"},
signInOverlay:{flex:1,backgroundColor:"rgba(1,7,16,.32)"},
signInContent:{flexGrow:1,justifyContent:"center",paddingHorizontal:22,paddingVertical:28},
signInLogo:{width:"86%",height:220,alignSelf:"center",marginBottom:6},
signInCard:{backgroundColor:"rgba(2,15,35,.92)",borderWidth:1,borderColor:"rgba(45,112,255,.65)",borderRadius:18,padding:18},
authCheckCard:{margin:24,marginTop:"45%",backgroundColor:"rgba(2,15,35,.94)",borderWidth:1,borderColor:"rgba(45,112,255,.65)",borderRadius:18,padding:20},
signInTitle:{color:"#fff",fontSize:23,fontWeight:"900",textAlign:"center",letterSpacing:1},
signInSub:{color:"#9bb0c2",fontSize:11,textAlign:"center",lineHeight:16,marginTop:5,marginBottom:18},
signInInput:{backgroundColor:"rgba(5,15,30,.95)",borderWidth:1,borderColor:"rgba(90,150,210,.5)",borderRadius:10,paddingVertical:12,paddingHorizontal:12,color:"#fff",fontSize:14,marginBottom:14},
keepRow:{flexDirection:"row",alignItems:"center",marginVertical:3},
checkBox:{width:22,height:22,borderRadius:5,borderWidth:1,borderColor:"#8ea3b5",alignItems:"center",justifyContent:"center",backgroundColor:"rgba(0,0,0,.35)"},
checkBoxOn:{backgroundColor:"#126bd6",borderColor:"#3ea4ff"},
checkMark:{color:"#fff",fontSize:15,fontWeight:"900"},
keepText:{color:"#dce7ef",fontSize:11,fontWeight:"700",marginLeft:9,flex:1},
signInError:{color:"#ff6b6b",fontSize:11,fontWeight:"700",marginTop:9},
signInButton:{marginTop:16,backgroundColor:"#126bd6",borderRadius:10,paddingVertical:13,alignItems:"center"},
signInNote:{color:"#6f8597",fontSize:9,lineHeight:13,textAlign:"center",marginTop:12}
,
matchCardRow:{flexDirection:"row",alignItems:"stretch"},
matchCardInfo:{flex:1,paddingRight:10},
matchPlayersLeft:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",marginVertical:4},
matchDateLeft:{color:"#fff",fontSize:13,fontWeight:"700",marginTop:8},
matchMetaLeft:{color:"#8ea3b5",fontSize:11,marginTop:3},
uploadResultsButton:{width:92,minHeight:92,borderRadius:12,backgroundColor:"rgba(18,107,214,.88)",borderWidth:1,borderColor:"rgba(120,180,255,.75)",alignItems:"center",justifyContent:"center",paddingHorizontal:6},
uploadResultsIcon:{color:"#fff",fontSize:22,fontWeight:"900",marginBottom:2},
uploadResultsText:{color:"#fff",fontSize:10,fontWeight:"900",letterSpacing:.5,lineHeight:13,textAlign:"center"},
uploadReady:{color:"#59d98e",fontSize:9,fontWeight:"800",marginTop:7},
uploadQueued:{color:"#f2c94c",fontSize:9,fontWeight:"900",marginTop:5},
evidenceTray:{marginTop:10,backgroundColor:"rgba(4,17,30,.94)",borderWidth:1,borderColor:"#31516d",borderRadius:12,padding:10},
evidenceTrayHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
evidenceTrayTitle:{color:"#f2c94c",fontSize:10,fontWeight:"900",letterSpacing:.6},
evidenceClear:{color:"#ff7b84",fontSize:8,fontWeight:"900",padding:6},
evidenceTrayHint:{color:"#91a8ba",fontSize:9,lineHeight:14,marginTop:4,marginBottom:7},
evidenceQueueRow:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:6,borderTopWidth:1,borderTopColor:"rgba(255,255,255,.07)"},
evidenceThumb:{width:42,height:42,borderRadius:6,backgroundColor:"#0d2032"},
evidenceQueueName:{flex:1,color:"#dbe7ef",fontSize:9},
evidenceRemove:{backgroundColor:"rgba(183,51,61,.25)",borderWidth:1,borderColor:"#8f3139",borderRadius:7,paddingHorizontal:8,paddingVertical:7},
evidenceRemoveText:{color:"#ff9aa1",fontSize:7.5,fontWeight:"900"},
evidenceTrayActions:{flexDirection:"row",gap:8,marginTop:8},
evidenceAddMore:{flex:1,backgroundColor:"#20364e",borderWidth:1,borderColor:"#3b5871",borderRadius:9,paddingVertical:11,alignItems:"center"},
evidenceUploadAll:{flex:1,backgroundColor:"#2774d8",borderRadius:9,paddingVertical:11,alignItems:"center"},
evidenceActionText:{color:"#fff",fontSize:9,fontWeight:"900",letterSpacing:.4}
,
playerNameAwardsRow:{flexDirection:"row",alignItems:"center",flexShrink:1,minWidth:0},
awardsInline:{flexDirection:"row",alignItems:"center",marginLeft:4,flexShrink:0},
inlinePlayerLinkCompact:{fontSize:9},
awardWrap:{width:24,height:22,marginRight:2,position:"relative",alignItems:"center",justifyContent:"center"},
awardWrapCompact:{width:17,height:16,marginRight:1},
awardCount:{position:"absolute",right:-1,top:-3,minWidth:12,height:12,borderRadius:6,backgroundColor:"#0b1c2b",borderWidth:1,borderColor:"#fff",color:"#fff",fontSize:7,fontWeight:"900",textAlign:"center",lineHeight:10},
awardCountCompact:{minWidth:9,height:9,borderRadius:5,fontSize:6,lineHeight:8,right:-1,top:-2},
trophyCup:{width:14,height:8,borderTopLeftRadius:3,borderTopRightRadius:3,borderBottomLeftRadius:6,borderBottomRightRadius:6,backgroundColor:"#d8a928",position:"absolute",top:3},
trophyCupCompact:{width:10,height:6,top:2},
trophyStem:{position:"absolute",width:3,height:5,backgroundColor:"#d8a928",top:10},
trophyStemCompact:{width:2,height:4,top:7},
trophyBase:{position:"absolute",width:10,height:2,backgroundColor:"#d8a928",top:15,borderRadius:1},
trophyBaseCompact:{width:8,height:2,top:11},
medalRibbon:{position:"absolute",top:1,width:10,height:8,borderLeftWidth:3,borderRightWidth:3,borderLeftColor:"#e33b3b",borderRightColor:"#2367d8",borderBottomWidth:5,borderBottomColor:"transparent"},
medalRibbonCompact:{width:7,height:6,borderLeftWidth:2,borderRightWidth:2,borderBottomWidth:4},
medalCircle:{position:"absolute",bottom:1,width:12,height:12,borderRadius:6,backgroundColor:"#d8a928",borderWidth:1,borderColor:"#f2d46e"},
medalCircleCompact:{width:9,height:9,borderRadius:5},
badgeShield:{width:13,height:14,backgroundColor:"#2e7dd7",borderTopLeftRadius:4,borderTopRightRadius:4,borderBottomLeftRadius:7,borderBottomRightRadius:7,borderWidth:1,borderColor:"#9bc5ff",transform:[{rotate:"45deg"}]},
badgeShieldCompact:{width:9,height:10},
awardPlus:{color:"#fff",fontSize:15,fontWeight:"900",marginLeft:1},
awardPlusCompact:{fontSize:11}
,
profileNameAwards:{marginBottom:2,alignSelf:"flex-start"},
profileAwardsHint:{color:"#8ea3b5",fontSize:9,fontWeight:"800",letterSpacing:1,marginBottom:10}
,
awardGraphic:{width:22,height:22},
awardGraphicCompact:{width:16,height:16}
,
profileHeaderRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:10},
profileBack:{color:"#fff",fontSize:40,fontWeight:"300",lineHeight:42},
profilePageTitle:{color:"#fff",fontSize:22,fontWeight:"900",letterSpacing:1},
profileMore:{color:"#fff",fontSize:20,fontWeight:"900"},
profileHero:{flexDirection:"row",alignItems:"center",marginBottom:14},
profileAvatarWrap:{width:112,alignItems:"center",justifyContent:"center"},
profileAvatarCircle:{width:104,height:104,borderRadius:52,borderWidth:2,borderColor:"#168cff",backgroundColor:"rgba(5,15,30,.95)",alignItems:"center",justifyContent:"center"},
profileAvatarInitial:{color:"#fff",fontSize:48,fontWeight:"900"},
profileHeroRight:{flex:1,paddingLeft:12},
profileBigName:{color:"#fff",fontSize:28,fontWeight:"900",letterSpacing:.5,marginBottom:8},
profileAwardsLarge:{width:"100%",marginTop:6,marginBottom:8},
profileMetaRow:{flexDirection:"row",alignItems:"stretch",justifyContent:"space-between",paddingVertical:12,borderTopWidth:1,borderBottomWidth:1,borderColor:"rgba(255,255,255,.16)",marginBottom:12},
profileMetaItem:{flex:1,alignItems:"center",justifyContent:"center",paddingHorizontal:3},
profileMetaDivider:{width:1,backgroundColor:"rgba(255,255,255,.2)"},
profileMetaIcon:{color:"#2f80ed",fontSize:20,marginBottom:3},
profileMetaLabel:{color:"#9bb0c2",fontSize:8,fontWeight:"800",textAlign:"center"},
profileMetaValue:{color:"#fff",fontSize:14,fontWeight:"900",marginTop:3,textAlign:"center"},
profileTabs:{flexDirection:"row",justifyContent:"space-between",borderBottomWidth:1,borderColor:"rgba(255,255,255,.15)",marginBottom:12},
profileTab:{color:"#7f8b9a",fontSize:10,fontWeight:"900",paddingVertical:10},
profileTabActive:{color:"#2f80ed",borderBottomWidth:3,borderBottomColor:"#2f80ed"},
profileSectionCard:{backgroundColor:"rgba(3,15,31,.9)",borderWidth:1,borderColor:"rgba(90,150,210,.35)",borderRadius:14,padding:12,marginBottom:12},
profileSectionHeader:{flexDirection:"row",alignItems:"center",marginBottom:10},
profileSectionTitle:{color:"#2f80ed",fontSize:16,fontWeight:"900"},
profileSeasonYear:{color:"#7f8b9a",fontSize:13,fontWeight:"800",marginLeft:6},
profileSeasonSelect:{marginLeft:"auto",borderWidth:1,borderColor:"rgba(255,255,255,.2)",borderRadius:10,paddingVertical:6,paddingHorizontal:10},
profileSeasonSelectText:{color:"#fff",fontSize:11,fontWeight:"800"},
profileStatsMatrix:{flexDirection:"row",flexWrap:"wrap",borderTopWidth:1,borderLeftWidth:1,borderColor:"rgba(90,150,210,.22)"},
profileStatBox:{width:"25%",minHeight:92,borderRightWidth:1,borderBottomWidth:1,borderColor:"rgba(90,150,210,.22)",alignItems:"center",justifyContent:"center",padding:6},
profileStatLabel:{color:"#9bb0c2",fontSize:8,fontWeight:"800",textAlign:"center",marginBottom:6},
profileStatValue:{fontSize:24,fontWeight:"900",textAlign:"center"},
profileRecentHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:6},
profileViewAll:{color:"#2f80ed",fontSize:11,fontWeight:"900"},
profileMatchRow:{flexDirection:"row",alignItems:"center",paddingVertical:11,borderTopWidth:1,borderColor:"rgba(255,255,255,.10)"},
profileResultBadge:{width:34,height:34,borderRadius:8,backgroundColor:"#2c8f3b",alignItems:"center",justifyContent:"center"},
profileResultLoss:{backgroundColor:"#b93131"},
profileResultText:{color:"#fff",fontSize:16,fontWeight:"900"},
profileOpponentAvatar:{width:34,height:34,borderRadius:17,borderWidth:2,borderColor:"#168cff",backgroundColor:"#1c2a3a",alignItems:"center",justifyContent:"center",marginLeft:8},
profileOpponentInitial:{color:"#fff",fontWeight:"900"},
profileOpponentInfo:{flex:1,marginLeft:8},
profileOpponentName:{color:"#fff",fontSize:12,fontWeight:"900"},
profileOpponentSub:{color:"#8ea3b5",fontSize:9,marginTop:2},
profileScore:{color:"#35c759",fontSize:18,fontWeight:"900",marginHorizontal:8},
profileMatchDateWrap:{width:82,alignItems:"flex-end"},
profileMatchDate:{color:"#dce7ef",fontSize:9,fontWeight:"700"},
profileMatchType:{color:"#8ea3b5",fontSize:8,marginTop:2},
profileChevron:{color:"#9bb0c2",fontSize:24,marginLeft:5}
,
profileAwardsOnlyRow:{width:"100%",flexDirection:"row",alignItems:"center",overflow:"hidden",minHeight:54},
profileAwardsArea:{width:"100%"},
profileAwardsExpandedRow:{flexWrap:"wrap",overflow:"visible",paddingBottom:2},
awardWrapProfile:{width:46,height:50,marginRight:4},
awardGraphicProfile:{width:44,height:44},
awardCountProfile:{minWidth:16,height:16,borderRadius:8,fontSize:9,lineHeight:14,right:0,top:0},
profileAwardPlus:{color:"#fff",fontSize:27,fontWeight:"900",lineHeight:34,textAlign:"center"},
profileAwardPlusButton:{width:28,height:36,borderRadius:18,backgroundColor:"#1477ff",borderWidth:1,borderColor:"rgba(255,255,255,.65)",alignItems:"center",justifyContent:"center",marginLeft:1},
profileAwardsCloseButton:{alignSelf:"flex-start",marginTop:3,paddingVertical:3,paddingHorizontal:2},
profileAwardsCloseText:{color:"#3ea4ff",fontSize:9,fontWeight:"900",letterSpacing:.7}
,
rulesPage:{paddingBottom:24},
rulesHero:{backgroundColor:"rgba(2,15,35,.94)",borderWidth:1,borderColor:"rgba(54,125,255,.72)",borderRadius:18,padding:18,marginBottom:16,shadowColor:"#1477ff",shadowOpacity:.22,shadowRadius:12,elevation:5},
rulesKicker:{color:"#ef3d3d",fontSize:10,fontWeight:"900",letterSpacing:2.1,marginBottom:5},
rulesHeroTitle:{color:"#fff",fontSize:25,fontWeight:"900",letterSpacing:.5},
rulesUpdated:{color:"#7f9bb1",fontSize:8,fontWeight:"800",letterSpacing:.65,marginTop:6},
rulesFormatBar:{flexDirection:"row",alignItems:"stretch",backgroundColor:"rgba(5,24,46,.92)",borderWidth:1,borderColor:"rgba(255,255,255,.10)",borderRadius:13,marginTop:16,overflow:"hidden"},
rulesFormatItem:{flex:1,alignItems:"center",justifyContent:"center",paddingVertical:12,paddingHorizontal:4},
rulesFormatValue:{color:"#fff",fontSize:17,fontWeight:"900"},
rulesFormatLabel:{color:"#3ea4ff",fontSize:7,fontWeight:"900",letterSpacing:.8,marginTop:2,textAlign:"center"},
rulesFormatDivider:{width:1,backgroundColor:"rgba(255,255,255,.12)",marginVertical:8},
rulesHeroNote:{color:"#a8bfd1",fontSize:10,lineHeight:15,marginTop:13},
rulesSectionHeadingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:2,marginBottom:7,paddingHorizontal:2},
rulesSectionHeading:{color:"#fff",fontSize:12,fontWeight:"900",letterSpacing:1.3},
rulesSectionCount:{color:"#6f8597",fontSize:8,fontWeight:"800",letterSpacing:.8},
ruleCard:{backgroundColor:"rgba(3,15,31,.92)",borderWidth:1,borderColor:"rgba(90,150,210,.34)",borderRadius:14,marginBottom:9,overflow:"hidden"},
ruleCardHeader:{minHeight:72,flexDirection:"row",alignItems:"center",paddingVertical:11,paddingHorizontal:12},
ruleNumber:{width:38,height:38,borderRadius:11,backgroundColor:"rgba(20,119,255,.16)",borderWidth:1,borderColor:"rgba(20,119,255,.58)",alignItems:"center",justifyContent:"center",marginRight:11},
ruleNumberText:{color:"#67adff",fontSize:12,fontWeight:"900",letterSpacing:.6},
ruleHeaderCopy:{flex:1},
ruleEyebrow:{color:"#ef3d3d",fontSize:7,fontWeight:"900",letterSpacing:1.1,marginBottom:3},
ruleTitle:{color:"#fff",fontSize:14,fontWeight:"900"},
ruleChevron:{color:"#3ea4ff",fontSize:24,fontWeight:"700",width:28,textAlign:"right"},
ruleBody:{borderTopWidth:1,borderTopColor:"rgba(255,255,255,.08)",paddingHorizontal:13,paddingTop:11,paddingBottom:12,backgroundColor:"rgba(2,10,22,.48)"},
ruleBulletRow:{flexDirection:"row",alignItems:"flex-start",marginBottom:9,paddingRight:4},
ruleBullet:{width:5,height:5,borderRadius:3,backgroundColor:"#3ea4ff",marginTop:6,marginRight:9},
ruleBulletText:{flex:1,color:"#d6e3ed",fontSize:10.5,lineHeight:16},
rulesAuthorityCard:{backgroundColor:"rgba(31,23,5,.78)",borderWidth:1,borderColor:"rgba(219,173,63,.46)",borderRadius:14,padding:14,marginTop:7},
rulesAuthorityTop:{flexDirection:"row",alignItems:"center",marginBottom:6},
rulesAuthorityIcon:{color:"#f2c94c",fontSize:15,marginRight:8},
rulesAuthorityTitle:{color:"#f2c94c",fontSize:10,fontWeight:"900",letterSpacing:.8},
rulesAuthorityText:{color:"#c7b98b",fontSize:9.5,lineHeight:15},

managerTournamentLinkSection:{marginTop:14,paddingTop:4,borderTopWidth:1,borderTopColor:"rgba(255,255,255,.12)"},
managerTournamentLink:{backgroundColor:"rgba(2,15,35,.92)",borderWidth:1.5,borderColor:"#9b5cff",borderRadius:14,padding:13,flexDirection:"row",alignItems:"center",marginBottom:10},
managerTournamentLinkIcon:{width:42,height:42,borderRadius:21,backgroundColor:"rgba(155,92,255,.18)",borderWidth:1,borderColor:"#9b5cff",alignItems:"center",justifyContent:"center",marginRight:10},
managerTournamentLinkIconText:{fontSize:21},
managerTournamentLinkName:{color:"#fff",fontSize:15,fontWeight:"900"},
managerTournamentLinkMeta:{color:"#a9b6c5",fontSize:9.5,marginTop:3},
tournamentDetailHeader:{flexDirection:"row",alignItems:"center",marginBottom:10},
tournamentBack:{color:"#fff",fontSize:38,lineHeight:40,fontWeight:"300",marginRight:8},
tournamentDetailTitle:{color:"#fff",fontSize:20,fontWeight:"900"},
tournamentDetailMeta:{color:"#9b5cff",fontSize:9,fontWeight:"800",marginTop:3,letterSpacing:.4},
tournamentTabs:{flexDirection:"row",borderBottomWidth:1,borderBottomColor:"rgba(255,255,255,.16)",marginBottom:12},
tournamentTabButton:{flex:1,alignItems:"center",paddingVertical:10,borderBottomWidth:3,borderBottomColor:"transparent"},
tournamentTabButtonActive:{borderBottomColor:"#9b5cff"},
tournamentTabText:{color:"#8795a5",fontSize:10,fontWeight:"900"},
tournamentTabTextActive:{color:"#fff"},
bracketScroll:{paddingBottom:10,paddingRight:16,gap:10},
bracketColumn:{width:185,backgroundColor:"rgba(2,15,35,.84)",borderWidth:1,borderColor:"rgba(155,92,255,.32)",borderRadius:13,padding:10},
bracketRoundTitle:{color:"#9b5cff",fontSize:10,fontWeight:"900",letterSpacing:.8,marginBottom:8},
bracketMatch:{backgroundColor:"rgba(4,9,17,.9)",borderWidth:1,borderColor:"rgba(255,255,255,.14)",borderRadius:9,marginBottom:9,overflow:"hidden"},
bracketPlayer:{color:"#fff",fontSize:10,fontWeight:"800",paddingVertical:8,paddingHorizontal:8},
bracketDivider:{height:1,backgroundColor:"rgba(255,255,255,.12)"},
tournamentRulesCard:{backgroundColor:"rgba(2,15,35,.9)",borderWidth:1,borderColor:"rgba(155,92,255,.42)",borderRadius:14,padding:13,marginBottom:10},
tournamentRuleRow:{flexDirection:"row",alignItems:"flex-start",marginBottom:10},
tournamentRuleCheck:{color:"#39d353",fontSize:13,fontWeight:"900",width:22},
tournamentRuleText:{flex:1,color:"#e3e9ef",fontSize:10.5,lineHeight:16,fontWeight:"700"},
announcementModalShade:{flex:1,backgroundColor:"rgba(0,0,0,.76)",alignItems:"center",justifyContent:"center",padding:22},
announcementModalCard:{width:"100%",maxWidth:430,backgroundColor:"rgba(4,10,20,.98)",borderWidth:1.5,borderColor:"#9b5cff",borderRadius:18,padding:20,alignItems:"center",shadowColor:"#000",shadowOpacity:.55,shadowRadius:18,elevation:16},
announcementModalIcon:{width:58,height:58,borderRadius:29,backgroundColor:"#8b45e6",alignItems:"center",justifyContent:"center",marginTop:-48,marginBottom:10,borderWidth:2,borderColor:"rgba(255,255,255,.45)"},
announcementModalIconText:{fontSize:27},
announcementModalKicker:{color:"#b06cff",fontSize:9,fontWeight:"900",letterSpacing:1.3,marginBottom:5},
announcementModalTitle:{color:"#fff",fontSize:20,fontWeight:"900",textAlign:"center",marginBottom:9},
announcementModalBody:{color:"#d7e0e8",fontSize:12,lineHeight:18,textAlign:"center",marginBottom:12},
announcementTournamentInfo:{width:"100%",backgroundColor:"rgba(155,92,255,.09)",borderWidth:1,borderColor:"rgba(155,92,255,.28)",borderRadius:11,padding:10,marginBottom:10},
announcementTournamentInfoText:{color:"#e7e9ef",fontSize:10.5,textAlign:"center",fontWeight:"700",marginBottom:3},
announcementDeadline:{color:"#f2c94c",fontSize:9.5,textAlign:"center",fontWeight:"900",marginTop:4},
announcementChoiceStack:{width:"100%",gap:8,marginTop:4},
announcementChoice:{minHeight:44,borderRadius:10,backgroundColor:"#315fe8",alignItems:"center",justifyContent:"center",paddingHorizontal:12},
announcementJoin:{backgroundColor:"#22963a"},
announcementDecline:{backgroundColor:"#d93838"},
announcementOkay:{backgroundColor:"#8b45e6"},
announcementChoiceText:{color:"#fff",fontSize:11,fontWeight:"900",letterSpacing:.4},
trophyCasePage:{paddingBottom:28},
trophyHero:{backgroundColor:"rgba(2,8,16,.96)",borderWidth:1,borderColor:"rgba(204,154,45,.64)",borderRadius:18,padding:18,marginBottom:16},
trophyKicker:{color:"#e2aa33",fontSize:10,fontWeight:"900",letterSpacing:2.1},
trophyHeroTitle:{color:"#fff",fontSize:26,fontWeight:"900",letterSpacing:.7,marginTop:4},
trophyHeroCount:{color:"#e2aa33",fontSize:9,fontWeight:"900",letterSpacing:1.2,marginTop:6},
trophyHeroSub:{color:"#aab8c5",fontSize:10.5,lineHeight:16,marginTop:8},
trophySection:{marginBottom:16},
trophySectionHeadingRow:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:8},
trophySectionTitle:{color:"#e2aa33",fontSize:11,fontWeight:"900",letterSpacing:1.1},
trophySectionLine:{flex:1,height:1,backgroundColor:"rgba(226,170,51,.45)"},
trophyGrid:{gap:10},
trophyCard:{width:"100%",backgroundColor:"rgba(2,7,13,.94)",borderWidth:1,borderColor:"rgba(113,126,138,.32)",borderRadius:14,padding:10,flexDirection:"row",alignItems:"center",minHeight:142},
trophyImageWrap:{width:126,height:126,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(0,0,0,.22)",borderRadius:11,overflow:"hidden",marginRight:12},
trophyImage:{width:120,height:120,borderRadius:8},
trophyCardText:{flex:1},
trophyName:{color:"#fff",fontSize:14,fontWeight:"900",textAlign:"left"},
trophyMeaningLabel:{color:"#e2aa33",fontSize:7.5,fontWeight:"900",letterSpacing:.8,marginTop:6},
trophyDetail:{color:"#c4d0d9",fontSize:10,lineHeight:15,textAlign:"left",marginTop:4},
trophyPermanentNote:{backgroundColor:"rgba(31,23,5,.78)",borderWidth:1,borderColor:"rgba(219,173,63,.46)",borderRadius:14,padding:14,marginTop:2},
trophyPermanentTitle:{color:"#f2c94c",fontSize:9.5,fontWeight:"900",letterSpacing:.8},
trophyPermanentText:{color:"#c7b98b",fontSize:9.5,lineHeight:15,marginTop:6},

serverStatusCard:{flexDirection:"row",alignItems:"center",gap:10,backgroundColor:"rgba(6,15,26,.94)",borderWidth:1,borderColor:"#24435c",borderRadius:14,paddingVertical:10,paddingHorizontal:12,marginBottom:12},
serverDot:{width:10,height:10,borderRadius:5},
serverStatusTitle:{color:"#f4f8fb",fontSize:12,fontWeight:"900",letterSpacing:.5},
serverStatusUrl:{color:"#83a5bf",fontSize:10,marginTop:2},
serverRefresh:{color:"#4bb7ff",fontSize:24,fontWeight:"800",paddingHorizontal:4},

managerSettingsRow:{borderColor:"rgba(230,57,70,.8)"},
managerNewPill:{backgroundColor:"#e63946",borderRadius:10,paddingHorizontal:8,paddingVertical:4,marginLeft:"auto",marginRight:8},
managerNewText:{color:"#fff",fontSize:8,fontWeight:"900",letterSpacing:.5},
managerHeader:{flexDirection:"row",alignItems:"center",gap:10,backgroundColor:"rgba(6,15,26,.96)",borderWidth:1,borderColor:"#24435c",borderRadius:14,padding:12,marginBottom:12},
managerHeaderTitle:{color:"#f4f8fb",fontSize:13,fontWeight:"900",letterSpacing:1},
managerHeaderSub:{color:"#83a5bf",fontSize:9,marginTop:3},
managerLead:{color:"#a9bdcd",fontSize:11,lineHeight:17,marginBottom:12},
managerLoading:{color:"#4bb7ff",fontSize:11,fontWeight:"900",textAlign:"center",paddingVertical:10,letterSpacing:.8},
managerError:{backgroundColor:"rgba(70,18,22,.92)",borderWidth:1,borderColor:"#b7333d",borderRadius:12,padding:12,marginBottom:12},
managerErrorTitle:{color:"#ff7b84",fontSize:10,fontWeight:"900",letterSpacing:1},
managerErrorText:{color:"#ffd7da",fontSize:10,lineHeight:15,marginTop:5},
managerMetricGrid:{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:12},
managerMetric:{width:"48.7%",minHeight:76,backgroundColor:"rgba(8,24,42,.94)",borderWidth:1,borderColor:"#24435c",borderRadius:12,padding:12},
managerMetricLabel:{color:"#89a7bd",fontSize:9,fontWeight:"900",letterSpacing:.8},
managerMetricValue:{color:"#fff",fontSize:18,fontWeight:"900",marginTop:7},
managerSection:{color:"#e63946",fontSize:10,fontWeight:"900",letterSpacing:1.2,marginTop:4,marginBottom:8},
managerMenuRow:{flexDirection:"row",alignItems:"center",backgroundColor:"rgba(5,18,35,.94)",borderWidth:1,borderColor:"#24435c",borderRadius:13,padding:12,marginBottom:8},
managerMenuIcon:{width:38,height:38,borderRadius:10,backgroundColor:"rgba(39,116,216,.18)",alignItems:"center",justifyContent:"center",marginRight:11},
managerMenuIconText:{fontSize:18,color:"#fff"},
managerMenuTitle:{color:"#fff",fontSize:14,fontWeight:"900"},
managerMenuSub:{color:"#88a2b7",fontSize:9,marginTop:3},
managerNotice:{backgroundColor:"rgba(7,22,36,.92)",borderWidth:1,borderColor:"#24435c",borderRadius:14,padding:16},
managerNoticeTitle:{color:"#e63946",fontSize:12,fontWeight:"900",letterSpacing:1},
managerNoticeText:{color:"#b8c8d5",fontSize:11,lineHeight:18,marginTop:8},
managerForm:{backgroundColor:"rgba(7,22,36,.92)",borderWidth:1,borderColor:"#24435c",borderRadius:14,padding:12,marginBottom:12},
managerFormTitle:{color:"#e63946",fontSize:11,fontWeight:"900",letterSpacing:1,marginBottom:9},
managerInput:{backgroundColor:"#0e2033",borderWidth:1,borderColor:"#31516d",borderRadius:9,color:"#fff",fontSize:12,paddingHorizontal:11,paddingVertical:10,marginBottom:8},
managerButtonRow:{flexDirection:"row",gap:8,marginTop:4},
managerPrimary:{flex:1,backgroundColor:"#2774d8",borderRadius:9,paddingVertical:11,paddingHorizontal:10,alignItems:"center",justifyContent:"center",marginVertical:4},
managerSecondary:{flex:1,backgroundColor:"#20364e",borderWidth:1,borderColor:"#3b5871",borderRadius:9,paddingVertical:11,paddingHorizontal:9,alignItems:"center",justifyContent:"center",marginVertical:4},
managerDanger:{backgroundColor:"#b7333d",borderRadius:9,paddingVertical:11,paddingHorizontal:12,alignItems:"center",justifyContent:"center",marginLeft:7},
managerButtonText:{color:"#fff",fontSize:9,fontWeight:"900",letterSpacing:.5,textAlign:"center"},
managerHint:{color:"#7995aa",fontSize:9,lineHeight:14,marginTop:8},
managerListCard:{backgroundColor:"rgba(7,22,36,.92)",borderWidth:1,borderColor:"#24435c",borderRadius:12,padding:12,marginBottom:8},
managerListTitle:{color:"#fff",fontSize:13,fontWeight:"900"},
managerListSub:{color:"#89a5ba",fontSize:9,lineHeight:14,marginTop:3},
managerBodyText:{color:"#c2d0db",fontSize:10,lineHeight:15,marginTop:7},
managerSmallActions:{flexDirection:"row",gap:7,marginTop:9},
managerMiniBtn:{backgroundColor:"#20364e",borderWidth:1,borderColor:"#3b5871",borderRadius:8,paddingHorizontal:12,paddingVertical:8},
managerMiniText:{color:"#fff",fontSize:8,fontWeight:"900"},
managerResetRow:{flexDirection:"row",alignItems:"center",marginTop:8},
choiceBlock:{marginBottom:9},
choiceLabel:{color:"#9db2c4",fontSize:9,fontWeight:"900",letterSpacing:.6,marginBottom:5},
choiceButton:{minHeight:42,backgroundColor:"#0e2033",borderWidth:1,borderColor:"#31516d",borderRadius:9,paddingHorizontal:11,flexDirection:"row",alignItems:"center"},
choiceButtonOpen:{borderColor:"#4bb7ff"},
choiceValue:{flex:1,color:"#fff",fontSize:11,fontWeight:"700"},
choiceArrow:{color:"#7fb8e8",fontSize:10,marginLeft:8},
choiceMenu:{backgroundColor:"#081725",borderWidth:1,borderColor:"#31516d",borderRadius:9,overflow:"hidden",marginTop:4},
choiceOption:{paddingVertical:10,paddingHorizontal:11,borderBottomWidth:1,borderBottomColor:"rgba(255,255,255,.06)"},
choiceOptionActive:{backgroundColor:"rgba(39,116,216,.22)"},
choiceOptionText:{color:"#c6d5df",fontSize:10},
choiceOptionTextActive:{color:"#fff",fontWeight:"900"},
emptyStateCard:{backgroundColor:"rgba(7,22,36,.72)",borderWidth:1,borderColor:"#24435c",borderRadius:12,padding:14,marginVertical:8},
emptyStateTitle:{color:"#fff",fontSize:11,fontWeight:"900",letterSpacing:.7},
emptyStateText:{color:"#8fa7ba",fontSize:10,lineHeight:15,marginTop:5},
matchSelfName:{color:"#fff",fontSize:15,fontWeight:"900"},
matchResultLetter:{color:"#35c759",fontSize:14,fontWeight:"900",marginRight:7},
divisionManagerHeader:{flexDirection:"row",alignItems:"center",marginBottom:6},
divisionMemberRow:{flexDirection:"row",alignItems:"center",paddingVertical:8,borderTopWidth:1,borderTopColor:"rgba(255,255,255,.08)"},
divisionMemberName:{color:"#fff",fontSize:11,fontWeight:"900"},
});
