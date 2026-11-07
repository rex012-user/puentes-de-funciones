/* Function Bridge: lógica del juego */
"use strict";
/* ---------- utilidades ---------- */
const TOL=.15,MAX_SLOPE=2.2,WATER=-2,PRICE=100;
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const near0=v=>Math.abs(v)<1e-9;
const fmt=v=>{v=Math.round(v*100)/100;let s=(near0(v)?0:v).toFixed(2).replace(/\.?0+$/,'');return s.replace('-','−')};
const REDUCED=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const pick=a=>a[Math.floor(Math.random()*a.length)];
const rint=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const mix=(a,b,t)=>{const A=hex(a),B=hex(b);return`rgb(${A.map((v,i)=>Math.round(v+(B[i]-v)*t)).join(',')})`};
const mixHex=(a,b,t)=>{const A=hex(a),B=hex(b);return'#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- lector de fórmulas ----------
   Convierte el texto que escribe el jugador en una función de x.
   No usa eval: solo acepta números, x, constantes, operadores y las funciones de la lista. */
const FX_FUNCS={sen:Math.sin,sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,raiz:Math.sqrt,abs:Math.abs,ln:Math.log,log:Math.log10,log10:Math.log10,log2:Math.log2,exp:Math.exp,cosh:Math.cosh,senh:Math.sinh,sinh:Math.sinh,tanh:Math.tanh};
const FX_CONST={pi:Math.PI,e:Math.E};
function fxTokens(texto){
  const s=texto.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/[−–—]/g,'-').replace(/[·×]/g,'*').replace(/÷/g,'/').replace(/²/g,'^2').replace(/³/g,'^3')
    .replace(/π/g,' pi ').replace(/√/g,' sqrt ').replace(/(\d),(\d)/g,'$1.$2');
  const out=[];let i=0;
  while(i<s.length){
    const c=s[i];
    if(/\s/.test(c)){i++;continue}
    if(/[\d.]/.test(c)){
      const m=s.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
      if(!m)throw new Error('Hay un punto suelto en la fórmula.');
      out.push({t:'num',v:parseFloat(m[1])});i+=m[1].length;
      if(s[i]==='.')throw new Error('Un número tiene dos puntos decimales.');
      continue;
    }
    if(/[a-z]/.test(c)){
      let m=s.slice(i).match(/^(log2|log10|[a-z]+)/)[1];
      out.push({t:'id',v:m});i+=m.length;continue;
    }
    if('+-*/^()|'.includes(c)){out.push({t:c});i++;continue}
    throw new Error(`No entiendo el símbolo “${c}”.`);
  }
  return out;
}
/* Parser propio (versión anterior). Ya no es el principal: solo se usa si Math.js no cargó. */
function compilarFuncionPropia(texto){
  if(!texto||!texto.trim())throw new Error('Escribe una función de x.');
  if(texto.length>200)throw new Error('La fórmula es demasiado larga.');
  const T=fxTokens(texto);let i=0,absOpen=0;
  const peek=()=>T[i]?T[i].t:null;
  const startsFactor=()=>{const t=peek();return t==='num'||t==='id'||t==='('||(t==='|'&&absOpen===0)};
  function expr(){
    let a=term();
    while(peek()==='+'||peek()==='-'){const op=T[i++].t,l=a,r=term();a=op==='+'?x=>l(x)+r(x):x=>l(x)-r(x)}
    return a;
  }
  function term(){
    let a=unary();
    for(;;){
      if(peek()==='*'||peek()==='/'){const op=T[i++].t,l=a,r=unary();a=op==='*'?x=>l(x)*r(x):x=>l(x)/r(x)}
      else if(startsFactor()){const l=a,r=unary();a=x=>l(x)*r(x)}
      else return a;
    }
  }
  function unary(){
    if(peek()==='-'){i++;const a=unary();return x=>-a(x)}
    if(peek()==='+'){i++;return unary()}
    return power();
  }
  function power(){
    const b=primary();
    if(peek()==='^'){i++;const e=unary();return x=>Math.pow(b(x),e(x))}
    return b;
  }
  function primary(){
    const k=T[i];
    if(!k)throw new Error('La fórmula termina antes de tiempo: falta un número o una x.');
    if(k.t==='num'){i++;return()=>k.v}
    if(k.t==='('){
      i++;const a=expr();
      if(peek()!==')')throw new Error('Falta cerrar un paréntesis.');
      i++;return a;
    }
    if(k.t==='|'){
      i++;absOpen++;const a=expr();absOpen--;
      if(peek()!=='|')throw new Error('Falta cerrar el valor absoluto con otra barra |.');
      i++;return x=>Math.abs(a(x));
    }
    if(k.t==='id'){
      i++;
      if(k.v==='x')return x=>x;
      if(Object.hasOwn(FX_CONST,k.v)){const c=FX_CONST[k.v];return()=>c}
      if(Object.hasOwn(FX_FUNCS,k.v)){
        const fn=FX_FUNCS[k.v];
        if(peek()==='('){i++;const a=expr();if(peek()!==')')throw new Error(`Falta cerrar el paréntesis de ${k.v}( ).`);i++;return x=>fn(a(x))}
        if(k.v==='sqrt'){const a=primary();return x=>fn(a(x))}
        throw new Error(`Después de ${k.v} van paréntesis, por ejemplo ${k.v}(x).`);
      }
      throw new Error(`No conozco “${k.v}”. Si es una multiplicación, escríbela con *.`);
    }
    if(k.t===')')throw new Error('Sobra un paréntesis de cierre o falta un valor antes de él.');
    throw new Error(`Falta un número o una x antes de “${k.t}”.`);
  }
  const f=expr();
  if(i<T.length)throw new Error(T[i].t===')'?'Sobra un paréntesis de cierre.':`No esperaba “${T[i].v??T[i].t}” en esa posición.`);
  return x=>{const y=f(x);return Number.isFinite(y)?y:NaN};
}

/* ---------- motor algebraico: Math.js ----------
   compilarFuncion(texto) → función x ↦ y (número real, o NaN donde no existe).
   1. Normaliza lo que escribe el jugador (tildes, π, √, ², coma decimal, |x|).
   2. math.parse construye el árbol de la expresión.
   3. Se traducen los alias en español (sen, senh, raiz, ln, log) y se revisa que
      solo aparezcan x, pi, e, operadores aritméticos y funciones permitidas.
   4. math.compile(...).evaluate({x}) evalúa la función en cada punto. */
const MJ=window.math?window.math.create(window.math.all,{predictable:true}):null;
/* alias del jugador → nombre en Math.js. ln es el logaritmo natural y log es base 10. */
const FX_ALIAS={sen:'sin',senh:'sinh',raiz:'sqrt',ln:'log',log:'log10',tg:'tan',arcsen:'asin',arccos:'acos',arctan:'atan'};
const FX_OK=new Set(['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','sqrt','cbrt','abs','log','log10','log2','exp']);
const FX_OPS=new Set(['add','subtract','multiply','divide','pow','unaryMinus','unaryPlus']);
const FX_VARS=new Set(['x','pi','e']);
/* Las barras |…| no existen en Math.js: se cambian por abs(…). Una barra abre si va al inicio,
   después de un operador o de un paréntesis que abre; si no, cierra. */
function barrasAbs(s){
  let out='',stack=0,prev='';
  for(const c of s){
    if(c==='|'){
      const opens=prev===''||'+-*/^(,'.includes(prev)||prev==='|open';
      if(opens||stack===0){if(prev&&!('+-*/^(,'.includes(prev)||prev==='|open'))out+='*';out+='abs(';stack++;prev='|open'}
      else{out+=')';stack--;prev=')'}
      continue;
    }
    out+=c;if(!/\s/.test(c))prev=c;
  }
  if(stack)throw new Error('Falta cerrar el valor absoluto con otra barra |.');
  return out;
}
function normalizarFormula(texto){
  let s=texto.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/[−–—]/g,'-').replace(/[·×]/g,'*').replace(/÷/g,'/').replace(/²/g,'^2').replace(/³/g,'^3')
    .replace(/π/g,' pi ').replace(/√\s*\(/g,'sqrt(').replace(/√\s*(\d+\.?\d*|x)/g,'sqrt($1)').replace(/(\d),(\d)/g,'$1.$2');
  if(/[^a-z0-9.\s+\-*/^()|]/.test(s)){const c=s.match(/[^a-z0-9.\s+\-*/^()|]/)[0];throw new Error(`No entiendo el símbolo “${c}”.`)}
  return barrasAbs(s);
}
/* Traduce al español los errores de sintaxis de Math.js. */
function errorSintaxis(e){
  const m=String(e.message||''),pos=(m.match(/\(char (\d+)\)/)||[])[1],donde=pos?` (posición ${pos})`:'';
  if(/Parenthesis \) expected/.test(m))return'Falta cerrar un paréntesis.';
  if(/Unexpected end of expression/.test(m))return'La fórmula termina antes de tiempo: falta un número o una x.';
  if(/Value expected/.test(m))return`Falta un número o una x${donde}.`;
  if(/Unexpected operator \)/.test(m))return`Sobra un paréntesis de cierre${donde}.`;
  if(/Unexpected operator (\S+)/.test(m))return`No esperaba el operador “${m.match(/Unexpected operator (\S+)/)[1]}”${donde}.`;
  if(/Unexpected part "([^"]*)"/.test(m))return`No entiendo “${m.match(/Unexpected part "([^"]*)"/)[1]}”${donde}. Revisa los puntos decimales.`;
  return`La fórmula tiene un error de escritura${donde}.`;
}
function compilarFuncion(texto){
  if(!MJ)return compilarFuncionPropia(texto);
  if(!texto||!texto.trim())throw new Error('Escribe una función de x.');
  if(texto.length>200)throw new Error('La fórmula es demasiado larga.');
  let node;
  try{node=MJ.parse(normalizarFormula(texto))}
  catch(e){if(e instanceof SyntaxError&&/char|expected|Unexpected/.test(e.message))throw new Error(errorSintaxis(e));throw e}
  /* transform no recorre el interior de un nodo reemplazado: por eso los argumentos se transforman aquí mismo */
  const alias=n=>{
    if(n.type!=='FunctionNode'||n.fn.type!=='SymbolNode')return n;
    const name=n.fn.name,args=n.args.map(a=>a.transform(alias));
    /* x(x+1) o pi(x) son multiplicaciones, no llamadas a función */
    if(FX_VARS.has(name)&&args.length===1)return new MJ.OperatorNode('*','multiply',[new MJ.SymbolNode(name),args[0]],true);
    return new MJ.FunctionNode(new MJ.SymbolNode(Object.hasOwn(FX_ALIAS,name)?FX_ALIAS[name]:name),args);
  };
  node=node.transform(alias);
  /* solo números, x, pi, e, operadores aritméticos y funciones de la lista */
  node.traverse((n,path,parent)=>{
    switch(n.type){
      case'ParenthesisNode':break;
      case'ConstantNode':if(typeof n.value!=='number')throw new Error('Solo se aceptan números en la fórmula.');break;
      case'SymbolNode':
        if(parent&&parent.type==='FunctionNode'&&path==='fn')break;
        if(FX_VARS.has(n.name))break;
        if(FX_OK.has(n.name)||Object.hasOwn(FX_ALIAS,n.name)||Object.values(FX_ALIAS).includes(n.name))throw new Error(`Después de ${n.name} van paréntesis, por ejemplo ${n.name}(x).`);
        throw new Error(`No conozco “${n.name}”. La única variable es x; si es una multiplicación, escríbela con *.`);
      case'FunctionNode':{
        const name=n.fn.name;
        if(!FX_OK.has(name))throw new Error(`No conozco la función “${name}”. Usa sen, cos, tan, raiz, abs, ln, log, exp…`);
        if(n.args.length!==1)throw new Error(`${name}( ) necesita exactamente un valor adentro, por ejemplo ${name}(x).`);
        break;
      }
      case'OperatorNode':if(!FX_OPS.has(n.fn))throw new Error(n.fn==='factorial'?'El factorial ! no se usa en los puentes.':`No se puede usar “${n.op}” en una función del puente.`);break;
      default:throw new Error('Esa expresión no es una función de x. Escribe algo como 2*x + 1.');
    }
  });
  const code=node.compile(),scope={x:0};
  /* Cualquier resultado que no sea un número real (complejo, infinito, error) cuenta como «no existe». */
  const fn=x=>{scope.x=x;let y;try{y=code.evaluate(scope)}catch(e){return NaN}return typeof y==='number'&&Number.isFinite(y)?y:NaN};
  fn.src=node.toString();
  return fn;
}
/* Busca dónde la función no existe dentro del tramo [a, b]: fuera del dominio o asíntota vertical. */
function avisoDominio(fn,a,b){
  const n=Math.ceil((b-a)/.01);let prev=null,prevX=a;
  for(let i=0;i<=n;i++){
    const x=a+(b-a)*i/n,y=fn(x);
    if(!Number.isFinite(y)){
      let u=prevX,v=x;
      if(prev!==null)for(let k=0;k<40;k++){const m=(u+v)/2;if(Number.isFinite(fn(m)))u=m;else v=m}
      const big=prev!==null&&Math.abs(fn(u))>50;
      return big?`Ojo: hay una asíntota vertical cerca de x ≈ ${fmt(v)}. Ahí la función no está definida y el puente se rompe.`
        :i===0?(()=>{let j=1;while(j<=n&&!Number.isFinite(fn(a+(b-a)*j/n)))j++;
          return j>n?`Ojo: la función no está definida en ningún punto entre x = ${fmt(a)} y x = ${fmt(b)}.`
            :`Ojo: la función no está definida entre x = ${fmt(a)} y x ≈ ${fmt(a+(b-a)*j/n)} (fuera de su dominio). El puente no puede empezar en la orilla.`})()
        :`Ojo: la función no está definida desde x ≈ ${fmt(v)} (fuera de su dominio). Ahí el puente se interrumpe.`;
    }
    if(prev!==null&&y*prev<0&&Math.abs(y-prev)>20&&Math.max(Math.abs(y),Math.abs(prev))>30)return`Ojo: hay una asíntota vertical cerca de x ≈ ${fmt((x+prevX)/2)}. Ahí la función no está definida y el puente se rompe.`;
    prev=y;prevX=x;
  }
  return'';
}
/* Pasa los deslizadores actuales a una fórmula que el jugador puede editar. */
const nTxt=v=>String(Math.round(v*1e4)/1e4);
const shTxt=h=>near0(h)?'x':h>0?`x - ${nTxt(h)}`:`x + ${nTxt(-h)}`;
const tlTxt=k=>near0(k)?'':k>0?` + ${nTxt(k)}`:` - ${nTxt(-k)}`;
function aTexto(id,p){
  const piTxt=n=>{const g=gcd(n,12),a=n/g,b=12/g;return`${a===1?'':a+'*'}pi${b===1?'':'/'+b}`};
  switch(id){
    case'constante':return nTxt(p.k);
    case'lineal':return`${nTxt(p.m)}*x${tlTxt(p.b)}`;
    case'absoluto':return`${nTxt(p.a)}*abs(${shTxt(p.h)})${tlTxt(p.k)}`;
    case'cuadratica':return`${nTxt(p.a)}*(${shTxt(p.h)})^2${tlTxt(p.k)}`;
    case'cubica':return`${nTxt(p.a)}*(${shTxt(p.h)})^3${tlTxt(p.k)}`;
    case'raiz':return`${nTxt(p.a)}*sqrt(${shTxt(p.h)})${tlTxt(p.k)}`;
    case'exponencial':return`${nTxt(p.a)}*${nTxt(p.b)}^x${tlTxt(p.c)}`;
    case'logaritmica':return`${nTxt(p.a)}*log2(${shTxt(p.h)})${tlTxt(p.k)}`;
    case'racional':return`${nTxt(p.a)}/(${shTxt(p.h)})${tlTxt(p.k)}`;
    case'seno':return`${nTxt(p.a)}*sen(${piTxt(p.n)}*(${shTxt(p.h)}))${tlTxt(p.k)}`;
    case'catenaria':return`${nTxt(p.a)}*cosh((${shTxt(p.h)})/${nTxt(p.a)})${tlTxt(p.c)}`;
    default:return'';
  }
}

/* ---------- ecuaciones ---------- */
const V=(i,val,abs)=>`<b class="p${i}">${fmt(abs?Math.abs(val):val)}</b>`;
const shift=(i,h)=>near0(h)?'x':h>0?`x − ${V(i,h)}`:`x + ${V(i,h,1)}`;
const tail=(i,k)=>near0(k)?'':k>0?` + ${V(i,k)}`:` − ${V(i,k,1)}`;
const gcd=(a,b)=>b?gcd(b,a%b):a;
const fmtPi=n=>{n=Math.round(n);if(n===0)return'0';const g=gcd(n,12),a=n/g,b=12/g;return`${a===1?'':a}π${b===1?'':'/'+b}`};
const PARAMS={h:{id:'h',min:-4,max:14,step:.5,role:'mueve la curva a izquierda o derecha'},k:{id:'k',min:-2,max:7,step:.5,role:'sube o baja toda la curva'}};

/* ---------- las familias de funciones ---------- */
const FAM={
 constante:{name:'Constante',
  params:[{id:'k',min:-1,max:7,step:.5,role:'la altura de toda la recta'}],def:{k:1},
  f:(x,p)=>p.k, eq:p=>`y = ${V(0,p.k)}`, form:'y = k', handle:{y:'k',fix:'mid'},
  dom:'Todos los números reales',shape:'es una recta horizontal: la altura nunca cambia',tableCue:'todos los valores de y son iguales, sin importar x',
  life:'Una tarifa fija: pagas lo mismo sin importar cuánto uses.',demo:{k:2},
  rand:()=>({k:pick([-3,-2,-1,1,2,3,4])}),tableX:()=>[0,1,2,3,4]},
 lineal:{name:'Lineal',
  params:[{id:'m',min:-2,max:2,step:.1,role:'la pendiente: cuánto sube y por cada unidad de x'},{id:'b',min:-2,max:7,step:.5,role:'dónde corta el eje y'}],def:{m:0,b:3},
  f:(x,p)=>p.m*x+p.b, eq:p=>`y = ${V(0,p.m)}x${tail(1,p.b)}`, form:'y = mx + b', handle:{y:'b',fix:0},
  dom:'Todos los números reales',shape:'es una recta inclinada: su pendiente es igual en todas partes',tableCue:'el cambio de y es siempre el mismo cuando x avanza lo mismo',
  life:'Un taxi: un valor de arranque más un valor fijo por kilómetro.',demo:{m:.75,b:-1},
  rand:()=>({m:pick([-2,-1.5,-1,-.5,.5,1,1.5,2]),b:rint(-3,3)}),tableX:()=>[0,1,2,3,4]},
 absoluto:{name:'Valor absoluto',
  params:[{id:'a',min:-2,max:2,step:.1,role:'qué tan abierta es la V; si es negativa, se voltea'},{id:'h',...PARAMS.h,role:'mueve la esquina a izquierda o derecha'},{id:'k',...PARAMS.k,role:'sube o baja la esquina'}],def:{a:1,h:4,k:1},
  f:(x,p)=>p.a*Math.abs(x-p.h)+p.k, eq:p=>`y = ${V(0,p.a)}|${shift(1,p.h)}|${tail(2,p.k)}`, form:'y = a|x − h| + k', handle:{x:'h',y:'k'},
  dom:'Todos los números reales',shape:'tiene forma de V: dos rectas simétricas que se unen en una esquina',tableCue:'los valores de y bajan a ritmo constante, llegan a un punto y suben al mismo ritmo',
  life:'La distancia a una señal de la vía mientras te acercas y luego te alejas.',demo:{a:1,h:0,k:-2},
  rand:()=>({a:pick([-2,-1.5,-1,-.5,.5,1,1.5,2]),h:rint(-3,3),k:rint(-3,3)}),tableX:p=>[-2,-1,0,1,2].map(d=>p.h+d)},
 cuadratica:{name:'Cuadrática',
  params:[{id:'a',min:-1,max:1,step:.01,role:'abre o cierra la parábola; si es negativa, se voltea'},{id:'h',...PARAMS.h,role:'mueve el vértice a izquierda o derecha'},{id:'k',...PARAMS.k,role:'sube o baja el vértice'}],def:{a:.25,h:4,k:1},
  f:(x,p)=>p.a*(x-p.h)**2+p.k, eq:p=>`y = ${V(0,p.a)}(${shift(1,p.h)})²${tail(2,p.k)}`, form:'y = a(x − h)² + k', handle:{x:'h',y:'k'},
  dom:'Todos los números reales',shape:'es una parábola: una curva suave y simétrica con un solo vértice',tableCue:'las segundas diferencias de y son constantes',
  life:'La trayectoria de un balón o la forma de un arco.',demo:{a:.4,h:0,k:-3},
  rand:()=>({a:pick([-1,-.5,-.25,.25,.5,1]),h:rint(-2,2),k:rint(-3,3)}),tableX:p=>[-2,-1,0,1,2].map(d=>p.h+d)},
 cubica:{name:'Cúbica',
  params:[{id:'a',min:-.2,max:.2,step:.01,role:'qué tan empinada es la S; si es negativa, se voltea'},{id:'h',...PARAMS.h,role:'mueve el punto de inflexión a izquierda o derecha'},{id:'k',...PARAMS.k,role:'sube o baja el punto de inflexión'}],def:{a:.05,h:4,k:2},
  f:(x,p)=>p.a*(x-p.h)**3+p.k, eq:p=>`y = ${V(0,p.a)}(${shift(1,p.h)})³${tail(2,p.k)}`, form:'y = a(x − h)³ + k', handle:{x:'h',y:'k'},
  dom:'Todos los números reales',shape:'tiene forma de S: se aplana en un punto de inflexión y sigue en la misma dirección',tableCue:'las terceras diferencias de y son constantes',
  life:'El volumen de una caja cúbica según la medida de su lado.',demo:{a:.1,h:0,k:0},
  rand:()=>({a:pick([-.3,-.15,-.1,.1,.15,.3]),h:rint(-2,2),k:rint(-2,2)}),tableX:p=>[-2,-1,0,1,2].map(d=>p.h+d)},
 raiz:{name:'Raíz cuadrada',
  params:[{id:'a',min:-4,max:4,step:.25,role:'estira la curva; si es negativa, baja en vez de subir'},{id:'h',...PARAMS.h,min:-4,max:12,role:'mueve el punto de arranque. La función no existe para x < h'},{id:'k',...PARAMS.k,role:'sube o baja el punto de arranque'}],def:{a:1,h:3,k:0},
  f:(x,p)=>x<p.h?NaN:p.a*Math.sqrt(x-p.h)+p.k, eq:p=>`y = ${V(0,p.a)}√(${shift(1,p.h)})${tail(2,p.k)}`, form:'y = a√(x − h) + k', handle:{x:'h',y:'k'},
  dom:'x ≥ h',shape:'arranca en un punto, crece rápido al inicio y cada vez más despacio; no existe a la izquierda del arranque',tableCue:'si x − h es 0, 1, 4, 9, y avanza en pasos iguales',
  life:'La velocidad de un objeto al caer según la altura recorrida.',demo:{a:2,h:-4,k:-3},
  domNote:p=>`La raíz solo existe cuando x ≥ h. Con h = ${fmt(p.h)}, no hay puente a la izquierda de x = ${fmt(p.h)}.`,
  rand:()=>({a:pick([-2,-1.5,1,1.5,2]),h:rint(-5,-1),k:rint(-3,1)}),tableX:p=>[0,1,4,9,16].map(d=>p.h+d)},
 exponencial:{name:'Exponencial',
  params:[{id:'a',min:-6,max:6,step:.25,role:'el valor inicial sobre la asíntota (cuando x = 0)'},{id:'b',min:.5,max:2,step:.05,role:'el factor: mayor que 1 crece, menor que 1 decae'},{id:'c',min:-2,max:6,step:.5,role:'la altura de la asíntota horizontal'}],def:{a:1,b:1.2,c:1},
  f:(x,p)=>p.a*Math.pow(p.b,x)+p.c, eq:p=>`y = ${V(0,p.a)} · ${V(1,p.b)}<sup>x</sup>${tail(2,p.c)}`, form:'y = a · bˣ + c', handle:{y:'c',fix:'right'},
  dom:'Todos los números reales',shape:'crece o decae cada vez más rápido y por un lado se pega a una asíntota horizontal',tableCue:'cuando x aumenta 1, y se multiplica siempre por el mismo factor',
  life:'El interés compuesto o el crecimiento de una población.',demo:{a:1,b:1.5,c:-3},
  rand:()=>({a:pick([-1,1,2,.5]),b:pick([1.5,2,.5,.75]),c:rint(-2,2)}),tableX:()=>[0,1,2,3,4]},
 logaritmica:{name:'Logarítmica',
  params:[{id:'a',min:-4,max:4,step:.25,role:'estira la curva; si es negativa, se voltea'},{id:'h',...PARAMS.h,min:-4,max:12,role:'mueve la asíntota vertical. La función no existe para x ≤ h'},{id:'k',...PARAMS.k,role:'sube o baja toda la curva'}],def:{a:1,h:2,k:1},
  f:(x,p)=>x<=p.h?NaN:p.a*Math.log2(x-p.h)+p.k, eq:p=>`y = ${V(0,p.a)} · log₂(${shift(1,p.h)})${tail(2,p.k)}`, form:'y = a · log₂(x − h) + k', handle:{x:'h',y:'k',dx:1},
  dom:'x > h',shape:'sale de una asíntota vertical, sube rápido y luego casi se aplana, sin dejar de crecer',tableCue:'cuando x − h se duplica, y aumenta siempre la misma cantidad',
  life:'La escala de los sismos o el pH de una sustancia.',demo:{a:2,h:-5,k:-3},
  domNote:p=>`El logaritmo solo existe cuando x > h. Con h = ${fmt(p.h)}, no hay puente a la izquierda de x = ${fmt(p.h)}.`,
  rand:()=>({a:pick([-2,-1,1,2,3]),h:rint(-5,-1),k:rint(-2,2)}),tableX:p=>[1,2,4,8,16].map(d=>p.h+d)},
 racional:{name:'Racional',
  params:[{id:'a',min:-10,max:10,step:.5,role:'aleja o acerca las ramas de las asíntotas'},{id:'h',...PARAMS.h,role:'la asíntota vertical. La función no existe en x = h'},{id:'k',...PARAMS.k,role:'la asíntota horizontal'}],def:{a:2,h:6,k:3},
  f:(x,p)=>near0(x-p.h)?NaN:p.a/(x-p.h)+p.k, eq:p=>`y = <span class="frac"><span>${V(0,p.a)}</span><span>${shift(1,p.h)}</span></span>${tail(2,p.k)}`, form:'y = a / (x − h) + k', handle:{x:'h',y:'k'},
  breaks:p=>[p.h],
  dom:'x ≠ h',shape:'tiene dos ramas separadas por una asíntota vertical y otra horizontal',tableCue:'el producto de x por y es constante (cuando h = 0 y k = 0)',
  life:'El tiempo de un viaje según la velocidad: a más velocidad, menos tiempo.',demo:{a:4,h:0,k:0},
  domNote:p=>`La división entre cero no existe: hay una asíntota vertical en x = ${fmt(p.h)}. Llévala fuera del tramo del puente.`,
  rand:()=>({a:pick([-4,-2,-1,1,2,4]),h:rint(-2,2),k:rint(-2,2)}),tableX:()=>[1,2,4,5,10]},
 seno:{name:'Trigonométrica (seno)',
  params:[{id:'a',min:-4,max:4,step:.5,role:'la amplitud: cuánto se aleja de la línea media'},{id:'n',label:'b',min:1,max:24,step:1,format:fmtPi,role:'la frecuencia: periodo = 2π / b'},{id:'h',min:-6,max:6,step:.5,role:'desplaza la onda a izquierda o derecha'},{id:'k',...PARAMS.k,role:'la línea media de la onda'}],def:{a:1,n:4,h:2,k:2},
  f:(x,p)=>p.a*Math.sin(p.n*Math.PI/12*(x-p.h))+p.k, eq:p=>`y = ${V(0,p.a)} · sen(<b class="p1">${fmtPi(p.n)}</b>(${shift(2,p.h)}))${tail(3,p.k)}`, form:'y = a · sen(b(x − h)) + k', handle:{x:'h',y:'k'},
  dom:'Todos los números reales',shape:'es una onda que se repite: siempre oscila entre un máximo y un mínimo',tableCue:'los valores de y se repiten cada cierto intervalo de x',
  life:'Las mareas, el sonido y la corriente eléctrica de una casa.',demo:{a:3,n:6,h:0,k:0},
  rand:()=>({a:pick([-3,-2,1,2,3]),n:pick([4,6,8,12]),h:rint(-1,1),k:rint(-1,1)}),tableX:p=>{const P=24/p.n;return[0,.25,.5,.75,1,1.25].map(t=>p.h+P*t)}},
 catenaria:{name:'Catenaria',
  params:[{id:'a',min:2,max:12,step:.5,role:'qué tan abierta es la curva: más grande, más plana'},{id:'h',...PARAMS.h,role:'mueve el punto más bajo a izquierda o derecha'},{id:'c',min:-10,max:6,step:.5,role:'sube o baja la curva; el punto más bajo queda en y = a + c'}],def:{a:4,h:4,c:-2},
  f:(x,p)=>p.a*Math.cosh((x-p.h)/p.a)+p.c, eq:p=>`y = ${V(0,p.a)} · cosh((${shift(1,p.h)}) / ${V(0,p.a)})${tail(2,p.c)}`, form:'y = a · cosh((x − h) / a) + c', handle:{x:'h',y:'c',dy:p=>p.a},
  dom:'Todos los números reales',shape:'es la curva de un cable que cuelga por su propio peso: simétrica como una parábola, pero combina dos exponenciales',tableCue:'los valores de y son simétricos alrededor del centro y ni sus primeras ni sus segundas diferencias son constantes',
  life:'Un cable de luz o una cadena que cuelga entre dos postes.',demo:{a:2,h:0,c:-4},
  rand:()=>({a:pick([1.5,2,3]),h:rint(-1,1),c:rint(-5,-3)}),tableX:p=>[-2,-1,0,1,2].map(d=>p.h+d)},
 tramos:{name:'Por tramos',
  params:[{id:'m1',label:'m₁',min:-2,max:2,step:.25,role:'pendiente del primer tramo'},{id:'b1',label:'b₁',min:-2,max:8,step:.5,role:'corte con y del primer tramo'},{id:'k',min:-2,max:7,step:.5,role:'altura del tramo central'},{id:'m2',label:'m₂',min:-2,max:2,step:.25,role:'pendiente del último tramo'},{id:'b2',label:'b₂',min:-4,max:14,step:.5,role:'corte con y del último tramo'}],def:{m1:0,b1:2,k:3,m2:0,b2:2},
  f:(x,p,L)=>{const[a,b]=L.breaks;return x<a?p.m1*x+p.b1:x<=b?p.k:p.m2*x+p.b2},
  eq:(p,L)=>{const[a,b]=L.breaks;return`y = <span class="cases"><span>${V(0,p.m1)}x${tail(1,p.b1)}</span><span>x &lt; ${fmt(a)}</span><span>${V(2,p.k)}</span><span>${fmt(a)} ≤ x ≤ ${fmt(b)}</span><span>${V(3,p.m2)}x${tail(4,p.b2)}</span><span>x &gt; ${fmt(b)}</span></span>`},
  form:'y = { una fórmula en cada intervalo', handle:{y:'k',fix:'mid'},breaks:(p,L)=>L.breaks,
  dom:'Cada tramo tiene su propio intervalo',shape:'está hecha de pedazos distintos, con esquinas o saltos donde cambia la fórmula',tableCue:'el patrón de los valores cambia de un intervalo a otro',
  life:'Las tarifas de los servicios públicos, que cambian según el consumo.',demo:{m1:1,b1:1,k:-1,m2:-1,b2:1},
  rand:()=>{const k=rint(-2,2),m1=pick([-1,-.5,.5,1]),m2=pick([-1,-.5,.5,1]),j=pick([0,0,2]);return{m1,b1:k+2*m1+j,k,m2,b2:k-2*m2}},tableX:null},
};
const FAM_IDS=Object.keys(FAM);
/* La fórmula escrita no entra en la guía ni en el examen, por eso se añade después de FAM_IDS. */
FAM.texto={name:'Fórmula escrita',params:[],def:{},f:(x,p)=>p.fn?p.fn(x):NaN,eq:p=>`y = ${esc(p.src||'…')}${p.px?' <small>(en px del informe)</small>':''}`,form:'y = f(x)',dom:'Depende de tu fórmula',shape:'la define tu fórmula',tableCue:'depende de tu fórmula',life:''};
const fullName=id=>id==='texto'?'Fórmula escrita':id==='tramos'?'Función por tramos':id==='seno'?'Función trigonométrica (seno)':id==='absoluto'?'Función valor absoluto':id==='raiz'?'Función raíz cuadrada':`Función ${FAM[id].name.toLowerCase()}`;

/* ---------- regiones ---------- */
const REG={
 canon:{label:'Cañón',sky:['#7FCBD8','#FFE9C2'],mt:['#D0A98C','#AB7F68'],rock:['#B8683E','#9C5434','#C97B49','#84462D','#D58E58'],grass:'#D9B45B',tree:['#74903F','#556F2C'],water:['#1B7482','#2A9AA6','#8FDDD8'],ink:'#102A47',sun:'#FFF6D0'},
 selva:{label:'Selva',sky:['#8ED9BC','#F4F8CC'],mt:['#62AB7E','#418A66'],rock:['#5B6E46','#4A5B3A','#6C8052','#3E4D31','#7C8F5B'],grass:'#6FBF55',tree:['#2F9358','#1F6F43'],water:['#116560','#1C8C80','#7FDCC0'],ink:'#0B2A28',sun:'#FFFDE0'},
 paramo:{label:'Páramo',sky:['#A7BBE3','#EDE6F1'],mt:['#94A0C3','#727FA6'],rock:['#6A6F8E','#585D7A','#7B81A1','#494D67','#8C91AE'],grass:'#B3B56A',tree:['#7E8F55','#616F40'],water:['#2E4F80','#4771A8','#B4D0EE'],ink:'#161F3D',sun:'#FFFFFF'},
 costa:{label:'Costa',sky:['#F28F6F','#FFE3AC'],mt:['#B85C7E','#8D4168'],rock:['#5C2E4E','#4A2340','#6E3A5C','#3A1B33','#80476A'],grass:'#E1A24A',tree:['#2F5D5A','#214845'],water:['#214670','#2F6796','#F9BE96'],ink:'#26102C',sun:'#FFF3C0'},
};

/* ---------- las 14 obras ---------- */
const LEVELS=[
 {n:1,id:'vado',name:'El vado',region:'canon',fam:'constante',rep:'graph',sol:{k:3},start:{k:1},xL:0,xR:12,pillars:[6],obs:[{t:'boat',x:3,y:2}],
  opts:['constante','lineal','cuadratica','absoluto'],
  story:'Las dos orillas están a la misma altura y el camión de suministros necesita cruzar sin subir ni bajar.',
  why:'La altura es la misma en todos los puntos, sin importar x. Esa es la marca de la función constante.',
  hint:'Esta función tiene un solo número: k. Lee en la cuadrícula a qué altura está el borde de la orilla.'},
 {n:2,id:'molino',name:'Rampa del molino',region:'canon',fam:'lineal',rep:'table',tableX:[0,2,4,6,8],sol:{m:.5,b:1},start:{m:0,b:3},xL:0,xR:12,pillars:[4,8],obs:[],
  opts:['lineal','exponencial','cuadratica','constante'],
  story:'El molino está más alto que el pueblo. La topógrafa midió cinco puntos de la rampa y dejó esta tabla.',
  why:'Cada vez que x aumenta 2, y aumenta 1. Un cambio constante significa pendiente constante: es lineal.',
  hint:'b es la altura donde x = 0. Para m, mira cuánto sube y cuando x avanza 1 unidad.'},
 {n:3,id:'condor',name:'Paso del cóndor',region:'canon',fam:'absoluto',rep:'graph',sol:{a:.5,h:6,k:2},start:{a:1,h:3,k:1},xL:0,xR:12,pillars:[2,6,10],obs:[{t:'cable',x:7.5,y:3.5}],
  opts:['absoluto','cuadratica','lineal','seno'],
  story:'Un teleférico cruza el cañón a poca altura. El puente debe bajar en línea recta, doblar en un punto y volver a subir.',
  why:'Son dos rectas simétricas que se unen en una esquina. Una parábola sería redondeada en el fondo.',
  hint:'La esquina está en (h, k). Arrastra el punto blanco hasta allí y luego ajusta a para que llegue a las orillas.'},
 /* Caso de estudio del informe: f(x) = −0.0025(x − 400)² + 150 en [200, 600] px, orillas en y = 50 px.
    Con 1 unidad = 100/3 px queda y = −(1/12)(x − 6)² + 4.5 en [0, 12], orillas en y = 1.5 y pendiente ±1 en los anclajes. */
 {n:4,id:'arco',name:'Arco del río',region:'selva',fam:'cuadratica',rep:'eq',informe:{x0:200,K:100/3},sol:{a:-1/12,h:6,k:4.5},start:{a:.25,h:4,k:3},xL:0,xR:12,pillars:[3,9],obs:[{t:'boat',x:6,y:4}],
  opts:['cuadratica','cubica','absoluto','exponencial'],
  story:'Un velero de mástil alto navega este río. El ingeniero jefe mandó la fórmula del arco por radio.',
  why:'La x aparece elevada al cuadrado. Por eso la gráfica es una parábola con vértice en (h, k).',
  hint:'Compara tu ecuación con la del plano: y = −0.08(x − 6)² + 4.5 (a = −1/12). Un valor negativo de a voltea la parábola. En «Escribir fórmula» puedes usar las unidades del informe: −0.0025*(x − 400)^2 + 150.'},
 {n:5,id:'eco',name:'Risco del eco',region:'selva',fam:'raiz',rep:'desc',desc:'“El camino arranca de golpe en un punto. Antes de ese punto no existe nada. Primero sube rápido y luego cada vez más despacio, pero en ningún punto hay una asíntota vertical.”',sol:{a:2,h:0,k:-1},start:{a:1,h:3,k:0},xL:1,xR:9,pillars:[4,6.25],obs:[],
  opts:['raiz','logaritmica','exponencial','cuadratica'],
  story:'La guía local describió el terreno por teléfono. Escucha con cuidado: dos funciones se parecen mucho.',
  why:'Tiene un punto de arranque definido y crece cada vez más lento. La logarítmica también frena, pero nace en una asíntota vertical.',
  hint:'El dominio es x ≥ h. Si h es mayor que el borde izquierdo, falta puente. Prueba con h = 0: √1, √4 y √9 dan números exactos.'},
 {n:6,id:'serpiente',name:'Curva de la serpiente',region:'selva',fam:'cubica',rep:'graph',sol:{a:.02,h:6,k:3.5},start:{a:-.05,h:4,k:2},xL:1,xR:11,pillars:[3,6,9],obs:[],
  opts:['cubica','seno','cuadratica','raiz'],
  story:'El puente debe subir, casi aplanarse sobre el pilar central y seguir subiendo hasta la otra orilla.',
  why:'Sube, se aplana en un punto de inflexión y sigue subiendo. Esa forma de S es de la cúbica.',
  hint:'El punto de inflexión es (h, k) y coincide con el pilar central. Luego ajusta a en pasos pequeños: 0.01 cambia mucho.'},
 {n:7,id:'ladera',name:'Ladera del factor',region:'paramo',fam:'exponencial',rep:'table',tableX:[0,1,2,3,4],sol:{a:1,b:1.25,c:0},start:{a:1,b:1.1,c:1},xL:0,xR:8,pillars:[4,6],obs:[],
  opts:['exponencial','lineal','cuadratica','logaritmica'],
  story:'La ladera se empina más a cada paso. Las medidas de altura muestran un patrón al dividir cada valor por el anterior.',
  why:'Cada valor es el anterior multiplicado por 1.25. Un factor constante es la marca de la exponencial.',
  hint:'Cuando x = 0, y vale a + c. Mira la tabla: divide cada y entre la anterior para encontrar b.'},
 {n:8,id:'terraza',name:'Terraza del páramo',region:'paramo',fam:'logaritmica',rep:'graph',sol:{a:1.5,h:-1,k:0},start:{a:1,h:2,k:1},xL:1,xR:12,pillars:[3,7],obs:[{t:'boat',x:9.5,y:4}],
  opts:['logaritmica','raiz','exponencial','racional'],
  story:'El terreno sube rápido cerca de la orilla y después casi se aplana. Un barco de carga necesita pasar por debajo.',
  why:'Sube rápido y luego casi se aplana, sin detenerse. Cuando x + 1 se duplica, y aumenta siempre lo mismo.',
  hint:'Con h = −1 los valores de x + 1 son 2, 4 y 8 en los puntos clave. Sus log₂ son 1, 2 y 3. Así encuentras a.'},
 {n:9,id:'garganta',name:'Garganta de la asíntota',region:'paramo',fam:'racional',rep:'eq',sol:{a:6,h:-1,k:2},start:{a:2,h:6,k:3},xL:1,xR:11,pillars:[2,5],obs:[{t:'cable',x:8,y:3.5}],
  opts:['racional','raiz','exponencial','lineal'],
  story:'Hay una grieta invisible: donde el denominador vale cero, la función no existe. Tu puente tiene que quedar a un solo lado.',
  why:'La x está en el denominador. Eso produce una asíntota vertical donde x − h = 0.',
  hint:'Fórmula del plano: y = 6 / (x + 1) + 2. Observa que x + 1 significa h = −1, no h = 1.'},
 {n:10,id:'olas',name:'Olas del estuario',region:'costa',fam:'seno',rep:'desc',desc:'“La ruta sube hasta y = 5.5, baja hasta y = 1.5 y vuelve al punto de partida. Ese ciclo mide exactamente 12 unidades y se repetiría sin fin.”',sol:{a:2,n:2,h:0,k:3.5},start:{a:1,n:4,h:2,k:2},xL:0,xR:12,pillars:[3,6,9],obs:[{t:'boat',x:9,y:.6}],
  opts:['seno','cuadratica','cubica','absoluto'],
  story:'Por la marea, esta ruta costera ondula de forma regular. El capitán del puerto dictó la descripción.',
  why:'Tiene máximo, mínimo y un ciclo que se repite. Solo una función periódica se comporta así.',
  hint:'La amplitud es la mitad entre máximo y mínimo. La línea media es k. Si el periodo es 12, entonces b = 2π/12 = π/6.'},
 {n:11,id:'viaducto',name:'Viaducto de tres tramos',region:'costa',fam:'tramos',rep:'graph',breaks:[4,8],sol:{m1:1,b1:1,k:5,m2:-.5,b2:9},start:{m1:0,b1:2,k:3,m2:0,b2:2},xL:0,xR:12,pillars:[2,6,10],obs:[],
  opts:['tramos','absoluto','cuadratica','seno'],
  story:'Una rampa, un tramo plano y una bajada: cada parte sigue su propia regla. Los tramos cambian en x = 4 y en x = 8.',
  why:'No hay una sola fórmula que describa las tres partes. Cada intervalo tiene su propia regla.',
  hint:'Cuida la continuidad: el primer tramo debe valer k en x = 4 y el último también debe valer k en x = 8.'},
 {n:12,id:'colgante',name:'Puente colgante',region:'canon',fam:'catenaria',rep:'eq',stayed:true,sol:{a:6,h:6,c:-3},start:{a:4,h:4,c:-2},xL:0,xR:12,pillars:[3,6,9],obs:[],
  opts:['catenaria','cuadratica','exponencial','absoluto'],
  story:'El cañón es tan profundo que no caben pilares. La calzada cuelga de dos torres y toma la forma de un cable sostenido por sus extremos.',
  why:'Aparece cosh, el coseno hiperbólico: cosh(u) = (eᵘ + e⁻ᵘ) / 2. Se parece a una parábola, pero es la suma de dos exponenciales.',
  hint:'El punto más bajo está en x = h y vale a + c. Aquí a + c = 3. Cambia a y ajusta c para que esa suma siga dando 3, hasta que la curva llegue a las orillas.'},
 {n:13,id:'viento',name:'Viento del estrecho',region:'costa',fam:'seno',rep:'desc',desc:'“La calzada sale de y = 3, sube y baja con un oleaje regular, vuelve a y = 3 justo en el centro y termina en y = 3 en la otra orilla.”',wind:{omega:Math.PI/6,zeta:.08,base:.1,limit:.35,mode:2},sol:{a:2,n:4,h:0,k:3},start:{a:1,n:2,h:2,k:2},xL:0,xR:12,pillars:[6],obs:[{t:'boat',x:2,y:4}],
  opts:['seno','cuadratica','cubica','tramos'],
  story:'El viento del estrecho empuja el puente con una frecuencia fija. Si tu puente vibra con esa misma frecuencia, cada ráfaga aumenta la oscilación.',
  why:'La ruta se repite con regularidad alrededor de una línea media. Solo una función periódica se comporta así.',
  hint:'El viento tiene ω = π/6, así que debes evitar b = π/6. El pilar central necesita y = 3 en x = 6: prueba con b = π/3, que da un periodo de 6.'},
 {n:14,id:'maestra',name:'Obra maestra',region:'costa',fam:'exponencial',free:true,sol:{a:6,b:.75,c:1},xL:0,xR:12,pillars:[2,4,7],obs:[],
  story:'Esta vez no hay plano. Solo tienes las orillas y los pilares. Observa cómo se acomodan y elige la función que pasa por todos.',
  why:'La caída se frena poco a poco y se acerca a una altura que nunca alcanza. Esa asíntota horizontal delata a la exponencial.',
  hint:'Mira los pilares: la caída se frena, nunca vuelve a subir y parece acercarse a y = 1. ¿Qué función tiene una asíntota horizontal?'},
];
LEVELS.forEach(L=>{
  const F=FAM[L.fam];
  L.yL=F.f(L.xL,L.sol,L);L.yR=F.f(L.xR,L.sol,L);
  L.pts=L.pillars.map(x=>({x,y:F.f(x,L.sol,L)}));
  L.reg=REG[L.region];
  L.budget=Math.ceil(analyze(L,L.fam,L.sol).cost*1.08/10)*10;
});

/* ---------- análisis matemático del puente ---------- */
function buildRuns(L,famId,p){
  const F=FAM[famId];
  const brk=(F.breaks?F.breaks(p,L):[]).filter(b=>b>L.xL+1e-6&&b<L.xR-1e-6).sort((a,b)=>a-b);
  const cuts=[L.xL,...brk,L.xR];const runs=[];
  for(let i=0;i<cuts.length-1;i++){
    const a=cuts[i],b=cuts[i+1],n=Math.max(2,Math.ceil((b-a)/.1));let cur=null;
    for(let j=0;j<=n;j++){
      let x=a+(b-a)*j/n;
      if(j===0&&i>0)x+=1e-6;
      if(j===n&&i<cuts.length-2)x-=1e-6;
      const y=F.f(x,p,L);
      if(Number.isFinite(y)&&Math.abs(y)<30){if(!cur){cur=[];runs.push(cur)}cur.push({x,y})}else cur=null;
    }
  }
  for(let i=0;i<runs.length-1;){
    const A=runs[i],B=runs[i+1],e=A[A.length-1],s=B[0];
    if(s.x-e.x<.001&&Math.abs(s.y-e.y)<=.2){A.push(...B);runs.splice(i+1,1)}else i++;
  }
  return runs;
}
function analyze(L,famId,p){
  const F=FAM[famId],f=x=>{const y=F.f(x,p,L);return Number.isFinite(y)&&Math.abs(y)<30?y:null};
  const runs=buildRuns(L,famId,p),issues=[],rows=[];
  const add=(x,code,msg)=>issues.push({x,code,msg});
  let cost=0;
  runs.forEach(r=>{for(let i=1;i<r.length;i++)cost+=Math.hypot(r[i].x-r[i-1].x,r[i].y-r[i-1].y)});
  cost=Math.round(cost*PRICE);
  const domTxt=F.domNote?F.domNote(p):'Revisa los parámetros: la curva se sale del mapa en esa parte.';
  /* orilla izquierda */
  const y0=f(L.xL),okL=y0!==null&&Math.abs(y0-L.yL)<=TOL;
  rows.push({label:`Orilla izquierda, x = ${fmt(L.xL)}`,ok:okL,val:`${y0===null?'no existe':fmt(y0)} / ${fmt(L.yL)}`});
  if(!runs.length)add(L.xL,'domain',`Tu función no da un puente entre x = ${fmt(L.xL)} y x = ${fmt(L.xR)}. ${domTxt}`);
  else if(runs[0][0].x>L.xL+.05)add(L.xL,'domain',`Tu función no existe entre x = ${fmt(L.xL)} y x = ${fmt(runs[0][0].x)}. ${domTxt}`);
  else if(!okL)add(L.xL,'anchorL',`En x = ${fmt(L.xL)} tu función vale ${fmt(y0)}, pero el borde de la orilla está en y = ${fmt(L.yL)}. El puente no llega a la orilla.`);
  /* huecos */
  let cont=runs.length>0;
  for(let i=0;i<runs.length-1;i++){
    const e=runs[i][runs[i].length-1],s=runs[i+1][0];cont=false;
    if(s.x-e.x<.001)add(e.x,'jump',`En x = ${fmt(e.x)} hay un salto: un tramo termina en y = ${fmt(e.y)} y el siguiente empieza en y = ${fmt(s.y)}. El camión cae por el hueco.`);
    else add(e.x,'gap',`Tu puente se interrumpe entre x = ${fmt(e.x)} y x = ${fmt(s.x)}. ${domTxt}`);
  }
  /* pilares */
  L.pts.forEach(pt=>{
    const y=f(pt.x),ok=y!==null&&Math.abs(y-pt.y)<=TOL;
    rows.push({label:`${L.stayed?'Tirante':'Pilar'}, x = ${fmt(pt.x)}`,ok,val:`${y===null?'no existe':fmt(y)} / ${fmt(pt.y)}`,pt});
    if(!ok&&y!==null)add(pt.x,'pillar',L.stayed?`En x = ${fmt(pt.x)} tu función vale ${fmt(y)} y el tirante sostiene la calzada en y = ${fmt(pt.y)}. El tirante se revienta con el peso del camión.`:`En x = ${fmt(pt.x)} tu función vale ${fmt(y)} y el pilar llega hasta y = ${fmt(pt.y)}. ${y>pt.y?'Sin apoyo, el puente se parte bajo el peso del camión.':'El pilar atraviesa la vía y el camión choca.'}`);
  });
  /* obstáculos */
  L.obs.forEach(o=>{
    const y=f(o.x),boat=o.t==='boat',ok=y!==null&&(boat?y>=o.y:y<=o.y);
    rows.push({label:boat?`Mástil del barco, x = ${fmt(o.x)}`:`Teleférico, x = ${fmt(o.x)}`,ok,val:`${y===null?'no existe':fmt(y)} ${boat?'≥':'≤'} ${fmt(o.y)}`,obs:o});
    if(!ok&&y!==null)add(o.x,boat?'boat':'cable',boat
      ?`El mástil llega hasta y = ${fmt(o.y)} y en x = ${fmt(o.x)} tu puente va en y = ${fmt(y)}. Necesitas f(${fmt(o.x)}) ≥ ${fmt(o.y)}.`
      :`La cabina del teleférico baja hasta y = ${fmt(o.y)} y en x = ${fmt(o.x)} tu puente va en y = ${fmt(y)}. Necesitas f(${fmt(o.x)}) ≤ ${fmt(o.y)}.`);
  });
  /* orilla derecha */
  const y1=f(L.xR),okR=y1!==null&&Math.abs(y1-L.yR)<=TOL;
  rows.push({label:`Orilla derecha, x = ${fmt(L.xR)}`,ok:okR,val:`${y1===null?'no existe':fmt(y1)} / ${fmt(L.yR)}`});
  const last=runs.length?runs[runs.length-1]:null;
  if(last&&last[last.length-1].x<L.xR-.05)add(last[last.length-1].x,'domain',`Tu función deja de existir o se sale del mapa después de x = ${fmt(last[last.length-1].x)}. ${domTxt}`);
  else if(last&&!okR)add(L.xR,'anchorR',`En x = ${fmt(L.xR)} tu función vale ${fmt(y1)}, pero el borde de la orilla está en y = ${fmt(L.yR)}. El camión no alcanza a llegar.`);
  /* pendiente */
  let maxS=0,mx=null;
  runs.forEach(r=>{for(let i=1;i<r.length;i++){const s=Math.abs((r[i].y-r[i-1].y)/(r[i].x-r[i-1].x));if(s>maxS){maxS=s;mx=r[i].x}}});
  rows.push({label:'Pendiente máxima',ok:maxS<=MAX_SLOPE,val:`${fmt(maxS)} ≤ ${fmt(MAX_SLOPE)}`});
  if(maxS>MAX_SLOPE){
    const fx=runs.flatMap(r=>r.slice(1).map((n,i)=>({x:n.x,s:Math.abs((n.y-r[i].y)/(n.x-r[i].x))}))).find(n=>n.s>MAX_SLOPE);
    /* Aviso: en la prueba física es Matter.js quien decide si el camión sube (tan θ ≤ μ) o patina. */
    add(fx?fx.x:mx,'slope',`Cerca de x = ${fmt(fx?fx.x:mx)} la pendiente llega a ${fmt(fx?fx.s:maxS)}. El camión solo sube con seguridad hasta ${fmt(MAX_SLOPE)}: más empinado, las llantas patinan.`);
  }
  if(runs.length>1)rows.splice(rows.length-1,0,{label:'Puente continuo',ok:cont,val:cont?'sí':'con huecos'});
  /* resonancia */
  const wind=windResponse(L,famId,p);
  if(wind){
    rows.push({label:'Resonancia con el viento',ok:wind.ok,val:`${fmt(wind.amp)} ≤ ${fmt(L.wind.limit)}`});
    if(!wind.ok)add(L.xL+(L.xR-L.xL)/4,'resonance',`La frecuencia de tu puente, b ≈ ${fmt(wind.b)}, está muy cerca de la del viento, ω ≈ ${fmt(L.wind.omega)}. La oscilación llega a ${fmt(wind.amp)} y solo se tolera hasta ${fmt(L.wind.limit)}: el puente entra en resonancia.`);
  }
  issues.sort((a,b)=>a.x-b.x);
  return{runs,issues,rows,cost,okL,okR,f,wind};
}

/* ---------- resonancia ----------
   Oscilador forzado con amortiguamiento: A = A₀ / √((1 − r²)² + (2ζr)²), con r = b / ω.
   Simplificación del juego: b, la frecuencia de la curva, hace de frecuencia natural del puente. */
function resonance(w,b){const r=b/w.omega;return w.base/Math.sqrt((1-r*r)**2+(2*w.zeta*r)**2)}
/* Busca la b con la que y ≈ A·sen(bx) + B·cos(bx) + C se ajusta mejor a la curva. */
function dominantFreq(L,famId,p){
  const F=FAM[famId],N=120,xs=[],ys=[];
  for(let i=0;i<=N;i++){const x=L.xL+(L.xR-L.xL)*i/N,y=F.f(x,p,L);if(Number.isFinite(y)&&Math.abs(y)<30){xs.push(x);ys.push(y)}}
  if(xs.length<20)return 0;
  const m=ys.reduce((u,v)=>u+v,0)/ys.length,total=ys.reduce((u,v)=>u+(v-m)**2,0);
  if(total<1e-6)return 0;
  const residual=b=>{
    let ss=0,cc=0,sc=0,s1=0,c1=0,sy=0,cy=0,y1=0;const n=xs.length;
    xs.forEach((x,i)=>{const s=Math.sin(b*x),c=Math.cos(b*x),y=ys[i]-m;ss+=s*s;cc+=c*c;sc+=s*c;s1+=s;c1+=c;sy+=s*y;cy+=c*y;y1+=y});
    const det=ss*(cc*n-c1*c1)-sc*(sc*n-c1*s1)+s1*(sc*c1-cc*s1);
    if(Math.abs(det)<1e-9)return Infinity;
    const A=(sy*(cc*n-c1*c1)-sc*(cy*n-c1*y1)+s1*(cy*c1-cc*y1))/det;
    const B=(ss*(cy*n-c1*y1)-sy*(sc*n-c1*s1)+s1*(sc*y1-cy*s1))/det;
    const C=(ss*(cc*y1-c1*cy)-sc*(sc*y1-c1*sy)+sy*(sc*c1-cc*s1))/det;
    let r=0;xs.forEach((x,i)=>{r+=(ys[i]-m-A*Math.sin(b*x)-B*Math.cos(b*x)-C)**2});
    return r;
  };
  let best=0,br=Infinity;const step=Math.PI/96;
  for(let b=Math.PI/24;b<=3.5;b+=step){const r=residual(b);if(r<br-1e-9){br=r;best=b}}
  let u=best-step,v=best+step;
  for(let i=0;i<30;i++){const c=v-.618034*(v-u),d=u+.618034*(v-u);if(residual(c)<residual(d))v=d;else u=c}
  return(u+v)/2;
}
function windResponse(L,famId,p){
  if(!L.wind)return null;
  const b=famId==='seno'?p.n*Math.PI/12:dominantFreq(L,famId,p),amp=resonance(L.wind,b);
  return{b,amp,ok:amp<=L.wind.limit};
}

/* ---------- análisis matemático para el informe ----------
   Estudia la función en el tramo del puente: dominio, rango, ceros, extremos y crecimiento. */
const rd=v=>Math.round(v*100)/100;
function mathInfo(L,famId,p){
  const F=FAM[famId],raw=x=>F.f(x,p,L),g=x=>{const y=raw(x);return Number.isFinite(y)&&Math.abs(y)<1e6?y:null};
  const a=L.xL,b=L.xR,n=Math.ceil((b-a)/.01),brk=(F.breaks?F.breaks(p,L):[]).filter(c=>c>a&&c<b);
  const xs=[];for(let i=0;i<=n;i++)xs.push(a+(b-a)*i/n);
  brk.forEach(c=>{xs.push(c-1e-7,c+1e-7)});xs.sort((u,v)=>u-v);
  /* tramos sin huecos ni saltos */
  const segs=[];let cur=null,prevX=null,prevNull=false;
  const edge=(fin,nul)=>{let u=fin,v=nul;for(let i=0;i<40;i++){const m=(u+v)/2;if(g(m)===null)v=m;else u=m}return u};
  xs.forEach(x=>{
    const y=g(x);
    if(y===null){if(cur&&prevX!==null){const e=edge(prevX,x);cur.push({x:e,y:g(e)})}cur=null;prevX=x;prevNull=true;return}
    const crossed=prevX!==null&&brk.some(c=>prevX<c&&x>c);
    const end=cur&&cur[cur.length-1];
    /* cambio brusco de signo con valores grandes: hay una asíntota vertical entre las dos muestras */
    let pole=null;
    if(end&&y*end.y<0&&Math.abs(y-end.y)>3&&Math.max(Math.abs(y),Math.abs(end.y))>20){
      let u=end.x,v=x;const su=Math.sign(end.y);
      for(let i=0;i<50;i++){const m=(u+v)/2,fm=raw(m);if(Number.isFinite(fm)&&Math.sign(fm)===su)u=m;else v=m}
      pole=(u+v)/2;cur.poleEnd=pole;
    }
    if(cur&&(crossed||pole!==null))cur=null;
    if(!cur){cur=[];if(pole!==null)cur.poleStart=pole;segs.push(cur);if(prevNull){const e=edge(x,prevX);cur.push({x:e,y:g(e)})}}
    cur.push({x,y});prevX=x;prevNull=false;
  });
  if(!segs.length)return{empty:true};
  const closedAt=x=>g(rd(x))!==null;
  /* ¿la función se dispara al acercarse a este borde abierto? */
  const blows=(x,dir)=>{const q=rd(x),A=raw(q+dir*1e-6),B=raw(q+dir*1e-9);return Number.isFinite(A)&&Number.isFinite(B)&&Math.abs(B-A)>1?Math.sign(B):0};
  /* dominio */
  const parts=[];
  segs.forEach(s=>{
    const u=s.poleStart??s[0].x,v=s.poleEnd??s[s.length-1].x,last=parts[parts.length-1];
    if(last&&s.poleStart===undefined&&u-last.v<.02&&closedAt(u)){last.v=v;last.closedV=s.poleEnd===undefined;return}
    parts.push({u,v,closedU:s.poleStart===undefined,closedV:s.poleEnd===undefined});
  });
  const domain=parts.map(q=>`${q.closedU&&closedAt(q.u)?'[':'('}${fmt(q.u)}, ${fmt(q.v)}${q.closedV&&closedAt(q.v)?']':')'}`).join(' ∪ ');
  /* monotonía, extremos y ceros por tramo */
  const inc=[],dec=[],flat=[],ext=[],zeros=[],ranges=[],asym=[];
  const golden=(u,v,sign)=>{const k=.618034;for(let i=0;i<50;i++){const c=v-k*(v-u),d=u+k*(v-u),yc=g(c),yd=g(d);if(yc===null||yd===null)break;if(sign*yc>sign*yd)v=d;else u=c}return(u+v)/2};
  segs.forEach(s=>{
    let lo=Infinity,hi=-Infinity;s.forEach(q=>{if(q.y<lo)lo=q.y;if(q.y>hi)hi=q.y});
    const u0=s[0].x,v0=s[s.length-1].x;
    let openLo=false,openHi=false;
    const mark=(d,x)=>{if(d>0)openHi=true;if(d<0)openLo=true;if(d)asym.push(rd(x))};
    if(s.poleStart!==undefined)mark(Math.sign(s[0].y),s.poleStart);else if(!closedAt(u0))mark(blows(u0,1),u0);
    if(s.poleEnd!==undefined)mark(Math.sign(s[s.length-1].y),s.poleEnd);else if(!closedAt(v0))mark(blows(v0,-1),v0);
    ranges.push({lo,hi,openLo,openHi});
    /* grupos con la misma dirección */
    const runs=[];
    for(let i=1;i<s.length;i++){
      const d=s[i].y-s[i-1].y,sg=Math.abs(d)<1e-9?0:Math.sign(d),r=runs[runs.length-1];
      if(r&&r.sg===sg)r.v=s[i].x;else runs.push({sg,u:s[i-1].x,v:s[i].x});
    }
    const clean=[];
    runs.forEach(r=>{
      const c=clean[clean.length-1];
      if(r.sg===0&&r.v-r.u<.05&&runs.length>1){if(c)c.v=r.v;return}
      if(c&&c.sg===r.sg){c.v=r.v;return}
      clean.push({...r});
    });
    for(let i=1;i<clean.length;i++){
      const A=clean[i-1],B=clean[i];
      if(A.sg&&B.sg&&A.sg!==B.sg){
        const sign=A.sg>0?1:-1,x=golden(A.v-.02,B.u+.02,sign),y=g(x);
        A.v=x;B.u=x;
        if(y===null||Math.abs(y)>1e4){mark(sign,x);ranges[ranges.length-1]={lo,hi,openLo,openHi};continue}
        ext.push({x,y,kind:sign>0?'máximo':'mínimo'});
        if(y>hi)hi=y;if(y<lo)lo=y;
        ranges[ranges.length-1]={lo,hi,openLo,openHi};
        if(Math.abs(y)<1e-6)zeros.push(x);
      }
    }
    if(clean.length){if(s.poleStart!==undefined)clean[0].u=s.poleStart;if(s.poleEnd!==undefined)clean[clean.length-1].v=s.poleEnd}
    clean.forEach(r=>{(r.sg>0?inc:r.sg<0?dec:flat).push(`(${fmt(r.u)}, ${fmt(r.v)})`)});
    /* ceros: cambio de signo y bisección */
    for(let i=0;i<s.length;i++){
      if(Math.abs(s[i].y)<1e-9)zeros.push(s[i].x);
      if(i&&s[i-1].y*s[i].y<0){let u=s[i-1].x,v=s[i].x,fu=s[i-1].y;for(let k=0;k<50;k++){const m=(u+v)/2,fm=g(m);if(fm===null)break;if(fu*fm<=0)v=m;else{u=m;fu=fm}}zeros.push((u+v)/2)}
    }
  });
  /* rango: une los intervalos que se tocan */
  ranges.sort((q,r)=>q.lo-r.lo);
  const rg=[];
  ranges.forEach(q=>{const l=rg[rg.length-1];if(l&&q.lo<=l.hi+.02){if(q.hi>l.hi){l.hi=q.hi;l.openHi=q.openHi}if(q.openLo)l.openLo=true}else rg.push({...q})});
  const range=rg.map(q=>Math.abs(q.hi-q.lo)<1e-6&&!q.openLo&&!q.openHi?`{${fmt(q.lo)}}`:`${q.openLo?'(−∞':'['+fmt(q.lo)}, ${q.openHi?'+∞)':fmt(q.hi)+']'}`).join(' ∪ ');
  const uz=[];zeros.sort((u,v)=>u-v).forEach(z=>{if(!uz.length||z-uz[uz.length-1]>.02)uz.push(z)});
  const allZero=segs.every(s=>s.every(q=>Math.abs(q.y)<1e-9));
  const list=(arr,max,sh)=>arr.length?arr.slice(0,max).map(sh).join(', ')+(arr.length>max?` y ${arr.length-max} más`:''):'ninguno';
  return{
    domain,range,
    zeros:allZero?'todo el tramo':list(uz,6,z=>`x = ${fmt(z)}`),
    extremes:list(ext,6,q=>`${q.kind} (${fmt(q.x)}, ${fmt(q.y)})`),
    inc:inc.join(' ∪ ')||'ninguno',dec:dec.join(' ∪ ')||'ninguno',flat:flat.join(' ∪ '),
    asym:asymptotes(famId,p,[...new Set(asym)]),
  };
}
function asymptotes(id,p,found){
  if(id==='racional')return`x = ${fmt(p.h)}, y = ${fmt(p.k)}`;
  if(id==='exponencial')return`y = ${fmt(p.c)}`;
  if(id==='logaritmica')return`x = ${fmt(p.h)}`;
  if(id==='texto')return found.length?found.map(x=>`x ≈ ${fmt(x)}`).join(', '):'ninguna vertical en el tramo';
  return'no tiene';
}
function analysisHtml(L,famId,p){
  const m=mathInfo(L,famId,p);
  const row=(k,v)=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`;
  const body=m.empty?`<p class="note">La función no existe en ningún punto del tramo.</p>`:`<dl>
    ${row('Dominio general',FAM[famId].dom)}${row('Dominio en el tramo',m.domain)}${row('Rango en el tramo',m.range)}
    ${row('Ceros en el tramo',m.zeros)}${row('Vértice o extremos',m.extremes)}
    ${row('Creciente en',m.inc)}${row('Decreciente en',m.dec)}${m.flat?row('Constante en',m.flat):''}${row('Asíntotas',m.asym)}</dl>`;
  return`<details class="analysis" id="analysis" ${S.analysisOpen?'open':''}><summary>Análisis matemático</summary>${body}<p class="note">Valores calculados con la función actual en el tramo [${fmt(L.xL)}, ${fmt(L.xR)}] y redondeados a dos decimales.</p></details>`;
}
function windHtml(L,an){
  const w=L.wind,r=an.wind;if(!w||!r)return'';
  const W0=320,H0=130,bMax=w.omega*3.5,yMax=.8,px=b=>b/bMax*W0,py=a=>H0-Math.min(a,yMax)/yMax*H0;
  let d='';for(let i=0;i<=160;i++){const b=bMax*i/160;d+=(i?'L':'M')+px(b).toFixed(1)+' '+py(resonance(w,b)).toFixed(1)}
  const bx=Math.min(r.b,bMax);
  return`<div class="wind ${r.ok?'':'danger'}"><strong>${r.ok?'Fuera de resonancia':'Peligro: resonancia'}</strong>
    <span>Viento: ω ≈ ${fmt(w.omega)}. Tu puente: b ≈ ${fmt(r.b)}. Oscilación: ${fmt(r.amp)} (máximo ${fmt(w.limit)}).</span>
    <svg class="plot" viewBox="0 0 ${W0} ${H0}" role="img" aria-label="Oscilación del puente según su frecuencia b. El pico está en la frecuencia del viento."><path class="pl-axis" d="M0 ${H0-1}H${W0}"/><path class="pl-limit" d="M0 ${py(w.limit)}H${W0}"/><path class="pl-curve" d="${d}"/><circle class="pl-dot" cx="${px(bx)}" cy="${py(r.amp)}" r="5"/><text class="pl-text" x="${W0-4}" y="${py(w.limit)-5}" text-anchor="end">límite</text></svg>
    <span style="font-size:.84rem;color:var(--muted)">En este juego, b hace de frecuencia natural del puente: es una simplificación del modelo.</span></div>`;
}

/* ---------- progreso ---------- */
const KEY='puentes-funciones-v1';
let P={name:'',levels:{},examBest:null,unlockAll:false,sound:true};
try{const raw=localStorage.getItem(KEY);if(raw)P={...P,...JSON.parse(raw)}}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(P))}catch(e){}};
/* Una obra se abre solo cuando todas las anteriores tienen al menos una estrella (o con el desbloqueo docente). */
const unlocked=L=>P.unlockAll||LEVELS.slice(0,L.n-1).every(A=>P.levels[A.id]&&P.levels[A.id].stars);
const stars=n=>`<span class="stars" aria-label="${n} de 3 estrellas">${'★'.repeat(n)}<i>${'★'.repeat(3-n)}</i></span>`;

/* ---------- sonido ---------- */
let AC=null;
function audio(){if(!P.sound)return null;try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();return AC}catch(e){return null}}
function tone(fr,d=.14,type='triangle',g=.07,when=0){const a=audio();if(!a)return;const o=a.createOscillator(),v=a.createGain(),t=a.currentTime+when;o.type=type;o.frequency.value=fr;v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(v).connect(a.destination);o.start(t);o.stop(t+d)}
const sfx={right(){tone(523);tone(784,.18,'triangle',.07,.1)},wrong(){tone(165,.22,'square',.04)},win(){[523,659,784,1047].forEach((f,i)=>tone(f,.22,'triangle',.08,i*.11))},
 crash(){const a=audio();if(!a)return;const n=a.sampleRate*.7,b=a.createBuffer(1,n,a.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n)**2;const s=a.createBufferSource(),fl=a.createBiquadFilter(),v=a.createGain();s.buffer=b;fl.type='lowpass';fl.frequency.value=900;v.gain.value=.3;s.connect(fl).connect(v).connect(a.destination);s.start()}};

/* ---------- estado ---------- */
const S={screen:'menu',level:null,phase:'identify',famId:null,p:{},an:null,idWrong:0,crashes:0,idDone:false,hint:false,sim:null,lastGuideFrom:'menu',demoWait:0,baseFam:null,baseP:null,analysisOpen:true};

/* ---------- lienzo ---------- */
const cv=document.createElement('canvas'),ctx=cv.getContext('2d');
cv.setAttribute('role','img');
let W=0,H=0,DPR=1,SC=1,VC=6,YB=-2.7,bg=null,bgFor=null;
const setScale=()=>{SC=Math.min(W/16.5,H/10.4);YB=-2.7-.3*Math.max(0,H/SC-10.4)};
/* ---------- coordenadas ----------
   El juego y el informe usan coordenadas matemáticas (y hacia arriba, en unidades del nivel).
   El canvas tiene la y hacia abajo y mide en píxeles. Toda conversión pasa por estas dos funciones:
     toScreen(x, y)   → píxel del canvas    (VC = x en el centro, YB = y en el borde inferior, SC = px por unidad)
     toWorld(px, py)  → punto matemático
   X, Y, IX, IY son atajos de una sola coordenada que usa el resto del dibujo. */
const toScreen=(x,y)=>({x:W/2+(x-VC)*SC,y:H-(y-YB)*SC});
const toWorld=(px,py)=>({x:(px-W/2)/SC+VC,y:(H-py)/SC+YB});
const X=x=>toScreen(x,0).x,Y=y=>toScreen(0,y).y,IX=px=>toWorld(px,0).x,IY=py=>toWorld(0,py).y;
function resize(){
  const host=cv.parentElement;if(!host)return;
  const r=host.getBoundingClientRect();if(r.width<2||r.height<2)return;
  W=r.width;H=r.height;DPR=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);
  setScale();bg=null;
}
const ro=new ResizeObserver(()=>resize());
function mountCanvas(host){if(cv.parentElement!==host){ro.disconnect();host.prepend(cv);ro.observe(host)}resize()}

function poly(g,pts,fill){g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();if(fill){g.fillStyle=fill;g.fill();g.strokeStyle=fill;g.lineWidth=.8;g.stroke()}}
function renderBg(L){
  const R=L.reg,c=document.createElement('canvas');c.width=cv.width;c.height=cv.height;
  const g=c.getContext('2d');g.scale(DPR,DPR);const rnd=rng(L.n*131+7);
  /* cielo facetado */
  const stp=Math.max(56,W/13),cols=Math.ceil(W/stp)+2,rows=Math.ceil(H/stp)+2,pt=[];
  for(let j=0;j<=rows;j++){pt[j]=[];for(let i=0;i<=cols;i++)pt[j][i]=[(i-.5)*stp+(rnd()-.5)*stp*.6,(j-.5)*stp+(rnd()-.5)*stp*.6]}
  const skyC=(y,n)=>mixHex(mixHex(R.sky[0],R.sky[1],clamp(y/(Y(WATER)||1),0,1)),'#FFFFFF',n*.1);
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const a=pt[j][i],b=pt[j][i+1],d=pt[j+1][i],e=pt[j+1][i+1];
    poly(g,[a,b,d],skyC((a[1]+b[1]+d[1])/3,rnd()));poly(g,[b,e,d],skyC((b[1]+e[1]+d[1])/3,rnd()));
  }
  /* sol */
  const sx=W*(.2+rnd()*.6),sy=H*.17,sr=Math.max(16,SC*.95),sun=[];for(let i=0;i<9;i++){const t=i/9*Math.PI*2;sun.push([sx+Math.cos(t)*sr,sy+Math.sin(t)*sr])}poly(g,sun,R.sun);
  /* montañas */
  const xmin=IX(0)-1.2,xmax=IX(W)+1.2,base=Y(WATER)+2;
  [[R.mt[0],6.5,3.5,.22],[R.mt[1],3.8,2.4,.1]].forEach(([col,hMax,gap,sh])=>{
    let x=xmin-rnd()*2,prev=[X(x),base],lastPeak=null;
    while(x<xmax+2){
      const px=x+gap*(.45+rnd()*.5),py=hMax*(.5+rnd()*.5)+WATER,vx=px+gap*(.45+rnd()*.5),vy=WATER+hMax*.18*rnd();
      const pk=[X(px),Y(py)],foot=[X(px),base],next=[X(vx),Y(vy)];
      poly(g,[prev,pk,foot],mixHex(col,'#FFFFFF',sh));
      poly(g,[pk,next,foot],mixHex(col,'#000000',sh*.5));
      poly(g,[next,[next[0],base],foot],mixHex(col,'#000000',sh*.3));
      prev=next;x=vx;lastPeak=pk;
    }
  });
  /* orillas */
  const bank=(side)=>{
    const edge=side<0?L.xL:L.xR,top=side<0?L.yL:L.yR,far=side<0?xmin-1:xmax+1,cliff=[];
    let y=top;while(y>WATER-1.4){const flare=y<WATER+1.4?(WATER+1.4-y)*.42:0;cliff.push([X(edge-side*(flare+(y===top?0:(rnd()-.55)*.38))),Y(y)]);y-=.55+rnd()*.5}
    cliff.push([X(edge-side*1.7),Y(WATER-1.5)]);
    const shape=[[X(far),Y(top)],...cliff,[X(far),Y(WATER-1.5)]];
    g.save();poly(g,shape);g.clip();
    const cell=Math.max(24,SC*.95),nx=Math.ceil(Math.abs(X(far)-X(edge)-side*0)/cell)+5,ny=Math.ceil((Y(WATER-1.5)-Y(top))/cell)+2,x0=Math.min(X(far),X(edge))-cell*2,y0=Y(top)-cell,gr=[];
    for(let j=0;j<=ny;j++){gr[j]=[];for(let i=0;i<=nx;i++)gr[j][i]=[x0+i*cell+(rnd()-.5)*cell*.7,y0+j*cell+(rnd()-.5)*cell*.7]}
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const a=gr[j][i],b=gr[j][i+1],d=gr[j+1][i],e=gr[j+1][i+1],sh=j/ny*.28;
      poly(g,[a,b,d],mixHex(R.rock[Math.floor(rnd()*5)],'#000000',sh));poly(g,[b,e,d],mixHex(R.rock[Math.floor(rnd()*5)],'#000000',sh));
    }
    g.restore();
    /* árboles */
    const trees=L.region==='paramo'?3:L.region==='selva'?7:4;
    for(let i=0;i<trees;i++){
      const tx=edge+side*(1.5+rnd()*5),s=.65+rnd()*.7,bx=X(tx),by=Y(top);
      if(bx<-20||bx>W+20)continue;
      poly(g,[[bx-2,by],[bx+2,by],[bx+2,by-.5*SC*s],[bx-2,by-.5*SC*s]],'#5A4030');
      for(let k=0;k<3;k++){const w=(.62-k*.13)*SC*s,y1=by-(.32+k*.42)*SC*s,y2=y1-.7*SC*s;poly(g,[[bx-w,y1],[bx,y2],[bx,y1]],R.tree[0]);poly(g,[[bx,y2],[bx+w,y1],[bx,y1]],R.tree[1])}
    }
    /* vía y berma */
    const xa=X(edge),xb=X(far),yT=Y(top),th=.2*SC;
    poly(g,[[xa,yT+th],[xb,yT+th],[xb,yT+th*1.8],[xa,yT+th*1.5]],R.grass);
    poly(g,[[xa,yT],[xb,yT],[xb,yT+th],[xa,yT+th]],'#3A4150');
    g.strokeStyle='#F4E7A9';g.lineWidth=Math.max(1,.035*SC);g.setLineDash([.35*SC,.35*SC]);g.beginPath();g.moveTo(xa,yT+th*.5);g.lineTo(xb,yT+th*.5);g.stroke();g.setLineDash([]);
  };
  bank(-1);bank(1);
  bg=c;bgFor=L.n+'-'+W+'-'+H;
}
function drawWater(t,front){
  const R=S.level.reg,y0=Y(WATER),pts=[];
  for(let px=0;px<=W+24;px+=24)pts.push([px,y0+Math.sin(px*.02+t*1.1)*(front?2:3)+Math.sin(px*.047-t*.8)*1.4]);
  ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();
  ctx.fillStyle=front?R.water[0]+'CC':R.water[1];ctx.fill();
  if(front){ctx.strokeStyle=R.water[2];ctx.lineWidth=1.6;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke()}
}
function tag(text,x,y,bgc,fg,alignRight){
  ctx.font=`700 ${W<520?10:12}px "Atkinson Hyperlegible",Verdana,sans-serif`;
  const m=ctx.measureText(text).width,h=W<520?15:18,pad=4;
  let bx=x-m/2-pad;if(alignRight)bx=x-m-pad*2;bx=clamp(bx,2,W-m-pad*2-2);
  const by=clamp(y-h,2,H-h-2);
  ctx.fillStyle=bgc;ctx.fillRect(bx,by,m+pad*2,h);ctx.fillStyle=fg;ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillText(text,bx+pad,by+h/2+.5);
}
function drawGrid(L){
  const ink=L.reg.ink,xa=Math.ceil(IX(0)),xb=Math.floor(IX(W)),ya=Math.ceil(IY(H)),yb=Math.floor(IY(0));
  ctx.lineWidth=1;
  for(let x=xa;x<=xb;x++){ctx.strokeStyle=ink+(x%2?'14':'26');ctx.beginPath();ctx.moveTo(X(x)+.5,0);ctx.lineTo(X(x)+.5,H);ctx.stroke()}
  for(let y=ya;y<=yb;y++){ctx.strokeStyle=ink+(y%2?'14':'26');ctx.beginPath();ctx.moveTo(0,Y(y)+.5);ctx.lineTo(W,Y(y)+.5);ctx.stroke()}
  ctx.strokeStyle=ink+'AA';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(0,Y(0));ctx.lineTo(W,Y(0));ctx.moveTo(X(0),0);ctx.lineTo(X(0),H);ctx.stroke();
  ctx.font=`700 ${W<520?9:11}px "Atkinson Hyperlegible",Verdana,sans-serif`;ctx.textAlign='center';ctx.textBaseline='top';ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.75)';ctx.fillStyle=ink;
  for(let x=xa;x<=xb;x++)if(x%2===0&&x!==0){ctx.strokeText(x,X(x),Y(0)+3);ctx.fillText(x,X(x),Y(0)+3)}
  ctx.textAlign='right';ctx.textBaseline='middle';
  for(let y=ya;y<=yb;y++)if(y%2===0&&y!==0&&y>=-2){const t=fmt(y);ctx.strokeText(t,X(0)-4,Y(y));ctx.fillText(t,X(0)-4,Y(y))}
  ctx.textAlign='left';ctx.strokeText('y',X(0)+5,12);ctx.fillText('y',X(0)+5,12);
  ctx.textAlign='right';ctx.strokeText('x',W-6,Y(0)-9);ctx.fillText('x',W-6,Y(0)-9);
}
function drawPillar(pt,ok,show){
  const hw=.2*SC,hwB=.3*SC,top=Y(pt.y),bot=Y(WATER-.8),cx=X(pt.x);
  poly(ctx,[[cx-hw,top],[cx,top],[cx,bot],[cx-hwB,bot]],'#B7B0A3');
  poly(ctx,[[cx,top],[cx+hw,top],[cx+hwB,bot],[cx,bot]],'#8D877B');
  const col=show?(ok?'#2CCB86':'#FF8F24'):'#D5CFC2';
  poly(ctx,[[cx-hw*1.5,top-.04*SC],[cx+hw*1.5,top-.04*SC],[cx+hw*1.2,top+.16*SC],[cx-hw*1.2,top+.16*SC]],col);
}
function drawTowers(L){
  const top=Math.max(L.yL,L.yR)+1.1,hw=.16*SC;
  [[L.xL,L.yL],[L.xR,L.yR]].forEach(([x,y])=>{
    const cx=X(x);
    ctx.strokeStyle='#232B38';ctx.lineWidth=Math.max(1,.035*SC);ctx.beginPath();
    L.pts.filter(pt=>Math.abs(pt.x-x)<=(L.xR-L.xL)/2).forEach(pt=>{ctx.moveTo(cx,Y(top));ctx.lineTo(X(pt.x),Y(pt.y))});ctx.stroke();
    poly(ctx,[[cx-hw,Y(top)],[cx,Y(top)],[cx,Y(y)],[cx-hw*1.4,Y(y)]],'#B7B0A3');
    poly(ctx,[[cx,Y(top)],[cx+hw,Y(top)],[cx+hw*1.4,Y(y)],[cx,Y(y)]],'#8D877B');
  });
}
function drawWind(t){
  ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=Math.max(1.2,.04*SC);ctx.lineCap='round';
  for(let i=0;i<12;i++){
    const len=(.9+(i%3)*.5)*SC,sp=70+(i%4)*28,x=((t*sp+i*137)%(W+len*2))-len,y=H*(.08+.055*i)+Math.sin(t*1.4+i)*5;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+len,y);ctx.stroke();
  }
}
function drawBoat(o,t){
  const sway=REDUCED?0:Math.sin(t*1.1+o.x)*.05,cx=X(o.x),wy=Y(WATER);
  ctx.save();ctx.translate(cx,wy);ctx.rotate(sway*.5);
  const u=SC,mh=(o.y-WATER)*u;
  poly(ctx,[[-.9*u,-.34*u],[.9*u,-.34*u],[.62*u,.12*u],[-.62*u,.12*u]],'#7A2F2F');
  poly(ctx,[[-.9*u,-.34*u],[.9*u,-.34*u],[.85*u,-.26*u],[-.85*u,-.26*u]],'#F7F1E3');
  poly(ctx,[[-.03*u,-mh],[.03*u,-mh],[.03*u,-.3*u],[-.03*u,-.3*u]],'#3A2B22');
  const sailTop=Math.min(mh-.12*u,mh);
  poly(ctx,[[.05*u,-sailTop],[.05*u,-.45*u],[.78*u,-.45*u]],'#FDF8EC');
  poly(ctx,[[-.05*u,-sailTop*.9],[-.05*u,-.45*u],[-.55*u,-.45*u]],'#F2E4C8');
  ctx.restore();
}
function drawCable(o,t){
  const R=S.level.reg,cy=Y(o.y+1.15);
  ctx.strokeStyle=R.ink;ctx.lineWidth=Math.max(1.5,.04*SC);ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(W,cy+6);ctx.stroke();
  const cx=X(o.x)+(REDUCED?0:Math.sin(t*.6)*.05*SC),u=SC,top=Y(o.y+.75),bot=Y(o.y),lineY=cy+6*(cx/W);
  ctx.strokeStyle=R.ink;ctx.beginPath();ctx.moveTo(cx,lineY);ctx.lineTo(cx,top);ctx.stroke();
  poly(ctx,[[cx-.5*u,top],[cx+.5*u,top],[cx+.55*u,bot],[cx-.55*u,bot]],'#E04F3C');
  poly(ctx,[[cx-.38*u,top+.1*u],[cx+.38*u,top+.1*u],[cx+.4*u,top+.36*u],[cx-.4*u,top+.36*u]],'#D6F0F4');
}
function drawTruck(x,y,ang,spin){
  ctx.save();ctx.translate(X(x),Y(y));ctx.rotate(-ang);ctx.scale(SC,-SC);
  const P2=(pts,c)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=c;ctx.fill()};
  P2([[-.74,.16],[.7,.16],[.7,.3],[-.74,.3]],'#232B38');
  P2([[-.74,.28],[.12,.28],[.12,.86],[-.74,.86]],'#FF8F24');
  P2([[-.74,.86],[.12,.86],[.12,.68],[-.74,.56]],'#FFA94F');
  P2([[.16,.28],[.74,.28],[.74,.5],[.5,.74],[.16,.74]],'#14426E');
  P2([[.26,.5],[.68,.5],[.48,.68],[.26,.68]],'#BCE9F4');
  for(const wx of[-.46,.46]){
    ctx.save();ctx.translate(wx,.14);ctx.rotate(-spin);
    ctx.beginPath();for(let i=0;i<8;i++){const t=i/8*Math.PI*2;i?ctx.lineTo(Math.cos(t)*.15,Math.sin(t)*.15):ctx.moveTo(.15,0)}ctx.closePath();ctx.fillStyle='#10151D';ctx.fill();
    ctx.fillStyle='#D6DCE4';ctx.fillRect(-.05,-.05,.1,.1);ctx.restore();
  }
  ctx.restore();
}

/* puente */
const stressCol=s=>s<.55?mix('#3BD77E','#FFD23F',s/.55):mix('#FFD23F','#F0433A',(s-.55)/.45);
function supports(an,L){const a=[];if(an.okL)a.push(L.xL);if(an.okR)a.push(L.xR);an.rows.forEach(r=>{if(r.pt&&r.ok)a.push(r.pt.x)});return a}
function supFactor(x,sup){let d=9;sup.forEach(s=>{d=Math.min(d,Math.abs(x-s))});return clamp(d/3,.12,1.5)}
function drawDeck(runs,o={}){
  const u=SC;
  runs.forEach(r=>{
    const nd=r.map(n=>({x:n.x,y:n.y+(o.sag?o.sag(n.x):0)}));
    /* cercha */
    const step=Math.max(4,Math.round(.55/.1)),low=[];
    for(let i=0;i<nd.length;i+=step){
      const a=nd[Math.max(0,i-1)],b=nd[Math.min(nd.length-1,i+1)];
      let nx=-(b.y-a.y),ny=b.x-a.x;const l=Math.hypot(nx,ny)||1;nx/=l;ny/=l;
      low.push({tx:X(nd[i].x),ty:Y(nd[i].y),bx:X(nd[i].x-nx*.34),by:Y(nd[i].y-ny*.34)});
    }
    ctx.strokeStyle=o.ghost?'rgba(255,255,255,.5)':'#7C5A3C';ctx.lineWidth=Math.max(1.2,.05*u);ctx.lineCap='round';
    ctx.beginPath();
    low.forEach((p,i)=>{ctx.moveTo(p.tx,p.ty);ctx.lineTo(p.bx,p.by);if(i<low.length-1){ctx.moveTo(p.bx,p.by);ctx.lineTo(low[i+1].tx,low[i+1].ty);ctx.moveTo(p.bx,p.by);ctx.lineTo(low[i+1].bx,low[i+1].by)}});
    ctx.stroke();
    /* calzada */
    ctx.lineJoin='round';ctx.lineWidth=Math.max(4,.2*u);
    if(o.stress){
      for(let i=1;i<nd.length;i++){ctx.strokeStyle=stressCol(o.stress(nd[i].x));ctx.beginPath();ctx.moveTo(X(nd[i-1].x),Y(nd[i-1].y));ctx.lineTo(X(nd[i].x),Y(nd[i].y));ctx.stroke()}
    }else{
      ctx.strokeStyle='#3A4150';ctx.beginPath();nd.forEach((n,i)=>i?ctx.lineTo(X(n.x),Y(n.y)):ctx.moveTo(X(n.x),Y(n.y)));ctx.stroke();
      ctx.strokeStyle='#FFCB52';ctx.lineWidth=Math.max(1.6,.05*u);ctx.beginPath();nd.forEach((n,i)=>i?ctx.lineTo(X(n.x),Y(n.y)):ctx.moveTo(X(n.x),Y(n.y)));ctx.stroke();
    }
  });
}
function drawPlan(L){
  const runs=buildRuns(L,L.fam,L.sol);
  ctx.setLineDash([.32*SC,.2*SC]);ctx.lineWidth=Math.max(3,.1*SC);ctx.strokeStyle='#FFFFFF';ctx.lineCap='butt';
  ctx.shadowColor=L.reg.ink;ctx.shadowBlur=4;
  runs.forEach(r=>{ctx.beginPath();r.forEach((n,i)=>i?ctx.lineTo(X(n.x),Y(n.y)):ctx.moveTo(X(n.x),Y(n.y)));ctx.stroke()});
  ctx.setLineDash([]);ctx.shadowBlur=0;
}
function guides(){
  const F=S.famId,p=S.p,ink='#D62839';
  ctx.setLineDash([6,5]);ctx.lineWidth=1.8;ctx.strokeStyle=ink;
  const vl=x=>{ctx.beginPath();ctx.moveTo(X(x),0);ctx.lineTo(X(x),H);ctx.stroke()};
  const hl=y=>{ctx.beginPath();ctx.moveTo(0,Y(y));ctx.lineTo(W,Y(y));ctx.stroke()};
  if(F==='racional'){vl(p.h);hl(p.k)}
  if(F==='logaritmica')vl(p.h);
  if(F==='exponencial')hl(p.c);
  if(F==='seno'){ctx.strokeStyle='rgba(16,42,71,.65)';ctx.beginPath();ctx.moveTo(0,Y(p.k));ctx.lineTo(W,Y(p.k));ctx.stroke()}
  ctx.setLineDash([]);
}
function guideTags(){
  const F=S.famId,p=S.p,ink='#D62839';
  if(F==='racional'||F==='logaritmica')tag(`asíntota x = ${fmt(p.h)}`,X(p.h),20,ink,'#FFFFFF');
  if(F==='racional')tag(`asíntota y = ${fmt(p.k)}`,W-60,Y(p.k)-3,ink,'#FFFFFF');
  if(F==='exponencial')tag(`asíntota y = ${fmt(p.c)}`,W-60,Y(p.c)-3,ink,'#FFFFFF');
}
function handlePos(){
  if(!S.famId)return null;
  const F=FAM[S.famId],h=F.handle,L=S.level;if(!h)return null;
  const hx=h.x?S.p[h.x]+(h.dx||0):h.fix==='mid'?(L.xL+L.xR)/2:h.fix==='right'?L.xR+1.4:h.fix;
  return{x:hx,y:S.p[h.y]+(h.dy?h.dy(S.p):0)};
}

/* simulación */
function newSim(){const an=S.an,L=S.level;return{t:0,tx:L.xL-3.2,state:'run',issue:an.issues[0]||null,pieces:[],parts:[],body:null,sup:supports(an,L),spin:0,wobT:0,reported:false,flag:0}}
const ground=(x,s)=>{const L=S.level;if(x<=L.xL)return L.yL;if(x>=L.xR)return L.yR;const y=S.an.f(x);return(y===null?L.yR:y)+sag(x,s)};
function load(x,s){return Math.exp(-(((x-s.tx)/1.5)**2))}
function sag(x,s){const L=S.level;if(x<=L.xL||x>=L.xR)return 0;const onDeck=s.tx>L.xL-1&&s.tx<L.xR+1;const f=supFactor(x,s.sup);let v=onDeck?-.15*load(x,s)*f:0;if(s.wobT&&!REDUCED){const d=s.t-s.wobT;v+=-.07*f*Math.exp(-d*1.6)*Math.sin(d*9)}
  const wd=S.an&&S.an.wind;
  if(wd&&!REDUCED){const grow=wd.ok?1:clamp(.25+s.t*.22,0,1.3);v+=wd.amp*grow*Math.sin(L.wind.mode*Math.PI*(x-L.xL)/(L.xR-L.xL))*Math.sin(s.t*5)}
  return v}
function stress(x,s){const f=supFactor(x,s.sup);return clamp(.12+f*.3+load(x,s)*f*.5,0,1)}
function splash(x,n=22){if(REDUCED)n=8;const c=S.level.reg.water[2];for(let i=0;i<n;i++)S.sim.parts.push({x:x+(Math.random()-.5)*.6,y:WATER+.05,vx:(Math.random()-.5)*3.2,vy:1.5+Math.random()*3.6,g:9,life:.9+Math.random()*.5,c,r:2+Math.random()*3})}
function crash(s){
  const L=S.level;s.state='crash';s.crashT=s.t;s.wobT=0;S.crashes++;sfx.crash();
  const ix=s.issue.x;
  S.an.runs.forEach(r=>{
    for(let i=0;i<r.length-1;i+=6){
      const seg=r.slice(i,i+7);const cx=seg.reduce((a,n)=>a+n.x,0)/seg.length,cy=seg.reduce((a,n)=>a+n.y,0)/seg.length;
      const keep=s.sup.some(q=>Math.abs(cx-q)<.45);
      s.pieces.push({pts:seg.map(n=>[n.x-cx,n.y-cy]),x:cx,y:cy,vx:(Math.random()-.5)*.8,vy:0,a:0,w:keep?0:(Math.random()-.5)*2.2,delay:Math.abs(cx-ix)*.13+Math.random()*.08,keep,splashed:false});
    }
  });
  const y=ground(s.tx,s),ang=Math.atan2(ground(s.tx+.5,s)-ground(s.tx-.5,s),1);
  s.body={x:s.tx,y,a:ang,vx:1.9,vy:.5,w:-1.3,splashed:false};
}
function stepSim(dt){
  const s=S.sim;if(!s)return;const L=S.level;s.t+=dt;
  if(s.state==='run'){
    const m=Math.abs(ground(s.tx+.5,s)-ground(s.tx-.5,s));
    const v=2.7*(1-.32*Math.min(m/2,1));s.tx+=v*dt;s.spin+=v*dt/.15;
    if(s.issue&&s.tx+.55>=s.issue.x)crash(s);
    else if(s.tx>L.xR&&!s.wobT){s.wobT=s.t}
    /* La demo del menú también usa esta simulación: solo una obra jugada da estrellas, sonido y panel. */
    if(s.state==='run'&&s.tx>L.xR+1.35){s.state='win';s.winT=s.t;if(S.screen==='game')onWin()}
  }else if(s.state==='crash'){
    const T=s.t-s.crashT;
    s.pieces.forEach(q=>{if(q.keep||T<q.delay)return;q.vy-=9*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.a+=q.w*dt;
      if(q.y<WATER&&!q.splashed){q.splashed=true;splash(q.x,6);q.vy*=.25;q.vx*=.3;q.w*=.3}
      if(q.y<WATER)q.vy=Math.max(q.vy,-1)});
    const b=s.body;if(b){b.vy-=9*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.a+=b.w*dt;
      if(b.y<WATER&&!b.splashed){b.splashed=true;splash(b.x,28);b.vy*=.2;b.vx*=.2;b.w*=.2}
      if(b.y<WATER)b.vy=Math.max(b.vy,-.8)}
    if(!s.reported&&T>2){s.reported=true;if(S.screen==='game')onFail()}
  }else if(s.state==='win'){s.flag=Math.min(1,s.flag+dt*1.2)}
  s.parts.forEach(p=>{p.vy-=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt});
  s.parts=s.parts.filter(p=>p.life>0);
}
function confetti(){if(REDUCED)return;const L=S.level,cs=['#FF8F24','#FFCB52','#4CE0A4','#86D9FF','#FFA6C9'];for(let i=0;i<70;i++)S.sim.parts.push({x:L.xR+1.5+(Math.random()-.5)*6,y:L.yR+3+Math.random()*3,vx:(Math.random()-.5)*2.2,vy:Math.random()*1.5,g:1.8,life:2.2+Math.random()*1.5,c:pick(cs),r:3+Math.random()*3,tri:1})}

/* dibujo principal (canvas 2D: menú, Reconoce y Construye).
   No se llama draw: p5 arranca en «modo global» si encuentra una función global con ese nombre. */
function dibujarEscena(t){
  const L=S.level;if(!L||!W)return;
  VC=(L.xL+L.xR)/2;
  const key=L.n+'-'+W+'-'+H;if(!bg||bgFor!==key){setScale();renderBg(L)}
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.drawImage(bg,0,0,W,H);
  drawWater(t,false);
  const menu=S.screen==='menu',building=!menu&&S.phase==='build',ident=!menu&&S.phase==='identify',sim=S.sim;
  if(building||ident)drawGrid(L);
  L.obs.forEach(o=>{if(o.t==='boat')drawBoat(o,t)});
  /* pilares */
  if(L.stayed)drawTowers(L);
  else L.pts.forEach(pt=>{const r=S.an?S.an.rows.find(x=>x.pt===pt):null;drawPillar(pt,r&&r.ok,building)});
  if(building)guides();
  L.obs.forEach(o=>{if(o.t==='cable')drawCable(o,t)});
  if(ident&&L.rep==='graph')drawPlan(L);
  if(building&&S.an)drawDeck(S.an.runs);
  if(sim&&S.an){
    if(sim.state==='crash'){
      ctx.lineCap='round';ctx.lineJoin='round';
      sim.pieces.forEach(q=>{ctx.save();ctx.translate(X(q.x),Y(q.y));ctx.rotate(-q.a);ctx.strokeStyle=q.keep?'#7C5A3C':'#E8574B';ctx.lineWidth=Math.max(4,.18*SC);ctx.beginPath();q.pts.forEach((n,i)=>i?ctx.lineTo(n[0]*SC,-n[1]*SC):ctx.moveTo(n[0]*SC,-n[1]*SC));ctx.stroke();ctx.restore()});
      if(sim.body)drawTruck(sim.body.x,sim.body.y,sim.body.a,sim.spin);
    }else{
      drawDeck(S.an.runs,{sag:x=>sag(x,sim),stress:x=>stress(x,sim)});
      const a=ground(sim.tx-.46,sim),b=ground(sim.tx+.46,sim);
      drawTruck(sim.tx,(a+b)/2,Math.atan2(b-a,.92),sim.spin);
    }
    if(sim.flag>0){
      const fx=X(L.xR+.45),fy=Y(L.yR);ctx.fillStyle='#232B38';ctx.fillRect(fx-1.5,fy-1.8*SC,3,1.8*SC);
      const up=(1.8-.5)*SC*sim.flag;poly(ctx,[[fx+1,fy-up-.5*SC],[fx+.9*SC,fy-up-.25*SC],[fx+1,fy-up]],'#FF8F24');
    }
  }
  drawWater(t,true);
  if(L.wind&&!menu)drawWind(REDUCED?0:t);
  if(sim)sim.parts.forEach(p=>{ctx.fillStyle=p.c;if(p.tri){const a=p.life*5,r=p.r;poly(ctx,[[X(p.x)+Math.cos(a)*r,Y(p.y)+Math.sin(a)*r],[X(p.x)+Math.cos(a+2.1)*r,Y(p.y)+Math.sin(a+2.1)*r],[X(p.x)+Math.cos(a+4.2)*r,Y(p.y)+Math.sin(a+4.2)*r]],p.c)}else{ctx.globalAlpha=clamp(p.life,0,1);ctx.beginPath();ctx.arc(X(p.x),Y(p.y),p.r,0,7);ctx.fill();ctx.globalAlpha=1}});
  /* etiquetas */
  if(building||ident){
    const ink=L.reg.ink,show=building;
    const anch=(x,y,ok)=>{ctx.beginPath();ctx.arc(X(x),Y(y),Math.max(5,.14*SC),0,7);ctx.fillStyle=show?(ok?'#2CCB86':'#FF8F24'):'#FFFFFF';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=ink;ctx.stroke();tag(`(${fmt(x)}, ${fmt(y)})`,X(x),Y(y)-Math.max(8,.28*SC),ink,'#FFFFFF')};
    if(S.an){anch(L.xL,L.yL,S.an.okL);anch(L.xR,L.yR,S.an.okR)}else{anch(L.xL,L.yL,false);anch(L.xR,L.yR,false)}
    L.pts.forEach(pt=>tag(`(${fmt(pt.x)}, ${fmt(pt.y)})`,X(pt.x),Y(pt.y)+Math.max(20,.72*SC),ink,'#FFFFFF'));
    L.obs.forEach(o=>{const boat=o.t==='boat';tag(boat?`y ≥ ${fmt(o.y)}`:`y ≤ ${fmt(o.y)}`,X(o.x)+(boat?-.1*SC:0),Y(o.y)+(boat?-5:18),'#D62839','#FFFFFF')});
    if(ident&&L.rep==='graph')tag('PLANO',X((L.xL+L.xR)/2),24,'#FF8F24','#241200');
  }
  if(building){
    guideTags();
    const h=handlePos();
    if(h){const hx=X(h.x),hy=Y(h.y);ctx.beginPath();ctx.arc(hx,hy,Math.max(9,.3*SC),0,7);ctx.fillStyle='#FFFFFF';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#D62839';ctx.stroke();
      ctx.strokeStyle='#D62839';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hx-5,hy);ctx.lineTo(hx+5,hy);ctx.moveTo(hx,hy-5);ctx.lineTo(hx,hy+5);ctx.stroke()}
  }
}
let last=0,hudT=0;
function loop(ts){
  requestAnimationFrame(loop);
  const t=ts/1000,dt=Math.min(.05,t-last);last=t;
  if(document.hidden)return;
  if(S.screen!=='menu'&&S.screen!=='game')return;
  if(!cv.parentElement)return;
  /* En el paso Prueba, p5 dibuja y Matter simula (ver «prueba física» más abajo); aquí solo se actualiza el HUD. */
  const phys=S.sim&&S.sim.phys;
  if(S.sim&&!phys)stepSim(dt);
  if(S.screen==='menu'&&S.sim&&S.sim.state==='win'){S.demoWait+=dt;if(S.demoWait>2.2){S.demoWait=0;S.sim=newSim()}}
  if(!phys)try{dibujarEscena(t)}catch(e){console.error(e)}
  if(S.screen==='game'&&S.sim&&ts-hudT>120){hudT=ts;updateHud()}
}
function updateHud(){
  const s=S.sim,hud=$('#hud'),L=S.level;if(!s||s.state!=='run'){hud.hidden=true;return}
  const on=s.tx>=L.xL&&s.tx<=L.xR;hud.hidden=!on;if(!on)return;
  const y=S.an.f(s.tx),y2=S.an.f(s.tx+.02),y1=S.an.f(s.tx-.02);
  hud.textContent=`x = ${fmt(s.tx)} · f(x) = ${y===null?'—':fmt(y)} · pendiente = ${y1!==null&&y2!==null?fmt((y2-y1)/.04):'—'}${s.slip?' · ¡patina!':''}`;
}

/* arrastre del punto de control */
let dragging=false;
cv.addEventListener('pointerdown',e=>{
  if(S.screen!=='game'||S.phase!=='build')return;
  const h=handlePos();if(!h)return;const r=cv.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;
  if(Math.hypot(px-X(h.x),py-Y(h.y))<30){dragging=true;cv.setPointerCapture(e.pointerId);e.preventDefault()}
});
cv.addEventListener('pointermove',e=>{
  const r=cv.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;
  if(!dragging){if(S.screen==='game'&&S.phase==='build'){const h=handlePos();cv.style.cursor=h&&Math.hypot(px-X(h.x),py-Y(h.y))<30?'grab':'default'}return}
  const F=FAM[S.famId],H0=F.handle;
  const defOf=id=>F.params.find(q=>q.id===id);
  if(H0.x){const d=defOf(H0.x);setParam(H0.x,IX(px)-(H0.dx||0),d)}
  const d=defOf(H0.y);setParam(H0.y,IY(py)-(H0.dy?H0.dy(S.p):0),d);
  syncSliders();updateBuild();
});
const endDrag=()=>{dragging=false};cv.addEventListener('pointerup',endDrag);cv.addEventListener('pointercancel',endDrag);

/* ---------- prueba física: Matter.js simula, p5.js dibuja ----------
   Flujo del paso «Prueba»:
     Entrada UI (deslizadores o fórmula) → Math.js calcula f(x) → p5.js crea la escena y en cada cuadro
     avanza Matter.js (Engine.update) y dibuja → validación: el camión llega a la orilla B, cae o se atasca.
   Mundo físico: 1 unidad del nivel = K = 100/3 px y la y hacia abajo, como espera Matter.
     toPhys(x, y)    → punto del mundo físico (px)      x_px = X0 + (x − xL)·K,  y_px = −y·K
     fromPhys(px, py) → punto matemático
   En el Arco del río (x de 0 a 12) esto da justo el tramo [200, 600] px del caso de estudio. */
const PHYS={
  K:100/3,X0:200,
  DX:.3,          /* Δx entre puntos del tablero: 0.3 unidades = 10 px */
  DECK:.24,       /* grosor del tablero */
  TRAC:2.5,       /* coeficiente de adherencia de las llantas (μ): sube mientras tan θ ≤ μ. Ver nota del caso de estudio */
  SPEED:2.7,      /* velocidad de crucero del camión, en unidades por segundo */
  STUCK:3,        /* segundos sin avanzar para declararlo atascado */
  STEP:1000/120,  /* paso fijo de Engine.update, en ms */
  GRAV:.0006,     /* escala de la gravedad de Matter */
};
/* Fallas estructurales que ya detecta analyze(): cuando el camión llega ahí, el tablero se suelta y cae. */
const COLAPSO=new Set(['pillar','boat','cable','anchorL','anchorR','resonance']);
const toPhys=(x,y,L=S.level)=>({x:PHYS.X0+(x-L.xL)*PHYS.K,y:-y*PHYS.K});
const fromPhys=(px,py,L=S.level)=>({x:L.xL+(px-PHYS.X0)/PHYS.K,y:-py/PHYS.K});

/* Fase 2: evalúa f(x) a lo largo del abismo con paso Δx, tramo por tramo (los huecos y saltos quedan abiertos). */
function puntosPuente(an){
  return an.runs.map(r=>{
    const a=r[0].x,b=r[r.length-1].x,n=Math.max(1,Math.round((b-a)/PHYS.DX)),pts=[];
    for(let i=0;i<=n;i++){const x=a+(b-a)*i/n,y=an.f(x);if(y!==null)pts.push({x,y})}
    return pts;
  }).filter(p=>p.length>1);
}
/* Fase 1: orillas A y B como cuerpos estáticos. */
function crearOrillas(L){
  const {Bodies}=Matter,K=PHYS.K,ancho=14,fondo=WATER-4;
  return[[L.xL-ancho,L.xL,L.yL,'orilla A'],[L.xR,L.xR+ancho,L.yR,'orilla B']].map(([a,b,top,label])=>{
    const c=toPhys((a+b)/2,(top+fondo)/2,L);
    return Bodies.rectangle(c.x,c.y,(b-a)*K,(top-fondo)*K,{isStatic:true,friction:1,frictionStatic:1,label});
  });
}
/* Fase 3: un rectángulo estático y rotado por cada par de puntos; su cara superior queda sobre la curva. */
function crearTablero(tramos,L){
  const {Bodies}=Matter,T=PHYS.DECK*PHYS.K,out=[];
  tramos.forEach(pts=>{for(let i=1;i<pts.length;i++){
    const A=toPhys(pts[i-1].x,pts[i-1].y,L),B=toPhys(pts[i].x,pts[i].y,L);
    const dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len; /* normal hacia abajo de la vía */
    const b=Bodies.rectangle((A.x+B.x)/2+nx*T/2,(A.y+B.y)/2+ny*T/2,len+2,T,{isStatic:true,angle:Math.atan2(dy,dx),friction:1,frictionStatic:1,restitution:0,label:'tablero'});
    b.xm=(pts[i-1].x+pts[i].x)/2;out.push(b);
  }});
  return out;
}
/* Fase 4: chasis y dos ruedas unidas por Constraint. Las tres piezas están en el mismo grupo negativo,
   así que no chocan entre sí. El chasis físico es bajo y corto para que el centro de masa quede cerca del eje;
   la cabina se dibuja encima, pero no tiene masa. */
function crearVehiculo(L){
  const {Bodies,Body,Constraint}=Matter,K=PHYS.K,r=.18*K,wb=.46*K,group=Body.nextGroup(true);
  const p=toPhys(L.xL-3.2,L.yL+.18+.02,L);
  /* mask 0: el chasis no toca el terreno (solo las ruedas), como un camión de chasis alto que no se «encalla» en las crestas */
  const chassis=Bodies.rectangle(p.x,p.y,1.04*K,.16*K,{collisionFilter:{group,mask:0},density:.004,friction:.2,label:'chasis'});
  const wheels=[-1,1].map(s=>Bodies.circle(p.x+s*wb,p.y,r,{collisionFilter:{group},density:.002,friction:1,frictionStatic:2,restitution:0,label:'rueda'}));
  const axles=wheels.map((w,i)=>Constraint.create({bodyA:chassis,pointA:{x:(i?1:-1)*wb,y:0},bodyB:w,pointB:{x:0,y:0},length:0,stiffness:.6,damping:.15}));
  return{chassis,wheels,axles,r};
}
function crearSimFisica(L,an){
  const {Engine,Composite}=Matter;
  const engine=Engine.create({gravity:{x:0,y:1,scale:PHYS.GRAV},positionIterations:10,velocityIterations:10});
  const banks=crearOrillas(L),deckPts=puntosPuente(an),deck=crearTablero(deckPts,L),car=crearVehiculo(L);
  Composite.add(engine.world,[...banks,...deck,car.chassis,...car.wheels,...car.axles]);
  const sim={phys:true,engine,L,an,banks,deck,deckPts,car,t:0,acc:0,tx:L.xL-3.2,ty:L.yL,ang:0,state:'run',issue:null,
    collapse:an.issues.find(i=>COLAPSO.has(i.code))||null,sup:supports(an,L),best:-Infinity,bestT:0,flag:0,parts:[],reported:false,wobT:0,
    alChocar:()=>{},alGanar:()=>{},alPerder:()=>{}};
  return sim;
}
/* Pendiente más empinada de subida cerca de x (para explicar por qué se atascó). */
function pendienteCerca(an,x,L){
  let s=0,at=x;for(let u=Math.max(L.xL,x-.6);u<=Math.min(L.xR-.05,x+1.6);u+=.05){const a=an.f(u),b=an.f(u+.05);if(a!==null&&b!==null){const m=(b-a)/.05;if(m>s){s=m;at=u}}}
  return{s,at};
}
function derrumbe(sim,issue){
  sim.state='crash';sim.crashT=sim.t;sim.issue=issue;
  sim.deck.forEach(b=>{if(!sim.sup.some(q=>Math.abs(b.xm-q)<.45))b.releaseAt=sim.t+Math.abs(b.xm-issue.x)*.13+Math.random()*.08});
  sim.alChocar();
}
/* Fase 5: derrota física (cae al abismo, se atasca o se voltea). Si analyze() ya conocía la causa, se usa su explicación. */
function falloFisico(sim,kind){
  const x=sim.tx,an=sim.an,near=an.issues.find(i=>i.code!=='slope'&&Math.abs(i.x-x)<2.5);
  let msg;
  if(kind==='fall')msg=`El camión cayó al abismo cerca de x = ${fmt(x)}. Revisa que el puente sea continuo y llegue a las dos orillas.`;
  else{
    const {s,at}=pendienteCerca(an,x,sim.L),deg=Math.atan(s)*180/Math.PI;
    msg=kind==='flip'
      ?`El camión se volcó cerca de x = ${fmt(x)}: la pendiente llega a ${fmt(s)} (${Math.round(deg)}°) y cambia demasiado rápido.`
      :s>=PHYS.TRAC*.85
        ?`El camión se quedó atascado cerca de x = ${fmt(at)}: la pendiente llega a ${fmt(s)} (${Math.round(deg)}°). Para subir sin patinar se necesita una adherencia μ ≥ tan θ = ${fmt(s)} y las llantas tienen μ = ${fmt(PHYS.TRAC)}. Suaviza la curva.`
        :`El camión se quedó atascado cerca de x = ${fmt(x)} y no logró avanzar en ${PHYS.STUCK} segundos. Revisa la forma del puente en esa zona.`;
  }
  sim.issue=near&&(kind==='fall'||['gap','domain','jump'].includes(near.code))?near:{x,code:kind,msg};
  sim.state='crash';sim.crashT=sim.t;sim.alChocar();
}
function subpasoFisica(sim){
  const {Engine,Body,Composite}=Matter,L=sim.L,c=sim.car,h=PHYS.STEP;
  /* Adherencia (ley de Coulomb): una rueda motriz sube sin patinar mientras tan θ ≤ μ.
     La fricción de Matter es aproximada, así que el límite se aplica aquí: si la pendiente lo supera,
     las llantas pierden agarre, giran en falso y el camión resbala hacia atrás. */
  sim.slip=sim.state==='run'&&Math.tan(clamp(sim.ang,-1.5,1.5))>PHYS.TRAC;
  c.wheels.forEach(w=>{w.friction=sim.slip?.02:1});
  /* tracción: velocidad angular de las ruedas (rad por cada 1000/60 ms en Matter 0.19) */
  if(sim.state==='run'){const v=PHYS.SPEED*PHYS.K/60*Math.min(1,sim.t/.6);c.wheels.forEach(w=>Body.setAngularVelocity(w,v/c.r*(sim.slip?2.5:1)))}
  else if(sim.state==='win')c.wheels.forEach(w=>Body.setAngularVelocity(w,w.angularVelocity*.92));
  Engine.update(sim.engine,h);sim.t+=h/1000;
  const p=fromPhys(c.chassis.position.x,c.chassis.position.y,L);sim.tx=p.x;sim.ty=p.y;sim.ang=-c.chassis.angle;
  /* tablero que se suelta tras una falla estructural */
  sim.deck.forEach(b=>{if(b.releaseAt!==undefined&&sim.t>=b.releaseAt){b.releaseAt=undefined;b.loose=true;Body.setStatic(b,false);Body.setAngularVelocity(b,(Math.random()-.5)*.06)}});
  /* agua: salpica al entrar y frena lo que se hunde */
  [c.chassis,...sim.deck.filter(b=>b.loose)].forEach(b=>{
    const y=fromPhys(0,b.position.y,L).y;if(y>=WATER)return;
    if(!b.wet){b.wet=true;if(sim===S.sim)splash(fromPhys(b.position.x,0,L).x,b===c.chassis?28:6)}
    Body.setVelocity(b,{x:b.velocity.x*.9,y:b.velocity.y*.9});
    if(y<WATER-6)Composite.remove(sim.engine.world,b);
  });
  if(sim.state==='run'){
    if(sim.collapse&&sim.tx+.55>=sim.collapse.x)derrumbe(sim,sim.collapse);
    else if(sim.tx>L.xR+1.35){sim.state='win';sim.winT=sim.t;sim.alGanar()}
    else if(sim.ty<WATER)falloFisico(sim,'fall');
    else if(Math.abs(Math.atan2(Math.sin(sim.ang),Math.cos(sim.ang)))>1.9)falloFisico(sim,'flip');
    else if(sim.tx>sim.best+.1){sim.best=sim.tx;sim.bestT=sim.t}
    else if(sim.t-sim.bestT>PHYS.STUCK)falloFisico(sim,'stuck');
  }else if(sim.state==='crash'&&!sim.reported&&sim.t-sim.crashT>2.2){sim.reported=true;sim.alPerder()}
}
function pasoFisica(sim,dt){
  sim.acc+=Math.min(dt,.05)*1000;
  let n=0;while(sim.acc>=PHYS.STEP&&n<8){sim.acc-=PHYS.STEP;subpasoFisica(sim);n++}
  if(sim.state==='win')sim.flag=Math.min(1,sim.flag+dt*1.2);
  sim.parts.forEach(p=>{p.vy-=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt});
  sim.parts=sim.parts.filter(p=>p.life>0);
}

/* dibujo de la prueba con p5.js (modo instancia dentro de #stage) */
let P5=null;
function iniciarP5(){
  if(P5){P5.remove();P5=null}
  const host=$('#stage');
  P5=new p5(sk=>{
    sk.setup=()=>{
      sk.pixelDensity(DPR);
      const c=sk.createCanvas(Math.max(2,Math.round(W)),Math.max(2,Math.round(H)));
      host.insertBefore(c.elt,host.firstChild);
      c.elt.setAttribute('role','img');c.elt.setAttribute('aria-label',`Prueba física del puente ${S.level.name}: un camión intenta cruzar`);
    };
    sk.draw=()=>{
      const sim=S.sim;if(!sim||!sim.phys)return;
      if(Math.round(W)!==sk.width||Math.round(H)!==sk.height)sk.resizeCanvas(Math.round(W),Math.round(H));
      if(!document.hidden)pasoFisica(sim,sk.deltaTime/1000);
      try{dibujarPrueba(sk,sk.millis()/1000,sim)}catch(e){console.error(e)}
    };
  },host);
  cv.style.display='none';
}
function detenerP5(){if(P5){P5.remove();P5=null}cv.style.display='';if(S.sim&&S.sim.phys)S.sim=null}
const pCol=(sk,hex,a)=>{const c=sk.color(hex);if(a!==undefined)c.setAlpha(a);return c};
function pPoly(sk,pts,col){sk.noStroke();sk.fill(col);sk.beginShape();pts.forEach(p=>sk.vertex(p[0],p[1]));sk.endShape(sk.CLOSE)}
const physScreen=(v,L)=>{const m=fromPhys(v.x,v.y,L);return toScreen(m.x,m.y)};
function dibujarPrueba(sk,t,sim){
  const L=sim.L;if(!W)return;
  VC=(L.xL+L.xR)/2;
  if(!bg||bgFor!==L.n+'-'+W+'-'+H){setScale();renderBg(L)}
  sk.clear();sk.drawingContext.drawImage(bg,0,0,W,H);
  aguaP5(sk,t,false);
  mallaP5(sk,L);
  L.obs.forEach(o=>{if(o.t==='boat')barcoP5(sk,o,t)});
  if(L.stayed)torresP5(sk,L);else L.pts.forEach(pt=>{const r=sim.an.rows.find(q=>q.pt===pt);pilarP5(sk,pt,r&&r.ok)});
  L.obs.forEach(o=>{if(o.t==='cable')cableP5(sk,o,t)});
  orillasP5(sk,sim);
  tableroP5(sk,sim);
  vehiculoP5(sk,sim);
  banderaP5(sk,sim);
  aguaP5(sk,t,true);
  if(L.wind)vientoP5(sk,REDUCED?0:t);
  particulasP5(sk,sim);
}
function aguaP5(sk,t,front){
  const R=S.level.reg,y0=Y(WATER);
  sk.noStroke();sk.fill(front?pCol(sk,R.water[0],204):pCol(sk,R.water[1]));
  sk.beginShape();for(let px=0;px<=W+24;px+=24)sk.vertex(px,y0+Math.sin(px*.02+t*1.1)*(front?2:3)+Math.sin(px*.047-t*.8)*1.4);sk.vertex(W,H);sk.vertex(0,H);sk.endShape(sk.CLOSE);
  if(front){sk.noFill();sk.stroke(R.water[2]);sk.strokeWeight(1.6);sk.beginShape();for(let px=0;px<=W+24;px+=24)sk.vertex(px,y0+Math.sin(px*.02+t*1.1)*2+Math.sin(px*.047-t*.8)*1.4);sk.endShape()}
}
/* malla cartesiana: una línea por unidad, ejes más marcados y números pares */
function mallaP5(sk,L){
  const ink=L.reg.ink,a=toWorld(0,H),b=toWorld(W,0);
  sk.strokeWeight(1);
  for(let x=Math.ceil(a.x);x<=Math.floor(b.x);x++){sk.stroke(pCol(sk,ink,x%2?20:38));sk.line(X(x),0,X(x),H)}
  for(let y=Math.ceil(a.y);y<=Math.floor(b.y);y++){sk.stroke(pCol(sk,ink,y%2?20:38));sk.line(0,Y(y),W,Y(y))}
  sk.stroke(pCol(sk,ink,170));sk.strokeWeight(1.6);sk.line(0,Y(0),W,Y(0));sk.line(X(0),0,X(0),H);
  sk.textFont('Atkinson Hyperlegible, Verdana, sans-serif');sk.textStyle(sk.BOLD);sk.textSize(W<520?9:11);
  sk.stroke(255,190);sk.strokeWeight(3);sk.fill(ink);
  sk.textAlign(sk.CENTER,sk.TOP);for(let x=Math.ceil(a.x);x<=Math.floor(b.x);x++)if(x%2===0&&x!==0)sk.text(x,X(x),Y(0)+3);
  sk.textAlign(sk.RIGHT,sk.CENTER);for(let y=Math.ceil(a.y);y<=Math.floor(b.y);y++)if(y%2===0&&y!==0&&y>=-2)sk.text(fmt(y),X(0)-4,Y(y));
}
function pilarP5(sk,pt,ok){
  const hw=.2*SC,hwB=.3*SC,top=Y(pt.y),bot=Y(WATER-.8),cx=X(pt.x);
  pPoly(sk,[[cx-hw,top],[cx,top],[cx,bot],[cx-hwB,bot]],'#B7B0A3');
  pPoly(sk,[[cx,top],[cx+hw,top],[cx+hwB,bot],[cx,bot]],'#8D877B');
  pPoly(sk,[[cx-hw*1.5,top-.04*SC],[cx+hw*1.5,top-.04*SC],[cx+hw*1.2,top+.16*SC],[cx-hw*1.2,top+.16*SC]],ok?'#2CCB86':'#FF8F24');
}
function torresP5(sk,L){
  const top=Math.max(L.yL,L.yR)+1.1,hw=.16*SC;
  [[L.xL,L.yL],[L.xR,L.yR]].forEach(([x,y])=>{
    const cx=X(x);sk.stroke('#232B38');sk.strokeWeight(Math.max(1,.035*SC));
    L.pts.filter(pt=>Math.abs(pt.x-x)<=(L.xR-L.xL)/2).forEach(pt=>sk.line(cx,Y(top),X(pt.x),Y(pt.y)));
    pPoly(sk,[[cx-hw,Y(top)],[cx,Y(top)],[cx,Y(y)],[cx-hw*1.4,Y(y)]],'#B7B0A3');
    pPoly(sk,[[cx,Y(top)],[cx+hw,Y(top)],[cx+hw*1.4,Y(y)],[cx,Y(y)]],'#8D877B');
  });
}
function barcoP5(sk,o,t){
  const u=SC,mh=(o.y-WATER)*u,sailTop=mh-.12*u;
  sk.push();sk.translate(X(o.x),Y(WATER));sk.rotate((REDUCED?0:Math.sin(t*1.1+o.x)*.05)*.5);
  pPoly(sk,[[-.9*u,-.34*u],[.9*u,-.34*u],[.62*u,.12*u],[-.62*u,.12*u]],'#7A2F2F');
  pPoly(sk,[[-.9*u,-.34*u],[.9*u,-.34*u],[.85*u,-.26*u],[-.85*u,-.26*u]],'#F7F1E3');
  pPoly(sk,[[-.03*u,-mh],[.03*u,-mh],[.03*u,-.3*u],[-.03*u,-.3*u]],'#3A2B22');
  pPoly(sk,[[.05*u,-sailTop],[.05*u,-.45*u],[.78*u,-.45*u]],'#FDF8EC');
  pPoly(sk,[[-.05*u,-sailTop*.9],[-.05*u,-.45*u],[-.55*u,-.45*u]],'#F2E4C8');
  sk.pop();
}
function cableP5(sk,o,t){
  const R=S.level.reg,cy=Y(o.y+1.15),u=SC,cx=X(o.x)+(REDUCED?0:Math.sin(t*.6)*.05*SC),top=Y(o.y+.75),bot=Y(o.y);
  sk.stroke(R.ink);sk.strokeWeight(Math.max(1.5,.04*SC));sk.line(0,cy,W,cy+6);sk.line(cx,cy+6*(cx/W),cx,top);
  pPoly(sk,[[cx-.5*u,top],[cx+.5*u,top],[cx+.55*u,bot],[cx-.55*u,bot]],'#E04F3C');
  pPoly(sk,[[cx-.38*u,top+.1*u],[cx+.38*u,top+.1*u],[cx+.4*u,top+.36*u],[cx-.4*u,top+.36*u]],'#D6F0F4');
}
/* orillas: la vía sobre la cara superior de cada cuerpo estático */
function orillasP5(sk,sim){
  const L=sim.L,th=.2*SC;
  sim.banks.forEach(b=>{
    const top=[...b.vertices].sort((p,q)=>p.y-q.y).slice(0,2).map(v=>physScreen(v,L)).sort((p,q)=>p.x-q.x);
    const [a,c]=top;
    pPoly(sk,[[a.x,a.y],[c.x,c.y],[c.x,c.y+th],[a.x,a.y+th]],'#3A4150');
    sk.stroke('#F4E7A9');sk.strokeWeight(Math.max(1,.035*SC));sk.drawingContext.setLineDash([.35*SC,.35*SC]);sk.line(a.x,a.y+th*.5,c.x,c.y+th*.5);sk.drawingContext.setLineDash([]);
  });
}
/* tablero: cada rectángulo de Matter con su color de tensión; los que se sueltan, en rojo */
function tableroP5(sk,sim){
  const L=sim.L,u=SC;
  /* cercha bajo los tramos que siguen en pie */
  sk.stroke('#7C5A3C');sk.strokeWeight(Math.max(1.2,.05*u));
  sim.deck.forEach((b,i)=>{if(b.loose||i%2)return;const v=b.vertices.map(q=>physScreen(q,L)),n=sim.deck[i+2];
    const lo=[(v[2].x+v[3].x)/2,(v[2].y+v[3].y)/2],ang=b.angle,dn=[-Math.sin(ang)*.3*u,Math.cos(ang)*.3*u];
    sk.line(lo[0],lo[1],lo[0]+dn[0],lo[1]+dn[1]);
    if(n&&!n.loose&&Math.abs(n.xm-b.xm)<.7){const w=n.vertices.map(q=>physScreen(q,L)),lo2=[(w[2].x+w[3].x)/2,(w[2].y+w[3].y)/2];sk.line(lo[0]+dn[0],lo[1]+dn[1],lo2[0],lo2[1]);sk.line(lo[0]+dn[0],lo[1]+dn[1],lo2[0]+dn[0],lo2[1]+dn[1])}
  });
  sim.deck.forEach(b=>{
    const col=b.loose?'#E8574B':sim.state==='run'?stressCol(stress(b.xm,sim)):'#3A4150';
    pPoly(sk,b.vertices.map(q=>{const p=physScreen(q,L);return[p.x,p.y]}),col);
  });
}
function vehiculoP5(sk,sim){
  const L=sim.L,c=sim.car,p=physScreen(c.chassis.position,L);
  sk.push();sk.translate(p.x,p.y);sk.rotate(c.chassis.angle);sk.scale(SC*1.2,-SC*1.2);sk.translate(0,-.14);
  const P2=(pts,col)=>pPoly(sk,pts,col);
  P2([[-.74,.16],[.7,.16],[.7,.3],[-.74,.3]],'#232B38');
  P2([[-.74,.28],[.12,.28],[.12,.86],[-.74,.86]],'#FF8F24');
  P2([[-.74,.86],[.12,.86],[.12,.68],[-.74,.56]],'#FFA94F');
  P2([[.16,.28],[.74,.28],[.74,.5],[.5,.74],[.16,.74]],'#14426E');
  P2([[.26,.5],[.68,.5],[.48,.68],[.26,.68]],'#BCE9F4');
  sk.pop();
  c.wheels.forEach(w=>{
    const q=physScreen(w.position,L),r=c.r/PHYS.K*SC;
    sk.push();sk.translate(q.x,q.y);sk.rotate(w.angle);
    sk.noStroke();sk.fill('#10151D');sk.beginShape();for(let i=0;i<8;i++){const a=i/8*Math.PI*2;sk.vertex(Math.cos(a)*r,Math.sin(a)*r)}sk.endShape(sk.CLOSE);
    sk.fill('#D6DCE4');sk.rect(-r*.33,-r*.33,r*.66,r*.66);
    sk.pop();
  });
}
function banderaP5(sk,sim){
  if(sim.flag<=0)return;const L=sim.L,fx=X(L.xR+.45),fy=Y(L.yR);
  sk.noStroke();sk.fill('#232B38');sk.rect(fx-1.5,fy-1.8*SC,3,1.8*SC);
  const up=1.3*SC*sim.flag;pPoly(sk,[[fx+1,fy-up-.5*SC],[fx+.9*SC,fy-up-.25*SC],[fx+1,fy-up]],'#FF8F24');
}
function vientoP5(sk,t){
  sk.stroke(255,153);sk.strokeWeight(Math.max(1.2,.04*SC));sk.strokeCap(sk.ROUND);
  for(let i=0;i<12;i++){const len=(.9+(i%3)*.5)*SC,sp=70+(i%4)*28,x=((t*sp+i*137)%(W+len*2))-len,y=H*(.08+.055*i)+Math.sin(t*1.4+i)*5;sk.line(x,y,x+len,y)}
}
function particulasP5(sk,sim){
  sim.parts.forEach(p=>{
    const c=toScreen(p.x,p.y);
    if(p.tri){const a=p.life*5,r=p.r;pPoly(sk,[0,2.1,4.2].map(d=>[c.x+Math.cos(a+d)*r,c.y+Math.sin(a+d)*r]),p.c)}
    else{sk.noStroke();sk.fill(pCol(sk,p.c,255*clamp(p.life,0,1)));sk.circle(c.x,c.y,p.r*2)}
  });
}

/* ---------- pantallas ---------- */
function show(name){
  detenerP5();
  S.screen=name;
  ['menu','game','exam','guide','report'].forEach(n=>{$('#s-'+n).hidden=n!==name});
  window.scrollTo(0,0);
}
function renderMenu(){
  const next=LEVELS.find(L=>!(P.levels[L.id]&&P.levels[L.id].stars))||LEVELS[0];
  const done=Object.values(P.levels).filter(r=>r.stars).length;
  const total=Object.values(P.levels).reduce((a,r)=>a+(r.stars||0),0);
  $('#s-menu').innerHTML=`
   <div class="hero">
     <h1>Function <span>Bridge</span></h1>
     <p class="lede">Cada puente es la gráfica de una función. Reconoce qué tipo de función pide el plano, ajusta sus parámetros hasta que pase por las orillas y los pilares, y manda el camión a probarlo.</p>
     <div class="hero-stage" id="hero-stage"></div>
     <div class="hero-actions">
       <button class="btn primary" id="go-next" type="button">${done?`Seguir con la obra ${next.n}`:'Empezar la obra 1'}</button>
       <button class="btn" id="go-exam" type="button">Examen del inspector</button>
       <button class="btn" id="go-guide" type="button">Guía de funciones</button>
       <button class="btn" id="go-report" type="button">Informe de obra</button>
       <a class="btn" href="menu.html">Menú principal</a>
     </div>
   </div>
   <div class="section-head"><h2>Obras</h2>
     <span>${done} de ${LEVELS.length} terminadas · ${total} de ${LEVELS.length*3} estrellas · <button class="link" id="unlock-all" type="button">${P.unlockAll?'Volver a bloquear en orden':'Desbloquear todas (docente)'}</button></span></div>
   <div class="tiles">${LEVELS.map(L=>{const r=P.levels[L.id],u=unlocked(L);
     return`<button class="tile" type="button" data-lv="${L.n}" ${u?'':'disabled'}><span class="num">${L.n}</span><b>${esc(L.name)}</b><span class="tp">${r&&r.stars?esc(L.free?'Función a tu elección':FAM[L.fam].name):u?'Tipo de función por descubrir':'Termina la obra anterior'}</span>${stars(r?r.stars||0:0)}</button>`}).join('')}</div>
   <p class="footer">El progreso se guarda solo en este navegador. Para entregarlo, abre el Informe de obra y copia el resumen.</p>`;
  $('#go-next').onclick=()=>startLevel(next);
  $('#go-exam').onclick=()=>startExam();
  $('#go-guide').onclick=()=>openGuide('menu');
  $('#go-report').onclick=()=>openReport();
  $('#unlock-all').onclick=()=>{P.unlockAll=!P.unlockAll;save();renderMenu()};
  document.querySelectorAll('[data-lv]').forEach(b=>{b.onclick=()=>startLevel(LEVELS[+b.dataset.lv-1])});
  /* demostración en vivo */
  S.level=LEVELS[3];S.famId=S.level.fam;S.p={...S.level.sol};S.an=analyze(S.level,S.famId,S.p);S.sim=newSim();S.demoWait=0;bg=null;
  cv.setAttribute('aria-label','Un camión cruza un puente en forma de parábola sobre un río');
  mountCanvas($('#hero-stage'));
}
function goMenu(){show('menu');renderMenu()}

/* obra */
function startLevel(L){
  S.level=L;S.idWrong=0;S.crashes=0;S.idDone=false;S.hint=false;S.sim=null;S.an=null;bg=null;S.pxMode=false;
  S.famId=L.fam;S.p=L.free?{}:{...L.start};S.baseFam=null;S.baseP=null;
  VC=(L.xL+L.xR)/2;
  $('#g-where').textContent=`Obra ${L.n} de ${LEVELS.length} · ${L.reg.label}`;
  $('#g-name').textContent=L.name;
  show('game');
  cv.setAttribute('aria-label',`Escena de la obra ${L.name}`);
  mountCanvas($('#stage'));
  if(L.free){S.idDone=true;S.famId=null;enterBuild()}else enterIdentify();
}
function setSteps(i){document.querySelectorAll('#g-steps li').forEach((li,n)=>{li.className=n===i?'on':n<i?'done':''})}
function repHtml(L){
  if(L.rep==='graph')return`<p class="ask">Mira la línea blanca del plano. ¿Qué tipo de función es?</p>`;
  if(L.rep==='table')return`<div class="table-wrap">${tableHtml(L.tableX,L.tableX.map(x=>FAM[L.fam].f(x,L.sol,L)))}</div><p class="ask">Busca el patrón en los valores de y. ¿Qué tipo de función es?</p>`;
  if(L.rep==='eq')return`<div class="eq">${FAM[L.fam].eq(L.sol,L)}</div><p class="ask">Observa dónde está la x en la fórmula. ¿Qué tipo de función es?</p>`;
  return`<p class="quote">${esc(L.desc)}</p><p class="ask">¿Qué tipo de función describe?</p>`;
}
const tableHtml=(xs,ys)=>`<table class="vals"><tr><th>x</th>${xs.map(x=>`<td>${fmt(x)}</td>`).join('')}</tr><tr><th>y</th>${ys.map(y=>`<td>${fmt(y)}</td>`).join('')}</tr></table>`;
function enterIdentify(){
  const L=S.level;detenerP5();S.phase='identify';S.sim=null;S.an=null;setSteps(0);$('#panel').setAttribute('aria-live','polite');$('#hud').hidden=true;cv.style.touchAction='auto';
  $('#panel').innerHTML=`<h2>${esc(L.name)}</h2><p>${esc(L.story)}</p>${repHtml(L)}
   <div class="choices" id="choices">${shuffle(L.opts).map(o=>`<button class="choice" type="button" data-o="${o}">${esc(FAM[o].name)}</button>`).join('')}</div>
   <div id="id-fb"></div>
   <p><button class="link" id="id-guide" type="button">Consultar la guía de funciones</button></p>`;
  $('#id-guide').onclick=()=>openGuide('game');
  document.querySelectorAll('#choices .choice').forEach(b=>{b.onclick=()=>{
    const o=b.dataset.o;
    if(o===L.fam){
      sfx.right();b.classList.add('right');S.idDone=true;
      document.querySelectorAll('#choices .choice').forEach(x=>x.disabled=true);
      $('#id-fb').innerHTML=`<div class="fb good"><strong>Correcto: ${esc(fullName(o))}</strong>${esc(L.why)}</div><div class="row" style="margin-top:10px"><button class="btn primary grow" id="to-build" type="button">Construir el puente</button></div>`;
      $('#to-build').onclick=enterBuild;$('#to-build').focus({preventScroll:true});
    }else{
      sfx.wrong();S.idWrong++;b.classList.add('wrong');b.disabled=true;
      const txt=L.rep==='table'?`En la tabla de esa función, ${FAM[o].tableCue}`:L.rep==='eq'?`Esa función tiene la forma ${FAM[o].form}`:`Esa función ${FAM[o].shape}`;
      $('#id-fb').innerHTML=`<div class="fb bad"><strong>No es ${esc(FAM[o].name.toLowerCase())}</strong>${esc(txt)}. Compáralo con lo que tienes y prueba otra vez.</div>`;
    }
  }});
}
function setParam(id,val,d){
  const r=Math.round((clamp(val,d.min,d.max)-d.min)/d.step)*d.step+d.min;
  S.p[id]=Math.round(r*1e4)/1e4;
}
const pFmt=(d,v)=>d.format?d.format(v):fmt(v);
function syncSliders(){const F=FAM[S.famId];if(!F)return;F.params.forEach(d=>{const s=$('#sl-'+d.id),o=$('#out-'+d.id);if(s)s.value=S.p[d.id];if(o)o.textContent=pFmt(d,S.p[d.id])})}
function enterBuild(){
  const L=S.level;detenerP5();S.phase='build';S.sim=null;setSteps(1);$('#panel').setAttribute('aria-live','off');$('#hud').hidden=true;cv.style.touchAction='none';
  if(L.free&&!S.famId){S.an=null}
  renderBuild();
}
function renderBuild(){
  const L=S.level,F=S.famId?FAM[S.famId]:null,isText=S.famId==='texto';
  const title=L.free?'Elige la pieza':isText?fullName(L.fam):F?fullName(S.famId):'Elige la pieza';
  let html=`<h2>${esc(title)}</h2>`;
  if(L.free)html+=`<p>${esc(L.story)}</p><div class="chips" id="fam-chips">${FAM_IDS.filter(i=>i!=='tramos').map(i=>`<button class="chip ${i===S.famId||(isText&&i===S.baseFam)?'on':''}" type="button" data-f="${i}">${esc(FAM[i].name)}</button>`).join('')}</div>`;
  if(F){
    if(S.famId!=='tramos')html+=`<div class="tabs" role="group" aria-label="Forma de definir la función"><button class="tab ${isText?'':'on'}" type="button" id="tab-sl" aria-pressed="${!isText}">Deslizadores</button><button class="tab ${isText?'on':''}" type="button" id="tab-tx" aria-pressed="${isText}">Escribir fórmula</button></div>`;
    else html+=`<p style="font-size:.9rem;color:var(--muted)">Esta función tiene una fórmula por tramo, así que aquí se construye con deslizadores.</p>`;
    if(isText){
      html+=`<div class="fx"><label for="fx-input">f(x) =</label>
        <input id="fx-input" type="text" value="${esc(S.p.src||'')}" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="fx-msg">
        <div class="fx-msg" id="fx-msg" role="status"></div>
        ${L.informe?`<label class="fx-px"><input type="checkbox" id="fx-px" ${S.pxMode?'checked':''}> Usar unidades del informe (px): x de ${fmt(L.informe.x0)} a ${fmt(L.informe.x0+(L.xR-L.xL)*L.informe.K)}, 1 unidad = ${fmt(L.informe.K)} px</label>`:''}
        <small>Usa <code>x</code>, <code>+ - * / ^</code>, paréntesis, <code>|x|</code>, <code>sen cos tan raiz abs ln log log2 exp senh cosh pi e</code> (<code>ln</code> es natural y <code>log</code> es base 10). Ejemplo: <code>-(x-6)^2/12 + 4.5</code>. Aquí x va de ${fmt(L.xL)} a ${fmt(L.xR)}.</small></div>`;
    }else{
      html+=`<div class="eq" id="eq"></div>
       <div class="sliders">${F.params.map((d,i)=>`<div class="sl" style="accent-color:var(--p${i})">
         <div class="lab"><b class="p${i}">${d.label||d.id}</b><span>${esc(d.role)}</span><output class="p${i}" id="out-${d.id}">${pFmt(d,S.p[d.id])}</output></div>
         <button type="button" data-d="${d.id}" data-s="-1" aria-label="Bajar ${d.label||d.id}">−</button>
         <input type="range" id="sl-${d.id}" min="${d.min}" max="${d.max}" step="${d.step}" value="${S.p[d.id]}" aria-label="${esc((d.label||d.id)+': '+d.role)}">
         <button type="button" data-d="${d.id}" data-s="1" aria-label="Subir ${d.label||d.id}">+</button></div>`).join('')}</div>
       <p style="font-size:.9rem;color:var(--muted)">También puedes arrastrar el punto blanco sobre el plano.</p>`;
    }
    html+=`<div><h3>Puntos de control: tu f(x) / meta</h3><ul class="checks" id="checks" style="margin-top:6px"></ul></div>
     <div id="wind-box"></div>
     <div id="analysis-box"></div>
     <div style="display:grid;gap:4px"><div class="budget"><span>Material</span><span id="bud-t"></span></div><div class="meter" id="bud-m"><i></i></div></div>
     <div id="hint-box"></div>
     <div class="row"><button class="btn primary grow" id="run-test" type="button">Probar el puente</button><button class="btn" id="show-hint" type="button">Pista</button></div>`;
  }else{
    html+=`<div class="fb hint">Elige un tipo de función para empezar a construir. Puedes cambiar de pieza cuando quieras.</div>`;
  }
  $('#panel').innerHTML=html;
  if(L.free)document.querySelectorAll('#fam-chips .chip').forEach(b=>{b.onclick=()=>{S.famId=b.dataset.f;S.p={...FAM[S.famId].def};renderBuild()}});
  if(!F)return;
  const tabS=$('#tab-sl'),tabT=$('#tab-tx');
  if(tabS)tabS.onclick=()=>{if(!isText)return;S.famId=S.baseFam;S.p={...S.baseP};renderBuild()};
  if(tabT)tabT.onclick=()=>{if(isText)return;S.baseFam=S.famId;S.baseP={...S.p};const src=aTexto(S.famId,S.p);S.famId='texto';S.p={src,fn:compilarFuncion(src)};renderBuild()};
  if(isText){
    const inp=$('#fx-input'),px=$('#fx-px');
    inp.oninput=()=>readFormula(inp.value);
    if(px)px.onchange=()=>{S.pxMode=px.checked;readFormula(inp.value)};
    readFormula(inp.value);
  }else{
    F.params.forEach(d=>{const s=$('#sl-'+d.id);s.oninput=()=>{setParam(d.id,+s.value,d);$('#out-'+d.id).textContent=pFmt(d,S.p[d.id]);updateBuild()}});
    document.querySelectorAll('.sl button').forEach(b=>{b.onclick=()=>{const d=F.params.find(q=>q.id===b.dataset.d);setParam(d.id,S.p[d.id]+d.step*(+b.dataset.s),d);syncSliders();updateBuild()}});
  }
  $('#run-test').onclick=startTest;
  $('#show-hint').onclick=()=>{S.hint=true;renderHint()};
  if(S.hint)renderHint();
  updateBuild();
}
/* Con una fórmula incompleta se conserva el último puente válido y se bloquea la prueba. */
function readFormula(text){
  const inp=$('#fx-input'),msg=$('#fx-msg');
  try{
    const L=S.level,raw=compilarFuncion(text),I=S.pxMode&&L.informe;
    /* En unidades del informe: x_px = x0 + (x − xL)·K  y  y = f(x_px) / K */
    const fn=I?x=>raw(I.x0+(x-L.xL)*I.K)/I.K:raw,warn=avisoDominio(fn,L.xL,L.xR);
    S.p={src:text.trim(),fn,invalid:false,px:!!I};
    if(warn){inp.className='warn';msg.className='fx-msg warn';msg.textContent=`Fórmula válida. ${warn}`}
    else{inp.className='good';msg.className='fx-msg good';msg.textContent=`Fórmula válida${MJ?' (Math.js)':''}.`}
  }catch(e){
    S.p={...S.p,invalid:true};
    inp.className='bad';msg.className='fx-msg bad';msg.textContent=e.message;
  }
  updateBuild();
}
function renderHint(){$('#hint-box').innerHTML=`<div class="fb hint"><strong>Pista</strong>${esc(S.level.hint)}</div>`}
function updateBuild(){
  const L=S.level;S.an=analyze(L,S.famId,S.p);
  const eq=$('#eq');if(eq)eq.innerHTML=FAM[S.famId].eq(S.p,L);
  const rt=$('#run-test');if(rt)rt.disabled=S.famId==='texto'&&(!S.p.fn||S.p.invalid);
  const ab=$('#analysis-box');if(ab){ab.innerHTML=analysisHtml(L,S.famId,S.p);$('#analysis').ontoggle=e=>{S.analysisOpen=e.target.open}}
  const wb=$('#wind-box');if(wb)wb.innerHTML=windHtml(L,S.an);
  const ch=$('#checks');if(ch)ch.innerHTML=S.an.rows.map(r=>`<li class="${r.ok?'ok':''}"><span class="mk" aria-hidden="true">${r.ok?'✓':'✕'}</span><span>${esc(r.label)}</span><span class="val">${esc(r.val)}</span></li>`).join('');
  const over=S.an.cost>L.budget,bt=$('#bud-t'),bm=$('#bud-m');
  if(bt)bt.textContent=`$${S.an.cost.toLocaleString('es-CO')} de $${L.budget.toLocaleString('es-CO')}`;
  if(bm){bm.classList.toggle('over',over);bm.firstElementChild.style.width=clamp(S.an.cost/L.budget*100,0,100)+'%'}
}
function startTest(){
  S.an=analyze(S.level,S.famId,S.p);S.phase='test';setSteps(2);$('#panel').setAttribute('aria-live','polite');cv.style.touchAction='auto';audio();
  /* Matter.js arma el mundo con la f(x) de Math.js; p5.js lo avanza y lo dibuja; el resultado vuelve a las estrellas y al informe. */
  const sim=crearSimFisica(S.level,S.an);
  sim.alChocar=()=>{S.crashes++;sfx.crash()};
  sim.alGanar=onWin;
  sim.alPerder=onFail;
  S.sim=sim;iniciarP5();
  $('#panel').innerHTML=`<h2>Prueba de carga</h2><p>El camión es un cuerpo físico: un chasis y dos ruedas con tracción que ruedan sobre ${sim.deck.length} vigas, una cada Δx = ${fmt(PHYS.DX)} (10 px). Mira los colores de la calzada: verde significa poca tensión, amarillo media y rojo mucha.</p><div class="eq">${FAM[S.famId].eq(S.p,S.level)}</div>${windHtml(S.level,S.an)}`;
  if(window.innerWidth<=900)window.scrollTo({top:0,behavior:REDUCED?'auto':'smooth'});
}
function onFail(){
  const L=S.level,i=S.sim.issue;S.hint=true;
  const title={stuck:'El camión no pudo subir',flip:'El camión se volcó',fall:'El camión cayó al abismo'}[i.code]||'El puente cayó';
  $('#panel').innerHTML=`<h2>${title}</h2><div class="fb bad"><strong>Qué pasó</strong>${esc(i.msg)}</div>
   <div class="fb hint"><strong>Pista</strong>${esc(L.hint)}</div>
   <div class="eq">${FAM[S.famId].eq(S.p,L)}</div>
   <div class="row"><button class="btn primary grow" id="fix" type="button">Ajustar el puente</button></div>`;
  $('#fix').onclick=enterBuild;$('#fix').focus({preventScroll:true});
}
function onWin(){
  const L=S.level;sfx.win();confetti();
  const firstId=L.free||S.idWrong===0,clean=S.crashes===0,inBudget=S.an.cost<=L.budget;
  const n=1+(firstId?1:0)+(clean&&inBudget?1:0);
  const r=P.levels[L.id]||{};
  if(!r.stars||n>r.stars)P.levels[L.id]={stars:n,idWrong:S.idWrong,crashes:S.crashes,cost:S.an.cost,fam:S.famId};
  save();
  const nx=LEVELS[L.n];
  const free=L.free?`<div class="fb good"><strong>Usaste: ${esc(fullName(S.famId))}</strong>${S.famId===L.fam?esc(L.why):'La pieza esperada era la exponencial, pero tus parámetros también cumplen todos los puntos de control.'}</div>`:'';
  $('#panel').innerHTML=`<h2>El puente resistió</h2>
    <div class="bigstars" aria-label="${n} de 3 estrellas">${'★'.repeat(n)}<i>${'★'.repeat(3-n)}</i></div>
    <ul class="starnote">
      <li><span class="y">✓</span><span>El camión cruzó</span></li>
      <li><span class="${firstId?'y':'n'}">${firstId?'✓':'–'}</span><span>Reconociste la función al primer intento${firstId?'':` (${S.idWrong} ${S.idWrong===1?'error':'errores'})`}</span></li>
      <li><span class="${clean&&inBudget?'y':'n'}">${clean&&inBudget?'✓':'–'}</span><span>Sin colapsos y dentro del presupuesto${clean&&inBudget?'':` (${S.crashes} ${S.crashes===1?'colapso':'colapsos'}, material $${S.an.cost.toLocaleString('es-CO')})`}</span></li>
    </ul>${free}
    <div class="eq">${FAM[S.famId].eq(S.p,L)}</div>
    ${windHtml(L,S.an)}
    ${analysisHtml(L,S.famId,S.p)}
    ${L.free?'':`<div class="fb good"><strong>Cómo reconocerla</strong>${esc(cap(FAM[L.fam].shape))}. Dominio: ${esc(FAM[L.fam].dom)}.</div>`}
    <div class="row">${nx?`<button class="btn primary grow" id="next-lv" type="button">Siguiente obra</button>`:`<button class="btn primary grow" id="to-exam" type="button">Tomar el examen del inspector</button>`}<button class="btn" id="again" type="button">Repetir</button><button class="btn" id="to-map" type="button">Obras</button></div>`;
  if(nx)$('#next-lv').onclick=()=>startLevel(nx);else $('#to-exam').onclick=()=>startExam();
  $('#again').onclick=()=>startLevel(L);$('#to-map').onclick=goMenu;
}
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

/* ---------- gráficas pequeñas ---------- */
function plotSVG(famId,p,lvl,label){
  const F=FAM[famId],w=300,h=200,x0=-7.5,x1=7.5,y0=-5,y1=5,px=x=>(x-x0)/(x1-x0)*w,py=y=>h-(y-y0)/(y1-y0)*h;
  let d='',pen=false,prev=null;
  const cuts=F.breaks?F.breaks(p,lvl||{}):[];
  for(let i=0;i<=600;i++){
    const x=x0+(x1-x0)*i/600,y=F.f(x,p,lvl);
    const cross=prev!==null&&cuts.some(c=>prev.x<c&&x>=c);
    if(!Number.isFinite(y)||Math.abs(y)>30||cross){pen=false;if(!Number.isFinite(y)||Math.abs(y)>30){prev=null;continue}}
    const Yp=clamp(py(y),-40,h+40);
    d+=(pen?'L':'M')+px(x).toFixed(1)+' '+Yp.toFixed(1);pen=true;prev={x,y};
  }
  let g='';for(let x=-6;x<=6;x+=2)g+=`M${px(x)} 0V${h}`;for(let y=-4;y<=4;y+=2)g+=`M0 ${py(y)}H${w}`;
  return`<svg class="plot" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label||'Gráfica de una función')}"><path class="pl-grid" d="${g}"/><path class="pl-axis" d="M0 ${py(0)}H${w}M${px(0)} 0V${h}"/><path class="pl-curve" d="${d}"/></svg>`;
}
const DEMO_LVL={breaks:[-2,2]};

/* ---------- examen ---------- */
const EX={qs:[],i:0,score:0,misses:[],answered:false};
function makeQuestion(id){
  const F=FAM[id];const p=F.rand();const lvl=DEMO_LVL;
  let reps=['graph','eq','reverse'];if(F.tableX)reps.push('table','table');
  const rep=pick(reps);
  if(rep==='table'){if(id==='exponencial')p.c=0;if(id==='racional'){p.h=0;p.k=0}}
  /* A simple vista, una catenaria y una parábola no se distinguen: no compiten en la misma pregunta. */
  const twin={catenaria:'cuadratica',cuadratica:'catenaria'}[id];
  const dist=shuffle(FAM_IDS.filter(i=>i!==id&&i!==twin)).slice(0,3);
  const opts=shuffle([id,...dist]).map(o=>({id:o,p:o===id?p:FAM[o].rand()}));
  return{id,p,lvl,rep,opts};
}
function startExam(){
  EX.qs=shuffle(FAM_IDS).slice(0,10).map(makeQuestion);EX.i=0;EX.score=0;EX.misses=[];EX.answered=false;
  S.sim=null;show('exam');renderExam();
}
function renderExam(){
  const q=EX.qs[EX.i],F=FAM[q.id];EX.answered=false;
  let prompt='';
  if(q.rep==='graph')prompt=`<p class="ask">¿Qué tipo de función muestra esta gráfica?</p><div class="exam-plot">${plotSVG(q.id,q.p,q.lvl)}</div>`;
  if(q.rep==='eq')prompt=`<p class="ask">¿Qué tipo de función es esta?</p><div class="eq">${F.eq(q.p,q.lvl)}</div>`;
  if(q.rep==='table'){const xs=F.tableX(q.p);prompt=`<p class="ask">¿Qué tipo de función produce esta tabla?</p><div class="table-wrap">${tableHtml(xs,xs.map(x=>F.f(x,q.p,q.lvl)))}</div>`}
  if(q.rep==='reverse')prompt=`<p class="ask">¿Cuál de estas gráficas es una función ${esc(F.name.toLowerCase())}?</p>`;
  const ops=q.rep==='reverse'
    ?`<div class="gchoices">${q.opts.map((o,i)=>`<button class="gchoice" type="button" data-o="${o.id}">${plotSVG(o.id,o.p,q.lvl,'Gráfica '+'ABCD'[i])}<span>Gráfica ${'ABCD'[i]}</span></button>`).join('')}</div>`
    :`<div class="choices">${q.opts.map(o=>`<button class="choice" type="button" data-o="${o.id}">${esc(FAM[o.id].name)}</button>`).join('')}</div>`;
  $('#s-exam').innerHTML=`<div class="bar"><button class="btn small" id="ex-back" type="button">Obras</button><div class="where"><small>Pregunta ${EX.i+1} de ${EX.qs.length} · ${EX.score} ${EX.score===1?'correcta':'correctas'}</small><strong>Examen del inspector</strong></div></div>
    <div class="progress"><i style="width:${EX.i/EX.qs.length*100}%"></i></div>
    <div class="sheet" aria-live="polite">${prompt}${ops}<div id="ex-fb"></div></div>`;
  $('#ex-back').onclick=goMenu;
  document.querySelectorAll('#s-exam [data-o]').forEach(b=>{b.onclick=()=>{
    if(EX.answered)return;EX.answered=true;
    const o=b.dataset.o,ok=o===q.id;
    document.querySelectorAll('#s-exam [data-o]').forEach(x=>{x.disabled=true;if(x.dataset.o===q.id)x.classList.add('right')});
    if(ok){EX.score++;sfx.right()}else{b.classList.add('wrong');EX.misses.push(q.id);sfx.wrong()}
    const cue=q.rep==='table'?`En una tabla, ${F.tableCue}.`:q.rep==='eq'?`Su fórmula tiene la forma ${F.form}.`:`${cap(F.shape)}.`;
    const lastQ=EX.i===EX.qs.length-1;
    $('#ex-fb').innerHTML=`<div class="fb ${ok?'good':'bad'}"><strong>${ok?'Correcto':'La respuesta es: '+esc(F.name)}</strong>${esc(cue)}</div><div class="row" style="margin-top:10px"><button class="btn primary" id="ex-next" type="button">${lastQ?'Ver resultado':'Siguiente pregunta'}</button></div>`;
    $('#ex-next').onclick=()=>{if(lastQ)finishExam();else{EX.i++;renderExam();window.scrollTo(0,0)}};
    $('#ex-next').focus({preventScroll:true});
  }});
}
function finishExam(){
  const n=EX.qs.length;P.examBest=Math.max(P.examBest||0,EX.score);P.examLast=EX.score;P.examMisses=EX.misses;save();
  if(EX.score>=8)sfx.win();
  const miss=[...new Set(EX.misses)];
  $('#s-exam').innerHTML=`<div class="bar"><button class="btn small" id="ex-back" type="button">Obras</button><div class="where"><small>Resultado</small><strong>Examen del inspector</strong></div></div>
   <div class="sheet"><p class="bigstars" style="color:var(--paper);font-family:var(--display)">${EX.score} / ${n}</p>
   <p>${EX.score>=9?'Licencia de inspección aprobada. Reconoces las funciones en sus distintas representaciones.':EX.score>=6?'Vas bien. Repasa las funciones que fallaste y vuelve a intentarlo.':'Conviene repasar la guía antes del siguiente intento. Empieza por comparar las gráficas.'}</p>
   ${miss.length?`<div><h3 style="font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Para repasar</h3><p>${miss.map(m=>esc(FAM[m].name)).join(', ')}</p></div>`:''}
   <div class="row"><button class="btn primary" id="ex-again" type="button">Otro examen</button><button class="btn" id="ex-guide" type="button">Guía de funciones</button><button class="btn" id="ex-report" type="button">Informe de obra</button></div></div>`;
  $('#ex-back').onclick=goMenu;$('#ex-again').onclick=startExam;$('#ex-guide').onclick=()=>openGuide('exam-end');$('#ex-report').onclick=openReport;
}

/* ---------- guía ---------- */
function openGuide(from){
  S.lastGuideFrom=from;
  $('#s-guide').innerHTML=`<div class="bar"><button class="btn small" id="gd-back" type="button">${from==='game'?'Volver a la obra':'Obras'}</button><div class="where"><small>Las ${FAM_IDS.length} piezas del taller</small><strong>Guía de funciones</strong></div></div>
  <div class="guide">${FAM_IDS.map(id=>{const F=FAM[id];return`<article class="card"><h3>${esc(F.name)}</h3>${plotSVG(id,F.demo,DEMO_LVL,'Ejemplo de función '+F.name)}<div class="form">${esc(F.form)}</div>
    <dl><div><dt>En la gráfica</dt><dd>${esc(cap(F.shape))}.</dd></div><div><dt>En la tabla</dt><dd>${esc(cap(F.tableCue))}.</dd></div><div><dt>Dominio</dt><dd>${esc(F.dom)}</dd></div><div><dt>En la vida real</dt><dd>${esc(F.life)}</dd></div></dl></article>`}).join('')}</div>`;
  show('guide');
  $('#gd-back').onclick=()=>{if(from==='game'){show('game');mountCanvas($('#stage'));if(S.phase==='test')enterBuild()}else goMenu()};
}

/* ---------- informe ---------- */
const plural=(n,a,b)=>`${n} ${n===1?a:b}`;
function reportText(){
  const lines=[`Informe de obra: ${P.name||'(sin nombre)'}`,''];
  LEVELS.forEach(L=>{const r=P.levels[L.id];lines.push(`Obra ${L.n}, ${L.name} `+(r&&r.stars?`(${FAM[r.fam].name}): ${r.stars}/3 estrellas; ${L.free?'pieza elegida por el estudiante':plural(r.idWrong,'error','errores')+' al reconocer'}; ${plural(r.crashes,'colapso','colapsos')}`:'sin terminar'))});
  const total=Object.values(P.levels).reduce((a,r)=>a+(r.stars||0),0);
  lines.push('',`Total: ${total} de ${LEVELS.length*3} estrellas`);
  lines.push(`Mejor examen del inspector: ${P.examBest===null||P.examBest===undefined?'sin presentar':P.examBest+'/10'}`);
  return lines.join('\n');
}
function openReport(){
  S.sim=null;
  const rows=LEVELS.map(L=>{const r=P.levels[L.id],d=r&&r.stars;return`<tr><td>${L.n}</td><td>${esc(L.name)}</td><td>${d?esc(L.free?FAM[r.fam].name:FAM[L.fam].name):'Por descubrir'}</td><td>${stars(d?r.stars:0)}</td><td>${d?(L.free?'—':r.idWrong):'—'}</td><td>${d?r.crashes:'—'}</td></tr>`}).join('');
  $('#s-report').innerHTML=`<div class="bar"><button class="btn small" id="rp-back" type="button">Obras</button><div class="where"><small>Resumen para entregar</small><strong>Informe de obra</strong></div></div>
  <div class="sheet"><div class="field"><label for="rp-name">Nombre de quien juega</label><input id="rp-name" type="text" value="${esc(P.name||'')}" placeholder="Escribe tu nombre" autocomplete="off"></div>
   <div class="table-wrap"><table class="report"><thead><tr><th>Obra</th><th>Nombre</th><th>Función</th><th>Estrellas</th><th>Errores al reconocer</th><th>Colapsos</th></tr></thead><tbody>${rows}</tbody></table></div>
   <p>Mejor examen del inspector: <strong>${P.examBest===null||P.examBest===undefined?'sin presentar':P.examBest+' de 10'}</strong></p>
   <label for="rp-text" style="font-size:.88rem;color:var(--muted)">Texto para copiar</label>
   <textarea id="rp-text" readonly>${esc(reportText())}</textarea>
   <div class="row"><button class="btn primary" id="rp-copy" type="button">Copiar el informe</button><span id="rp-msg" role="status" style="align-self:center"></span></div>
   <div class="row"><button class="btn" id="rp-reset" type="button">Borrar el progreso</button></div></div>`;
  show('report');
  $('#rp-back').onclick=goMenu;
  $('#rp-name').oninput=e=>{P.name=e.target.value;save();$('#rp-text').value=reportText()};
  $('#rp-copy').onclick=()=>{const m=$('#rp-msg'),t=$('#rp-text');
    const fb=()=>{t.focus();t.select();m.textContent='Texto seleccionado. Cópialo con Ctrl+C o mantén presionado en el celular.'};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t.value).then(()=>{m.textContent='Informe copiado.'},fb);else fb()};
  let armed=false;
  $('#rp-reset').onclick=e=>{if(!armed){armed=true;e.target.textContent='Confirmar: borrar todo';return}P={name:P.name,levels:{},examBest:null,unlockAll:false,sound:P.sound};save();openReport()};
}

/* ---------- arranque ---------- */
$('#back-map').onclick=goMenu;
$('#open-guide').onclick=()=>openGuide('game');
const soundBtn=$('#toggle-sound');
const paintSound=()=>{soundBtn.textContent=`♪ ${P.sound?'sí':'no'}`;soundBtn.setAttribute('aria-label',P.sound?'Sonido activado':'Sonido desactivado')};paintSound();
soundBtn.onclick=()=>{P.sound=!P.sound;save();paintSound();if(P.sound)tone(660)};
goMenu();
requestAnimationFrame(loop);
