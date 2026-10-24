// Hoja de estilos de la interfaz (se inyecta en <head>). Estética: selva nocturna, paneles de cristal oscuro, acento ámbar.
export const CSS = /* css */ `
:root{
  --bg:rgba(8,14,13,.72); --bg2:rgba(14,24,22,.82); --line:rgba(190,225,200,.16); --line2:rgba(190,225,200,.32);
  --txt:#e9f1e6; --dim:#9bb0a3; --acc:#f0b758; --acc2:#ffd98a; --ok:#8fd68f; --bad:#e2574c; --warn:#f0b758;
  --vida:#d7493f; --hambre:#e0a23a; --sed:#3fa3e0; --energia:#9fd14f;
  --serif:'Cinzel','Trajan Pro',Georgia,'Times New Roman',serif; --sans:'Segoe UI','Inter',Roboto,'Helvetica Neue',Arial,sans-serif;
}
#ui-root{font-family:var(--sans);color:var(--txt);user-select:none;-webkit-user-select:none}
#ui-root *{box-sizing:border-box}
#ui-root .hide{display:none!important}
.hud{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .6s}
.hud.on{opacity:1}
.panel{background:var(--bg);border:1px solid var(--line);backdrop-filter:blur(10px) saturate(1.2);-webkit-backdrop-filter:blur(10px) saturate(1.2);border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,.45)}

/* ---- vitales ---- */
.vitals{position:absolute;left:28px;bottom:26px;width:262px;display:flex;flex-direction:column;gap:7px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
.vit{display:flex;align-items:center;gap:9px}
.vit svg{width:19px;height:19px;flex:none;opacity:.95}
.vit .bar{flex:1;height:8px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.1);border-radius:2px;overflow:hidden;position:relative}
.vit .fill{position:absolute;inset:0 auto 0 0;width:100%;transition:width .35s ease-out;border-radius:1px}
.vit .fill::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.35),transparent 55%)}
.vit .val{width:30px;text-align:right;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 1px 3px #000,0 0 6px rgba(0,0,0,.8)}
.vit.vida{color:var(--vida)} .vit.vida .fill{background:var(--vida)}
.vit.hambre{color:var(--hambre)} .vit.hambre .fill{background:var(--hambre)}
.vit.sed{color:var(--sed)} .vit.sed .fill{background:var(--sed)}
.vit.energia{color:var(--energia)} .vit.energia .fill{background:var(--energia)}
.vit.oxigeno{color:#9ad7ff} .vit.oxigeno .fill{background:#9ad7ff}
.vit.low{animation:lowpulse 1s ease-in-out infinite}
@keyframes lowpulse{50%{opacity:.45}}
.temp{display:flex;align-items:center;gap:7px;font-size:12px;color:#dfe9df;margin-top:2px;text-shadow:0 1px 3px #000,0 0 6px rgba(0,0,0,.8)}
.temp svg{width:15px;height:15px}
.temp b{color:var(--txt);font-weight:600}

/* ---- barra rápida ---- */
.hotbar{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);display:flex;gap:6px}
.slot{width:58px;height:58px;position:relative;background:var(--bg);border:1px solid var(--line);border-radius:5px;display:flex;align-items:center;justify-content:center;transition:transform .12s,border-color .12s,background .12s}
.slot img{width:46px;height:46px;pointer-events:none;image-rendering:auto;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
.slot .n{position:absolute;left:5px;top:3px;font-size:10px;color:var(--dim);font-weight:700}
.slot .c{position:absolute;right:5px;bottom:3px;font-size:12px;font-weight:700;text-shadow:0 1px 2px #000}
.hotbar .slot.sel{border-color:var(--acc);background:rgba(240,183,88,.12);transform:translateY(-6px);box-shadow:0 0 18px rgba(240,183,88,.25)}
.slotname{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);font-size:14px;letter-spacing:.06em;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .4s;white-space:nowrap}
.slotname.on{opacity:1}
.hint{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);font-size:13px;color:var(--acc2);text-shadow:0 2px 6px #000;white-space:nowrap}
.key{display:inline-block;min-width:22px;padding:1px 6px;margin-right:6px;border:1px solid var(--line2);border-bottom-width:2px;border-radius:4px;background:rgba(0,0,0,.5);font-size:11px;font-weight:700;text-align:center;color:var(--txt)}

/* ---- mira y objetivo ---- */
.cross{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:0 0 0 1.5px rgba(0,0,0,.55);transition:all .15s}
.cross.on{width:26px;height:26px;margin:-13px 0 0 -13px;background:transparent;border:1.5px solid rgba(255,255,255,.9);box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.target{position:absolute;left:50%;top:calc(50% + 30px);transform:translateX(-50%);text-align:center;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .15s}
.target.on{opacity:1}
.target .tn{font-size:17px;letter-spacing:.05em;font-weight:600}
.target .ta{font-size:13px;color:var(--acc2);margin-top:3px}
.target .tb{width:150px;height:5px;margin:6px auto 0;background:rgba(0,0,0,.55);border-radius:2px;overflow:hidden;border:1px solid rgba(255,255,255,.12)}
.target .tb i{display:block;height:100%;background:#d7493f}

/* ---- brújula y reloj ---- */
.compass{position:absolute;left:50%;top:18px;width:420px;height:34px;transform:translateX(-50%);overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)}
.compass .track{position:absolute;top:0;height:100%;will-change:transform}
.compass .t{position:absolute;top:18px;width:1px;height:8px;background:rgba(255,255,255,.4)}
.compass .l{position:absolute;top:2px;width:30px;margin-left:-15px;text-align:center;font-size:13px;font-weight:700;text-shadow:0 1px 4px #000;color:var(--txt)}
.compass .l.n{color:var(--acc)}
.compass .pins{position:absolute;inset:0;pointer-events:none}
.compass .pin{position:absolute;left:0;top:19px;width:20px;height:18px;line-height:18px;text-align:center;font-size:12px;font-weight:800;border-radius:9px;color:#fff;text-shadow:0 1px 2px #000;background:rgba(0,0,0,.55);border:1px solid currentColor;transition:opacity .12s}
.pin.jugador,.al.jugador{color:#ff8a4d} .pin.amenaza,.al.amenaza{color:#ff5a4a} .pin.llamada,.al.llamada{color:#ffd35a} .pin.advertencia,.al.advertencia{color:#ff9a3a}
.alerts{position:absolute;left:50%;top:58px;transform:translateX(-50%);display:flex;flex-direction:column;gap:4px;align-items:center;pointer-events:none}
.al{display:flex;align-items:center;gap:8px;padding:4px 10px;border-radius:12px;background:rgba(10,12,10,.62);border:1px solid currentColor;font-size:12px;color:var(--txt);white-space:nowrap;transition:opacity .35s,transform .35s}
.al .arr{font-style:normal;font-size:14px;line-height:1;display:inline-block;color:currentColor;filter:drop-shadow(0 1px 2px #000)}
.al .tx b{color:currentColor} .al .dd{color:var(--dim);font-variant-numeric:tabular-nums} .al .cf{color:var(--dim);font-size:9px;letter-spacing:1px}
.al.out{opacity:0;transform:translateY(-4px)} .al.flash{animation:alflash .5s ease-out}
@keyframes alflash{0%{background:rgba(120,30,20,.85);transform:scale(1.08)}100%{background:rgba(10,12,10,.62);transform:scale(1)}}
.compass-mark{position:absolute;left:50%;top:0;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid var(--acc)}
.clock{position:absolute;left:50%;top:54px;transform:translateX(-50%);font-size:12px;letter-spacing:.14em;color:var(--dim);text-shadow:0 1px 4px #000;white-space:nowrap}
.clock b{color:var(--txt);font-weight:600}

/* ---- objetivo, notificaciones ---- */
.goal{position:absolute;left:28px;top:24px;padding:12px 16px;max-width:290px}
.goal h4{margin:0 0 5px;font-size:10px;letter-spacing:.22em;color:var(--acc);font-weight:700}
.goal p{margin:0;font-size:13px;line-height:1.45}
.goal .pg{margin-top:7px;height:3px;background:rgba(255,255,255,.12);border-radius:2px;overflow:hidden}
.goal .pg i{display:block;height:100%;background:var(--acc);transition:width .3s}
.notifs{position:absolute;right:28px;top:38%;display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.nt{padding:7px 14px;font-size:13px;border-left:3px solid var(--acc);background:linear-gradient(90deg,transparent,rgba(8,14,13,.78));animation:ntIn .25s ease-out;transition:opacity .5s,transform .5s}
.nt.warn{border-color:var(--warn)} .nt.ok{border-color:var(--ok)} .nt.bad{border-color:var(--bad)} .nt.info{border-color:var(--sed)}
.nt.out{opacity:0;transform:translateX(30px)}
@keyframes ntIn{from{opacity:0;transform:translateX(30px)}}
.nt img{width:22px;height:22px;vertical-align:middle;margin-right:7px}
.dmg{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(190,20,20,.65) 100%);opacity:0;transition:opacity .5s}
.dmg.flash{opacity:1;transition:none}
.dmg.low{animation:lowpulse2 1.4s ease-in-out infinite}
@keyframes lowpulse2{0%,100%{opacity:.18}50%{opacity:.5}}
.fpsbox{position:absolute;right:14px;top:10px;font-size:11px;color:var(--dim);font-variant-numeric:tabular-nums}

/* ---- pantallas ---- */
.screen{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;pointer-events:auto}
.screen.menu{align-items:stretch;justify-content:flex-start;background:linear-gradient(90deg,rgba(3,8,8,.9) 0%,rgba(3,8,8,.6) 34%,rgba(3,8,8,0) 66%),radial-gradient(ellipse at 70% 50%,transparent 55%,rgba(0,0,0,.55) 100%)}
.menu .col{display:flex;flex-direction:column;justify-content:center;padding:0 7vw;width:min(520px,92vw);gap:6px}
.menu .logo{font-family:var(--serif);font-size:clamp(38px,5.6vw,72px);line-height:.95;letter-spacing:.08em;font-weight:600;margin:0;text-shadow:0 4px 30px rgba(0,0,0,.7)}
.menu .logo span{display:block;color:var(--acc);font-size:.46em;letter-spacing:.5em;margin-top:.5em;font-family:var(--sans);font-weight:300}
.menu .tag{margin:20px 0 38px;font-size:14px;color:var(--dim);max-width:380px;line-height:1.6}
.btn{pointer-events:auto;cursor:pointer;display:block;width:100%;text-align:left;font:600 14px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--txt);padding:16px 20px;margin:0;background:transparent;border:1px solid transparent;border-left:2px solid var(--line2);transition:all .18s;position:relative}
.btn:hover,.btn:focus-visible{outline:none;background:linear-gradient(90deg,rgba(240,183,88,.18),transparent);border-left-color:var(--acc);color:var(--acc2);padding-left:28px}
.btn.primary{border-left-color:var(--acc);background:linear-gradient(90deg,rgba(240,183,88,.1),transparent)}
.btn:disabled{opacity:.35;cursor:default;pointer-events:none}
.btn small{display:block;margin-top:6px;font-weight:400;letter-spacing:.04em;text-transform:none;color:var(--dim);font-size:12px}
.btn.sm{display:inline-block;width:auto;padding:9px 16px;font-size:12px;border:1px solid var(--line2);border-radius:4px;letter-spacing:.12em;text-align:center}
.btn.sm:hover{padding-left:16px;border-color:var(--acc)}
.ver{position:fixed;left:7vw;bottom:24px;font-size:11px;color:var(--dim);letter-spacing:.1em}
.modal{padding:34px 40px;min-width:min(440px,92vw);max-width:92vw}
.modal h2{margin:0 0 6px;font-family:var(--serif);font-weight:600;letter-spacing:.14em;font-size:26px}
.modal .sub{color:var(--dim);font-size:13px;margin-bottom:22px}
.screen.dim{background:rgba(2,6,6,.55)}
.screen.death{background:radial-gradient(ellipse at center,rgba(60,6,6,.55),rgba(10,0,0,.92));flex-direction:column;text-align:center}
.death h1{font-family:var(--serif);font-weight:600;letter-spacing:.3em;font-size:clamp(34px,6vw,76px);margin:0;color:#e5483a;text-shadow:0 4px 40px rgba(180,20,10,.6)}
.death p{color:var(--dim);margin:16px 0 34px}
.death .btn{width:auto;display:inline-block;border:1px solid var(--line2);text-align:center}

/* ajustes */
.row{display:flex;align-items:center;justify-content:space-between;gap:30px;margin:14px 0;font-size:14px}
.row label{color:var(--dim);letter-spacing:.04em}
.row input[type=range]{width:200px;accent-color:var(--acc)}
.row select{background:rgba(0,0,0,.5);color:var(--txt);border:1px solid var(--line2);padding:7px 10px;border-radius:4px;font:inherit}
.row .v{width:38px;text-align:right;font-variant-numeric:tabular-nums}
.keys{display:grid;grid-template-columns:auto 1fr;gap:9px 22px;font-size:14px;align-items:center}
.keys span:nth-child(even){color:var(--dim)}

/* inventario */
.inv{width:min(1040px,96vw);height:min(720px,96vh);display:grid;grid-template-columns:1.15fr 1fr;gap:0;padding:0;overflow:hidden}
.inv .left,.inv .right{padding:22px 26px;display:flex;flex-direction:column;min-height:0}
.inv .left{overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
.inv .right{border-left:1px solid var(--line);background:rgba(4,10,9,.35)}
.inv h3{margin:0 0 14px;font-size:11px;letter-spacing:.3em;color:var(--acc);font-weight:700}
.grid{display:grid;grid-template-columns:repeat(8,1fr);gap:6px}
.grid .slot{width:100%;height:auto;aspect-ratio:1;cursor:pointer;max-height:58px}
.grid .slot img{width:70%;height:70%}
.grid .slot:hover{border-color:var(--line2);background:var(--bg2)}
.grid .slot.sel{border-color:var(--acc)}
.grid .slot.over{border-color:var(--ok);background:rgba(143,214,143,.1)}
.grid .slot.hb{border-bottom:2px solid rgba(240,183,88,.5)}
.detail{margin-top:12px;padding:12px 16px;min-height:96px;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:5px}
.detail .dn{font-size:17px;font-weight:600;margin-bottom:3px}
.detail .dt{font-size:11px;letter-spacing:.16em;color:var(--acc);text-transform:uppercase;margin-bottom:8px}
.detail .dd{font-size:13px;color:var(--dim);line-height:1.5}
.detail .acts{display:flex;gap:8px;margin-top:12px}
.recipes{overflow:auto;flex:1;padding-right:6px;display:flex;flex-direction:column;gap:8px}
.recipes::-webkit-scrollbar{width:6px}.recipes::-webkit-scrollbar-thumb{background:var(--line2);border-radius:3px}
.rec{display:grid;grid-template-columns:54px 1fr auto;gap:12px;align-items:center;padding:10px 12px;background:rgba(0,0,0,.25);border:1px solid var(--line);border-radius:5px}
.rec.ok{border-color:rgba(240,183,88,.4)}
.rec img{width:46px;height:46px}
.rec .rn{font-weight:600;font-size:15px}
.rec .rc{display:flex;flex-wrap:wrap;gap:5px 10px;margin-top:5px;font-size:12px}
.rec .rc span{color:var(--ok)} .rec .rc span.no{color:var(--bad)}
.rec .st{font-size:11px;color:var(--warn);margin-top:4px}
.slot .db{position:absolute;left:6px;right:6px;bottom:4px;height:3px;background:#8fd68f;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.6);pointer-events:none}
.slot .db.low{background:var(--warn)} .slot .db.bad{background:var(--bad)}
.slot.q0{border-color:rgba(160,150,140,.55)} .slot.q2{border-color:rgba(143,214,143,.7)} .slot.q3{border-color:rgba(255,200,90,.95);box-shadow:inset 0 0 10px rgba(255,200,90,.22)}
.cal{font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:1px 7px;border-radius:9px;border:1px solid var(--line2);vertical-align:middle;margin-left:6px}
.cal.q0{color:#b5aca0} .cal.q1{color:var(--dim)} .cal.q2{color:var(--ok);border-color:var(--ok)} .cal.q3{color:var(--acc2);border-color:var(--acc2)}
.durl{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;font-size:12px;color:var(--dim);margin-top:8px}
.bar{display:block;height:6px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.1);border-radius:3px;overflow:hidden}
.bar i{display:block;height:100%;background:#8fd68f} .bar i.low{background:var(--warn)} .bar i.bad{background:var(--bad)}
.pv{font-size:12px;color:var(--dim);margin-top:6px}
.repl{font-size:12px;margin-top:6px;display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--dim)} .repl span{color:var(--ok)} .repl span.no{color:var(--bad)}
.detail .acts{flex-wrap:wrap}
.btn.sm[disabled]{opacity:.38;pointer-events:none}
.equipo{display:flex;gap:10px;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap}
.equipo .eq{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:var(--dim);letter-spacing:.08em;text-transform:uppercase}
.equipo .slot{width:48px;height:48px;cursor:pointer} .equipo .slot img{width:34px;height:34px} .equipo .slot:hover{border-color:var(--line2);background:var(--bg2)} .equipo .slot.sel{border-color:var(--acc)}
.equipo .ph{font-size:10px;color:var(--line2);letter-spacing:.1em;text-transform:uppercase}
.equipo .eqs{margin-left:auto;display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--dim)} .equipo .eqs b{color:var(--txt)}
.carga{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:10px;font-size:12px;color:var(--dim)} .carga b{color:var(--txt)} .carga .bar{margin-top:4px}
.oficios{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-bottom:12px;font-size:12px;color:var(--dim)} .oficios b{color:var(--acc2);margin-left:4px} .oficios .bar{margin-top:3px} .oficios .bar i{background:var(--acc)}
.tabs{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.tab{background:rgba(0,0,0,.25);border:1px solid var(--line);color:var(--dim);font:inherit;font-size:11px;letter-spacing:.06em;padding:4px 9px;border-radius:12px;cursor:pointer}
.tab:hover{border-color:var(--line2);color:var(--txt)} .tab.on{border-color:var(--acc);color:var(--acc2);background:rgba(240,183,88,.1)}
.chk{margin-left:auto;font-size:11px;color:var(--dim);display:flex;gap:5px;align-items:center;cursor:pointer} .chk input{accent-color:var(--acc)}
.rec .rs{font-size:11px;color:var(--acc2);margin-top:2px} .rec .rn small{font-size:11px;color:var(--dim);font-weight:400}
.rec .rq{display:flex;flex-wrap:wrap;gap:3px 10px;margin-top:4px;font-size:11px} .rec .rq span{color:var(--dim)} .rec .rq span.no{color:var(--warn)}
.vacio{padding:18px;text-align:center;color:var(--dim);font-size:13px}
.ocultas{margin-top:6px;padding-top:10px;border-top:1px dashed var(--line);display:flex;flex-direction:column;gap:6px}
.ocultas .pista{font-size:12px;color:var(--dim);font-style:italic;padding:6px 10px;border-left:2px solid var(--line2)}
.statline{display:flex;gap:16px;font-size:12px;color:var(--dim);margin-bottom:10px;flex-wrap:wrap}
.statline b{color:var(--txt)}

/* mapa */
.map{padding:16px;display:flex;flex-direction:column;gap:10px}
.map canvas{width:min(78vh,86vw);height:min(78vh,86vw);border-radius:4px;border:1px solid var(--line2);image-rendering:auto}
.map .legend{font-size:12px;color:var(--dim);display:flex;justify-content:space-between}

/* animales: línea de relación al apuntar, panel del animal y aviso de montura */
.target .tr{font-size:12px;margin-top:2px;display:flex;gap:10px;justify-content:center;align-items:center}
.target .tr .nv{padding:1px 8px;border-radius:10px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.18);color:#e8e2d2}
.target .tr .nv.n3{border-color:#d9c36a;color:#f2dd8a} .target .tr .nv.n4,.target .tr .nv.n5,.target .tr .nv.n6{border-color:#8fd68f;color:#a8e6a8} .target .tr .nv.n2{border-color:#e08a5a;color:#f0a47a}
.target .tr .mt{color:var(--dim)}
.ride{position:absolute;left:50%;bottom:176px;transform:translateX(-50%);font-size:13px;color:var(--acc2);text-shadow:0 1px 3px #000,0 2px 10px #000;background:rgba(10,14,12,.55);padding:5px 12px;border-radius:7px;opacity:0;transition:opacity .2s;white-space:nowrap}
.ride.on{opacity:1}
.animal{width:min(980px,96vw);max-height:96vh;overflow-y:auto;padding:20px 26px;scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
.animal h4{margin:14px 0 8px;font-size:11px;letter-spacing:.28em;color:var(--acc);font-weight:700}
.animal .ahead{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.animal .nm{background:rgba(0,0,0,.35);border:1px solid var(--line2);color:var(--txt);font:inherit;font-size:20px;letter-spacing:.04em;padding:4px 10px;border-radius:5px;min-width:200px}
.animal .spn{flex:1;color:var(--dim);font-size:13px}
.animal .nvl{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 4px}
.animal .nvl span{font-size:11px;padding:3px 9px;border-radius:12px;border:1px solid var(--line);color:var(--dim)}
.animal .nvl span.on{border-color:var(--acc);color:var(--acc2);background:rgba(240,183,88,.12)} .animal .nvl span.off{opacity:.35;text-decoration:line-through}
.animal .acols{display:grid;grid-template-columns:1fr 1.1fr;gap:26px}
.animal .astat{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center;font-size:12px;color:var(--dim)}
.animal .aord{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.animal .btn.on{border-color:var(--acc);color:var(--acc2);background:rgba(240,183,88,.14)} .animal .btn[disabled]{opacity:.4;cursor:not-allowed}
.animal .anota{margin-top:12px;font-size:12px;color:var(--dim);line-height:1.5} .animal .anota .ries{color:#e0a070}
.animal .sub{font-size:11px;color:var(--dim);margin:4px 0}
.animal .eqr{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px} .animal .eqr .slot{width:48px;height:48px;flex:none} .animal .eqr .slot img{width:34px;height:34px}
.animal .eqt{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dim)} .animal .eqt b{color:var(--txt);font-size:12px} .animal .eqt small{color:var(--dim)}
.animal .acarga{margin-top:6px}
.animal .crg{display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0} .animal .crg img{width:26px;height:26px} .animal .crg span{flex:1}
.animal .mini{display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:6px} .animal .mini .slot{width:100%;height:auto;aspect-ratio:1;cursor:pointer} .animal .mini .slot img{width:70%;height:70%} .animal .mini .slot:hover{border-color:var(--ok)}
.animal .vacio{font-size:12px;color:var(--dim);font-style:italic}
@media (max-width:760px){.animal .acols{grid-template-columns:1fr}}
`;
