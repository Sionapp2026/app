// Firebase (Spark-planen): innlogging og database. Lastes som modul fra index.html.
// firebaseConfig er ikke hemmelig. Det er reglene i firestore.rules som beskytter dataene.
const V='10.14.1',B='https://www.gstatic.com/firebasejs/'+V+'/';
try{
  const [{initializeApp},A,S]=await Promise.all([import(B+'firebase-app.js'),import(B+'firebase-auth.js'),import(B+'firebase-firestore.js')]);
  const M=await import(B+'firebase-messaging.js').catch(()=>null);   // varsler; appen virker uten
  const VAPID='BN0qXSST7zltP6MnXUbUiQg7HUDkobWNyUKld6kpW2TkKPiXtz9n3xbqquMKb0iakhv2wQt3kpDpofroi144D3M';   // offentlig nøkkel for web-push
  const app=initializeApp({
    apiKey:"AIzaSyAd8OmuuLWJYI2ICbPdn7VN6DQge4lp5mA",
    authDomain:"sion-molde-app.firebaseapp.com",
    projectId:"sion-molde-app",
    storageBucket:"sion-molde-app.firebasestorage.app",
    messagingSenderId:"792770444668",
    appId:"1:792770444668:web:ee5b9814f1190666adf8f9"});
  const auth=A.getAuth(app),db=S.getFirestore(app);
  await A.setPersistence(auth,A.browserLocalPersistence).catch(()=>{});   // brukeren forblir innlogget til hen logger ut
  // Egen forekomst brukes til å opprette brukere, slik at administratoren ikke logges ut av seg selv.
  const secAuth=A.getAuth(initializeApp(app.options,'oppretter'));
  // Sikkerhetspunkter (snapshots): innholdet lagres som tekst i databasen så administratorer kan rulle tilbake etter et uhell.
  const SNAP_COLS=['events','posts','regular','members','admins'],KEEP_COLS=['events','posts','regular'];
  const utTid=v=>v&&typeof v.toDate==='function'?{__tid:v.toDate().toISOString()}:Array.isArray(v)?v.map(utTid):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,utTid(x)])):v;
  const revive=v=>v&&typeof v==='object'&&typeof v.__tid==='string'?S.Timestamp.fromDate(new Date(v.__tid)):Array.isArray(v)?v.map(revive):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,revive(x)])):v;
  const FB={
    full:false,   // true for medlemmer og administratorer: da hentes også medlemsinnhold
    get user(){return auth.currentUser},
    onAuth:cb=>A.onAuthStateChanged(auth,cb),
    login:(e,p)=>A.signInWithEmailAndPassword(auth,e,p),
    logout:()=>A.signOut(auth),
    reset:e=>A.sendPasswordResetEmail(auth,e),
    // Endring av passord krever at brukeren bekrefter det gamle passordet først.
    async changePassword(old,nw){const u=auth.currentUser;await A.reauthenticateWithCredential(u,A.EmailAuthProvider.credential(u.email,old));await A.updatePassword(u,nw)},
    // Uinnloggede ber bare om åpent innhold (m == false). Reglene krever det samme.
    async list(col){
      const c=S.collection(db,col);
      const snap=await S.getDocs(FB.full?c:S.query(c,S.where('m','==',false)));
      return snap.docs.map(d=>{const x=d.data();return {...x,id:d.id,ms:x.created&&x.created.toMillis?x.created.toMillis():0}});
    },
    async isAdmin(email){
      try{return (await S.getDoc(S.doc(db,'admins',email))).exists()}catch(e){return false}
    },
    add:(col,data)=>S.addDoc(S.collection(db,col),{...data,created:S.serverTimestamp()}),
    set:(col,id,data)=>S.setDoc(S.doc(db,col,id),data,{merge:true}),
    // Unntak for enkeltdatoer på en fast samling (avlyst / fjernet / endret). Hele ex-feltet byttes ut.
    setFastEx:(id,ex)=>S.updateDoc(S.doc(db,'regular',id),{ex}),
    // Grupper (samlingen groups): navn og beskrivelse. Appen bruker innebygde standardgrupper til administrator redigerer første gang.
    async groupsList(){const s=await S.getDocs(S.collection(db,'groups'));return s.docs.map(d=>({id:d.id,...d.data()}))},
    setGroupDoc:(id,d)=>S.setDoc(S.doc(db,'groups',id),d,{merge:true}),
    delGroupDoc:id=>S.deleteDoc(S.doc(db,'groups',id)),
    del:(col,id)=>S.deleteDoc(S.doc(db,col,id)),
    // «Jeg kommer»: en anonym teller per arrangement. Ingen navn lagres, bare antallet.
    async counts(){const snap=await S.getDocs(S.collection(db,'rsvpCounts'));const o={};snap.docs.forEach(d=>o[d.id]=d.data().n||0);return o},
    async rsvp(id,delta){
      const ref=S.doc(db,'rsvpCounts',id),s=await S.getDoc(ref);
      if(s.exists())await S.updateDoc(ref,{n:S.increment(delta)});
      else if(delta>0)await S.setDoc(ref,{n:1});
    },
    // ---- Push-varsler (Firebase Cloud Messaging). Enhetens varselkode lagres i pushTokens; bare administratorer kan lese dem.
    async pushSupported(){try{return !!M&&await M.isSupported()&&'Notification' in window&&'serviceWorker' in navigator}catch(e){return false}},
    async enablePush(reg){
      if(!(await FB.pushSupported()))throw {code:'push/unsupported'};
      if(await Notification.requestPermission()!=='granted')throw {code:'push/denied'};
      const token=await M.getToken(M.getMessaging(app),{vapidKey:VAPID,serviceWorkerRegistration:reg});
      if(!token)throw {code:'push/no-token'};
      // Er brukeren innlogget, kobles koden til e-posten. Da kan tjenesten sende til medlemmer og grupper. Besøkende får bare «alle»-varsler.
      const ref=S.doc(db,'pushTokens',token);
      try{await S.setDoc(ref,{token,groups:[],created:S.serverTimestamp(),...(auth.currentUser?{email:auth.currentUser.email.toLowerCase()}:{})})}
      catch(e){   // reglene tillater kanskje ikke e-post ennå: lagre uten kobling, så «alle»-varsler fungerer
        if(!auth.currentUser||e.code!=='permission-denied')throw e;
        await S.setDoc(ref,{token,groups:[],created:S.serverTimestamp()});
      }
      return token;
    },
    // Kobler en eksisterende varselkode til innlogget bruker (etter innlogging), eller fjerner koblingen (før utlogging).
    // Påminnelser: ett dokument per enhet og samling. Apps Script sender varselet når fireAt er passert og sletter dokumentet.
    setReminder:(id,d)=>S.setDoc(S.doc(db,'reminders',id),{...d,created:S.serverTimestamp()}),
    delReminder:id=>S.deleteDoc(S.doc(db,'reminders',id)),
    linkPush:token=>auth.currentUser?S.setDoc(S.doc(db,'pushTokens',token),{token,groups:[],created:S.serverTimestamp(),email:auth.currentUser.email.toLowerCase()}):Promise.resolve(),
    unlinkPush:token=>S.setDoc(S.doc(db,'pushTokens',token),{token,groups:[],created:S.serverTimestamp()}),
    // Feiler høyt: kalleren beholder status og viser feil hvis abonnementet ikke faktisk ble fjernet.
    // Firebase trenger å vite hvilken service worker som eier abonnementet (reg) før koden kan slettes etter en sideinnlasting.
    // Mislykkes den vanlige slettingen, avslutter vi abonnementet direkte i nettleseren. Mislykkes begge, feiler vi høyt.
    async disablePush(token,reg){
      const m=M.getMessaging(app);
      let done=false,err;
      try{
        if(reg)await M.getToken(m,{vapidKey:VAPID,serviceWorkerRegistration:reg}).catch(()=>{});
        done=await M.deleteToken(m);
      }catch(e){err=e}
      if(!done&&reg){
        try{const sub=await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();done=true}catch(e){err=err||e}
      }
      if(!done)throw err||{code:'push/not-removed'};
      if(token)await S.deleteDoc(S.doc(db,'pushTokens',token));
    },
    // Sender varsel via Apps Script-tjenesten. Tjenesten sjekker innloggingsbeviset og at brukeren er administrator.
    async sendPush(url,title,body,tab,mal){
      const idToken=await auth.currentUser.getIdToken(true);
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,title,body,tab,mal})});
      return r.json();
    },
    // Sikkerhetskopi: henter alt innhold (også medlemsinnhold og brukerlister) som ren tekst. Bare administratorer får lov.
    // Varselkoder (pushTokens) tas ikke med: de er enhetsidentifikatorer og lar seg gjenskape ved at folk slår på varsler igjen.
    async exportAll(){
      const cols=['events','posts','regular','rsvpCounts','members','admins'];
      const ut=v=>v&&typeof v.toDate==='function'?{__tid:v.toDate().toISOString()}:Array.isArray(v)?v.map(ut):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,ut(x)])):v;
      const res={};
      for(const c of cols){
        const snap=await S.getDocs(S.collection(db,c));
        res[c]=snap.docs.map(d=>({id:d.id,data:ut(d.data())}));
      }
      return res;
    },
    // ---- Sikkerhetspunkter og tilbakerulling (bare administratorer) ----
    // Oversikten ligger i snapshots, selve innholdet som tekst i snapshotData. Innhold (arrangementer, nyheter, faste samlinger) erstattes ved
    // tilbakerulling. Brukerlistene (members, admins) flettes: ingen brukere slettes, og ingen administrator kan låses ute.
    async collect(cols){
      const res={};
      for(const c of cols){const snap=await S.getDocs(S.collection(db,c));res[c]=snap.docs.map(d=>({id:d.id,data:utTid(d.data())}))}
      return res;
    },
    async makeSnapshot(label){
      const data=await FB.collect(SNAP_COLS),json=JSON.stringify(data);
      if(json.length>900000)throw {code:'snapshot/too-large'};
      const counts=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length]));
      // Et automatisk punkt av et tomt innhold lages ikke: da kunne en katastrofe slette gode punkter over tid.
      if(label==='Automatisk'&&(counts.events||0)+(counts.posts||0)+(counts.regular||0)===0)return null;
      const ref=await S.addDoc(S.collection(db,'snapshots'),{created:S.serverTimestamp(),by:auth.currentUser.email,label,counts});
      await S.setDoc(S.doc(db,'snapshotData',ref.id),{json});
      FB.pruneSnapshots(30).catch(()=>{});
      return ref.id;
    },
    async listSnapshots(){
      const snap=await S.getDocs(S.query(S.collection(db,'snapshots'),S.orderBy('created','desc'),S.limit(60)));
      return snap.docs.map(d=>{const x=d.data();return {id:d.id,label:x.label,by:x.by,counts:x.counts||{},ms:x.created&&x.created.toMillis?x.created.toMillis():0}});
    },
    async pruneSnapshots(keep){
      const l=await FB.listSnapshots();
      for(const x of l.slice(keep)){await S.deleteDoc(S.doc(db,'snapshotData',x.id)).catch(()=>{});await S.deleteDoc(S.doc(db,'snapshots',x.id))}
    },
    // Lager et punkt bare hvis det siste er eldre enn minMs (så vi ikke lager ett for hver sletting).
    async ensureSnapshot(label,minMs){
      const l=await FB.listSnapshots();
      return l.length&&Date.now()-l[0].ms<minMs?l[0].id:FB.makeSnapshot(label);
    },
    async loadSnapshot(id){
      const s=await S.getDoc(S.doc(db,'snapshotData',id));
      if(!s.exists())throw {code:'snapshot/missing'};
      return JSON.parse(s.data().json);
    },
    // Ren planlegging (uten skriving): hva som skal skrives og slettes for å gjenskape data. current = id-er som finnes nå, per samling.
    planRestore(current,data){
      const sets=[],dels=[];
      for(const c of SNAP_COLS){
        const snap=data&&data[c];if(!Array.isArray(snap))continue;
        const ids=new Set(snap.map(x=>x.id));
        snap.forEach(x=>sets.push([c,x.id,x.data]));
        if(KEEP_COLS.includes(c))(current[c]||[]).filter(id=>!ids.has(id)).forEach(id=>dels.push([c,id]));
      }
      return {sets,dels};
    },
    async restore(data){
      const current={};
      for(const c of KEEP_COLS){const snap=await S.getDocs(S.collection(db,c));current[c]=snap.docs.map(d=>d.id)}
      const {sets,dels}=FB.planRestore(current,data);
      const ops=[...dels.map(([c,id])=>({del:[c,id]})),...sets.map(([c,id,d])=>({set:[c,id,d]}))];
      for(let i=0;i<ops.length;i+=400){
        const b=S.writeBatch(db);
        ops.slice(i,i+400).forEach(o=>{if(o.del)b.delete(S.doc(db,o.del[0],o.del[1]));else b.set(S.doc(db,o.set[0],o.set[1]),revive(o.set[2]))});
        await b.commit();
      }
      return {skrevet:sets.length,slettet:dels.length};
    },
    // Varsel som kommer mens appen er åpen (da viser ikke nettleseren noe selv).
    onPush(cb){FB.pushSupported().then(ok=>{if(ok)M.onMessage(M.getMessaging(app),cb)})},
    // Gruppene innlogget bruker tilhører (fra egen oppføring i members og admins).
    async myGroups(email){
      const ut=new Set();
      for(const c of ['members','admins']){try{const s=await S.getDoc(S.doc(db,c,email));if(s.exists())(s.data().groups||[]).forEach(g=>ut.add(g))}catch(e){}}
      return [...ut];
    },
    // Gruppene innlogget bruker er leder for (kan publisere til). Settes bare av administratorer, i feltet leads på oppføringen i members.
    async myLeads(email){try{const s=await S.getDoc(S.doc(db,'members',email));return s.exists()?(s.data().leads||[]):[]}catch(e){return []}},
    // Rollen «Leder»: feltet leder på oppføringen i members. Gir innsyn i ledersamlinger og innhold for ledere, men ikke rett til å publisere.
    async myLeder(email){try{const s=await S.getDoc(S.doc(db,'members',email));return s.exists()&&s.data().leder===true}catch(e){return false}},
    setLeder:(email,v)=>S.updateDoc(S.doc(db,'members',email),{leder:!!v}),
    setLeads:(email,leads,groups)=>S.updateDoc(S.doc(db,'members',email),{leads,groups}),
    setGroups:(email,role,groups)=>S.updateDoc(S.doc(db,role==='admin'?'admins':'members',email),{groups}),
    async isMember(email){
      try{return (await S.getDoc(S.doc(db,'members',email))).exists()}catch(e){return false}
    },
    // Brukere = administratorer (samlingen admins) og medlemmer (samlingen members). Adressen er dokument-ID.
    async listUsers(){
      const [m,a]=await Promise.all([S.getDocs(S.collection(db,'members')),S.getDocs(S.collection(db,'admins'))]);
      return a.docs.map(d=>({id:d.id,role:'admin',groups:d.data().groups||[],leads:[]})).concat(m.docs.map(d=>({id:d.id,role:'member',groups:d.data().groups||[],leads:d.data().leads||[],leder:d.data().leder===true}))).sort((x,y)=>x.id<y.id?-1:1);
    },
    // Legger adressen i riktig liste, oppretter kontoen med et tilfeldig passord og sender en e-post der brukeren velger passord selv.
    async addUser(email,role){
      await S.setDoc(S.doc(db,role==='admin'?'admins':'members',email),{email,rolle:role==='admin'?'admin':'medlem',created:S.serverTimestamp(),by:auth.currentUser.email});
      const pw=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%56]).join('');
      let created=true;
      try{await A.createUserWithEmailAndPassword(secAuth,email,pw);await A.signOut(secAuth)}
      catch(e){if(e.code==='auth/email-already-in-use')created=false;else throw e}
      if(created)await A.sendPasswordResetEmail(auth,email);
      return {created};
    },
    async setRole(email,role){
      const to=role==='admin'?'admins':'members',from=role==='admin'?'members':'admins';
      await S.setDoc(S.doc(db,to,email),{email,rolle:role==='admin'?'admin':'medlem',created:S.serverTimestamp(),by:auth.currentUser.email});
      await S.deleteDoc(S.doc(db,from,email));
    },
    async removeUser(email){await S.deleteDoc(S.doc(db,'members',email));await S.deleteDoc(S.doc(db,'admins',email))},
    async addMany(col,items){
      const b=S.writeBatch(db);
      items.forEach(x=>b.set(S.doc(S.collection(db,col)),{...x,created:S.serverTimestamp()}));
      return b.commit();
    }
  };
  window._fbRes(FB);
}catch(e){console.warn('Firebase kunne ikke lastes, bruker JSON-filene',e);window._fbRes(null)}
