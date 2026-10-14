// Firebase (Spark-planen): innlogging og database. Lastes som modul fra index.html.
// firebaseConfig er ikke hemmelig. Det er reglene i firestore.rules som beskytter dataene.
const V='10.14.1',B='https://www.gstatic.com/firebasejs/'+V+'/';
try{
  const [{initializeApp},A,S]=await Promise.all([import(B+'firebase-app.js'),import(B+'firebase-auth.js'),import(B+'firebase-firestore.js')]);
  const app=initializeApp({
    apiKey:"AIzaSyAd8OmuuLWJYI2ICbPdn7VN6DQge4lp5mA",
    authDomain:"sion-molde-app.firebaseapp.com",
    projectId:"sion-molde-app",
    storageBucket:"sion-molde-app.firebasestorage.app",
    messagingSenderId:"792770444668",
    appId:"1:792770444668:web:ee5b9814f1190666adf8f9"});
  const auth=A.getAuth(app),db=S.getFirestore(app);
  const FB={
    get user(){return auth.currentUser},
    onAuth:cb=>A.onAuthStateChanged(auth,cb),
    login:(e,p)=>A.signInWithEmailAndPassword(auth,e,p),
    logout:()=>A.signOut(auth),
    reset:e=>A.sendPasswordResetEmail(auth,e),
    // Uinnloggede ber bare om åpent innhold (m == false). Reglene krever det samme.
    async list(col){
      const c=S.collection(db,col);
      const snap=await S.getDocs(auth.currentUser?c:S.query(c,S.where('m','==',false)));
      return snap.docs.map(d=>{const x=d.data();return {...x,id:d.id,ms:x.created&&x.created.toMillis?x.created.toMillis():0}});
    },
    async isAdmin(email){
      try{return (await S.getDoc(S.doc(db,'admins',email))).exists()}catch(e){return false}
    },
    add:(col,data)=>S.addDoc(S.collection(db,col),{...data,created:S.serverTimestamp()}),
    set:(col,id,data)=>S.setDoc(S.doc(db,col,id),data,{merge:true}),
    del:(col,id)=>S.deleteDoc(S.doc(db,col,id)),
    async addMany(col,items){
      const b=S.writeBatch(db);
      items.forEach(x=>b.set(S.doc(S.collection(db,col)),{...x,created:S.serverTimestamp()}));
      return b.commit();
    }
  };
  window._fbRes(FB);
}catch(e){console.warn('Firebase kunne ikke lastes, bruker JSON-filene',e);window._fbRes(null)}
