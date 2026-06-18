/** GET /api/v1/signals/snippet/:token — serve the tracking JS (public). */

export function GET(req: Request, { params }: { params: { token: string } }) {
  const origin = new URL(req.url).origin;
  const endpoint = `${origin}/api/v1/signals/track`;
  const js = `(function(){
  var T=${JSON.stringify(params.token)},E=${JSON.stringify(endpoint)};
  function sid(){try{var k='_abm_sid',v=localStorage.getItem(k);if(!v){v=Date.now().toString(36)+Math.random().toString(36).slice(2,8);localStorage.setItem(k,v);}return v;}catch(e){return 'anon';}}
  function track(){try{var b=JSON.stringify({token:T,url:location.href,session_id:sid()});if(navigator.sendBeacon){navigator.sendBeacon(E,new Blob([b],{type:'application/json'}));}else{fetch(E,{method:'POST',headers:{'Content-Type':'application/json'},body:b,keepalive:true});}}catch(e){}}
  track();
  var _p=history.pushState;history.pushState=function(){_p.apply(this,arguments);track();};
  addEventListener('popstate',track);
})();`;
  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
  });
}
