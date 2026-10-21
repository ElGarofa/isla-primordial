// Pantalla de carga (estática en index.html). La carga la dirige main.js; este archivo es del agente de UI.
// IMPORTANTE: en modo depuración (?debug=1) la pantalla debe desaparecer al instante, para que las capturas salgan limpias.
export function initLoading(ctx) {
  const root = document.getElementById('loading');
  const fill = document.getElementById('loading-fill');
  const label = document.getElementById('loading-label');
  ctx.events.on('loading', ({ label: text, progress }) => {
    if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
    if (label) label.textContent = text;
    if (progress >= 1 && root) {
      if (ctx.debug.enabled) { root.remove(); return; }
      root.style.opacity = '0';
      setTimeout(() => root.remove(), 900);
    }
  });
}
