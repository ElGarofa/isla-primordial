// Panel de un animal propio: estado, órdenes, equipo según su anatomía, carga (alforjas) y montura.
import { ITEMS, RANURAS_ANIMAL, RANURA_ANIMAL_NOMBRE } from '../core/items.js';
import { iconUrl } from './icons.js';

const kg = (n) => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} kg`;
const lt = (n) => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} L`;
const esc = (t) => String(t).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

/** Devuelve { abrir(c), cerrar(), render(), actual() }. `host` aporta showScreen / closeScreens / unlock / lock / snd / el / openPanel(). */
export function createAnimalPanel(ctx, host) {
  const S = ctx.survival, V = ctx.fauna.vinculo;
  const screen = host.el('', 'screen dim hide');
  let c = null;

  const barra = (v, cls = '') => `<span class="bar"><i class="${cls}" style="width:${pct(v)}"></i></span>`;

  function nivelesHtml(i) {
    return `<div class="nvl">${[1, 2, 3, 4, 5, 6].map((n) => `<span class="${n === i.nivel ? 'on' : ''} ${n > i.max && n !== 2 ? 'off' : ''}" title="${esc(V.NIVEL_DESC[n])}">${n} · ${V.NIVEL_NOMBRE[n]}</span>`).join('')}</div>`;
  }

  function equipoHtml(r) {
    const m = c.sp.montura;
    return `<div class="aeq">${RANURAS_ANIMAL.map((k) => {
      const e = r.equipo[k];
      const opciones = [];
      let motivo = '';
      if (!e && k !== 'cabeza') {
        for (let i = 0; i < S.slots.length; i++) {
          const s = S.slots[i]; if (!s || ITEMS[s.item].aparejo?.ranura !== k) continue;
          const p = V.puedeEquipar(c, s.item);
          if (p.ok) opciones.push(`<button class="btn sm" data-eq="${i}">Equipar ${esc(ITEMS[s.item].nombre.toLowerCase())}</button>`); else motivo = p.motivo;
        }
        if (!opciones.length && !motivo) motivo = !m ? `La anatomía de ${c.sp.nombre.toLowerCase()} no admite equipo` : r.dom ? 'No llevas nada compatible' : 'Primero debe estar domesticado';
      }
      const it = e && ITEMS[e.item];
      const dur = e?.dur != null ? `<span class="bar"><i style="width:${pct(e.dur / Math.max(1, S.durMaxDe(e.item, e.cal ?? 1, e.rep ?? 0)))}"></i></span>` : '';
      return `<div class="eqr"><div class="slot">${e ? `<img src="${iconUrl(e.item)}" alt="">` : '<span class="ph"></span>'}</div>
        <div class="eqt"><b>${RANURA_ANIMAL_NOMBRE[k]}</b>${e ? `<span>${esc(it.nombre)}${it.aparejo.armadura ? ` · −${Math.round(it.aparejo.armadura * 100)} % de daño` : ''}</span>${dur}${k !== 'cabeza' ? `<button class="btn sm" data-qeq="${k}">Quitar</button>` : '<small>Se quita al liberar</small>'}`
        : `${opciones.join('')}${motivo ? `<small>${esc(motivo)}</small>` : ''}`}</div></div>`;
    }).join('')}</div>`;
  }

  function cargaHtml(r) {
    if (!r.equipo.carga) return '';
    const cap = V.capacidadCarga(c), cur = V.cargaActual(c);
    const lista = r.almacen.map((s, i) => `<div class="crg"><img src="${iconUrl(s.item)}" alt=""><span>${esc(ITEMS[s.item].nombre)} ×${s.cantidad}</span><button class="btn sm" data-sacar="${i}">Tomar</button></div>`).join('') || '<div class="vacio">Vacía</div>';
    let mochila = '';
    for (let i = 0; i < S.slots.length; i++) {
      const s = S.slots[i]; if (!s) continue;
      mochila += `<div class="slot" data-guardar="${i}" title="Guardar ${esc(ITEMS[s.item].nombre)}"><img src="${iconUrl(s.item)}" alt="">${s.cantidad > 1 ? `<span class="c">${s.cantidad}</span>` : ''}</div>`;
    }
    return `<div class="acarga"><h4>CARGA</h4>
      <div class="carga"><div><span>Peso <b>${kg(cur.peso)}</b> / ${kg(cap.peso)}</span>${barra(cur.peso / cap.peso)}</div><div><span>Volumen <b>${lt(cur.vol)}</b> / ${lt(cap.vol)}</span>${barra(cur.vol / cap.vol)}</div></div>
      <div class="clist">${lista}</div><div class="sub">Haz clic en un objeto de tu mochila para guardarlo (Mayús: uno solo)</div><div class="mini">${mochila || '<div class="vacio">Mochila vacía</div>'}</div></div>`;
  }

  function render() {
    if (!c) return;
    const r = c.rel, i = V.info(c), nom = r.nombre ?? c.nombre;
    const falta = i.cuidTotal ? `${(Math.min(r.cuid, i.cuidTotal) / ctx.config.time.dayLengthSec).toFixed(1)} / ${(i.cuidTotal / ctx.config.time.dayLengthSec).toFixed(1)} días` : '';
    const ordenes = ['seguir', 'quedarse', 'libre'].map((o) => `<button class="btn sm ${r.orden === o ? 'on' : ''}" data-ord="${o}">${V.ORDEN_NOMBRE[o]}</button>`).join('');
    const mont = ctx.montura?.puede(c);
    const alim = V.elegirAlimento(c);
    screen.innerHTML = `<div class="panel animal">
      <div class="ahead"><input class="nm" data-nombre maxlength="24" value="${esc(nom)}" aria-label="Nombre"><span class="spn">${esc(c.sp.nombre)} · nivel ${i.nivel} — ${esc(i.nivelNombre)}</span><button class="btn sm" data-cerrar>Cerrar</button></div>
      ${nivelesHtml(i)}
      <div class="acols">
        <div class="ac1"><h4>ESTADO</h4>
          <div class="astat"><span>Vida ${Math.round(c.hp)}/${Math.round(c.hpMax)}</span>${barra(c.hp / c.hpMax, c.hp / c.hpMax < 0.3 ? 'bad' : '')}
          <span>Hambre</span>${barra(c.hambre, c.hambre > 0.75 ? 'bad' : c.hambre > 0.5 ? 'low' : '')}
          <span>Confianza</span>${barra(r.conf)}
          ${falta ? `<span>Cuidado ${esc(falta)}</span>${barra(i.cuidTotal ? r.cuid / i.cuidTotal : 0)}` : ''}
          <span>Estrés</span>${barra(r.estres, r.estres > 0.6 ? 'bad' : r.estres > 0.3 ? 'low' : '')}</div>
          <h4>ÓRDENES</h4><div class="aord">${ordenes}</div>
          <div class="aord"><button class="btn sm" data-ofrecer ${alim ? '' : 'disabled'}>${alim ? `Ofrecer ${esc(ITEMS[alim].nombre.toLowerCase())}` : 'Sin alimento adecuado'}</button>
          ${i.montable ? `<button class="btn sm primary" data-montar ${mont?.ok ? '' : 'disabled'} title="${esc(mont?.motivo ?? '')}">Montar (G)</button>` : ''}
          <button class="btn sm" data-liberar>Liberar</button></div>
          ${mont && !mont.ok && i.montable ? `<div class="sub">${esc(mont.motivo)}</div>` : ''}
          <div class="anota"><b>Come:</b> ${esc(i.comida || '—')}<br>${esc(i.nota ?? '')}${i.riesgo ? `<br><span class="ries">${esc(i.riesgo)}</span>` : ''}</div>
        </div>
        <div class="ac2"><h4>EQUIPO</h4>${equipoHtml(r)}${cargaHtml(r)}</div>
      </div></div>`;
  }

  screen.addEventListener('click', (e) => {
    if (!c) return;
    const t = e.target;
    if (t === screen || t.closest('[data-cerrar]')) { api.cerrar(); return; }
    host.snd();
    const ord = t.closest('[data-ord]')?.dataset.ord; if (ord) { V.ordenar(c, ord); render(); return; }
    if (t.closest('[data-ofrecer]')) { V.ofrecer(c, V.elegirAlimento(c)); render(); return; }
    if (t.closest('[data-montar]')) { const cc = c; api.cerrar(); ctx.montura.montar(cc); return; }
    if (t.closest('[data-liberar]')) { const cc = c; if (V.liberar(cc)) { ctx.ui?.notify?.(`${cc.nombre} vuelve a la naturaleza`, 'info'); api.cerrar(); } return; }
    const eq = t.closest('[data-eq]'); if (eq) { const p = V.equipar(c, +eq.dataset.eq); if (p.ok) host.snd('craft'); render(); return; }
    const qeq = t.closest('[data-qeq]'); if (qeq) { const p = V.quitarEquipo(c, qeq.dataset.qeq); if (!p.ok) ctx.ui?.notify?.(p.motivo, 'warn'); render(); return; }
    const sc = t.closest('[data-sacar]'); if (sc) { const p = V.sacar(c, +sc.dataset.sacar); if (!p.ok) ctx.ui?.notify?.(p.motivo, 'warn'); render(); return; }
    const gd = t.closest('[data-guardar]'); if (gd) { const p = V.guardar(c, +gd.dataset.guardar, e.shiftKey ? 1 : null); if (!p.ok) ctx.ui?.notify?.(p.motivo, 'warn'); render(); return; }
  });
  screen.addEventListener('change', (e) => { if (c && e.target.matches('[data-nombre]')) { V.renombrar(c, e.target.value); render(); } });
  screen.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur?.(); if (e.key === 'Escape') api.cerrar(); });

  const api = {
    screen,
    actual: () => c,
    abrir(criatura) {
      if (ctx.state !== 'playing' || !V.esPropio(criatura)) return;
      c = criatura; render(); host.showScreen('animal'); host.unlock(); host.snd('ui_open');
    },
    cerrar() { if (!c) return; c = null; host.closeScreens(); host.lock(); host.snd('ui_close'); },
    render,
    /** Cierra si el animal murió o se alejó. */
    vigilar() { if (c && (c.muerta || c.distToPlayer() > 14 || !V.esPropio(c))) api.cerrar(); },
  };
  return api;
}
