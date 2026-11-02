const VERSION = '1.2.0';
const SLOTS = [['des','Desayuno'],['com','Comida'],['cen','Cena'],['sna','Snack']];
const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const FOOD = Object.fromEntries(FOODS.map(f => [f.id, f]));
const DISH = Object.fromEntries(DISHES.map(d => [d.id, d]));
const STATUS = { ok: ['✅ Sí, libre', 'ok'], mod: ['⚠️ Con moderación', 'mod'], no: ['⛔ Evítalo', 'no'] };

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('keto:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('keto:' + k, JSON.stringify(v)); } catch {} },
};

let profile = store.get('profile', null);
let plan = store.get('plan', null);
let done = store.get('done', {});
let shopDone = store.get('shop', {});
let excl = store.get('excl', []);
let tab = 'menu';
let selDay = (new Date().getDay() + 6) % 7;
let foodQ = '', foodFilter = 'all';

// ---------- lógica ----------
function monday() {
  const x = new Date(); x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const allowed = d => !d.ing.some(([id]) => excl.includes(id));
const slotIds = slot => { const a = DISHES.filter(d => d.slot === slot && allowed(d)).map(d => d.id); return a.length ? a : DISHES.filter(d => d.slot === slot).map(d => d.id); };
const slotsOk = () => SLOTS.every(([s]) => DISHES.some(d => d.slot === s && allowed(d)));

// Cambia los platos del menú que llevan algo excluido
function applyExcl() {
  plan.days.forEach(day => SLOTS.forEach(([s]) => {
    if (day[s] && !allowed(DISH[day[s]])) { const o = slotIds(s); day[s] = o[Math.floor(Math.random() * o.length)]; }
  }));
  store.set('plan', plan);
}
function setExcl(next, ctx) {
  const prev = excl; excl = next;
  if (!slotsOk()) { excl = prev; toast('Así no quedarían platos para alguna comida'); return false; }
  store.set('excl', excl); ensurePlan(); applyExcl(); return true;
}

function genPlan() {
  const days = Array.from({ length: 7 }, () => ({}));
  for (const [slot] of SLOTS) {
    const ids = slotIds(slot);
    const pool = shuffle(ids).concat(shuffle(ids));
    days.forEach((d, i) => d[slot] = pool[i]);
  }
  plan = { week: monday(), days };
  store.set('plan', plan);
}
function ensurePlan() { if (!plan || plan.week !== monday()) { genPlan(); done = {}; store.set('done', done); } }

function macros(dish) {
  const t = { k: 0, p: 0, f: 0, c: 0 };
  for (const [id, g] of dish.ing) { const f = FOOD[id], r = g / 100; t.k += f.k * r; t.p += f.p * r; t.f += f.f * r; t.c += f.c * r; }
  return t;
}
function dayTotals(i) {
  const t = { k: 0, p: 0, f: 0, c: 0 };
  for (const [slot] of SLOTS) { if (!plan.days[i][slot]) continue; const m = macros(DISH[plan.days[i][slot]]); for (const k in t) t[k] += m[k]; }
  return t;
}
function targets() {
  const p = profile;
  if (!p) return { k: 1800, p: 90, f: 140, c: 25 };
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const k = Math.round(bmr * p.activity * p.goal / 10) * 10;
  const prot = Math.round(p.weight * 1.6);
  const c = p.carbs || 25;
  return { k, p: prot, c, f: Math.round((k - prot * 4 - c * 4) / 9) };
}

// ---------- UI ----------
function toast(msg, action, fn) {
  const t = $('#toast'); t.hidden = false;
  t.innerHTML = esc(msg) + (action ? `<button id="toastBtn">${esc(action)}</button>` : '');
  if (action) $('#toastBtn').onclick = fn;
  clearTimeout(toast.t); if (!action) toast.t = setTimeout(() => t.hidden = true, 2500);
}
function openSheet(html) { $('#sheet').innerHTML = html; $('#sheet').hidden = false; $('#backdrop').hidden = false; $('#sheet').scrollTop = 0; }
function closeSheet() { $('#sheet').hidden = true; $('#backdrop').hidden = true; }

function bar(label, v, max, unit, limit) {
  const pct = Math.min(100, v / max * 100);
  return `<div class="bar ${limit && v > max * 1.1 ? 'over' : ''}"><small><span>${label}</span><span>${Math.round(v)} / ${max} ${unit}</span></small><i><u style="width:${pct}%"></u></i></div>`;
}

function renderMenu() {
  ensurePlan();
  const T = targets(), t = dayTotals(selDay), today = (new Date().getDay() + 6) % 7;
  const mon = new Date(plan.week + 'T12:00:00');
  let h = '<div class="days">' + DAYS.map((d, i) => {
    const x = new Date(mon); x.setDate(mon.getDate() + i);
    return `<button data-day="${i}" class="${i === selDay ? 'on' : ''} ${i === today ? 'today' : ''}">${d}<b>${x.getDate()}</b></button>`;
  }).join('') + '</div>';
  if (!profile) h += '<div class="warn">Completa tu <b>perfil</b> para calcular tus calorías y macros. Mientras tanto uso valores medios.</div>';
  if (t.c > T.c * 1.2) h += `<div class="warn">⚠️ Este día lleva ${Math.round(t.c)} g de carbohidratos netos (tu límite: ${T.c} g). Cambia algún plato.</div>`;
  h += `<div class="card sum"><div class="ring" style="--p:${Math.min(100, t.k / T.k * 100)}"><div><span><b>${Math.round(t.k)}</b>kcal</span></div></div>
    <div class="bars">${bar('Carbos netos', t.c, T.c, 'g', true)}${bar('Proteína', t.p, T.p, 'g')}${bar('Grasa', t.f, T.f, 'g')}</div></div>`;
  for (const [slot, label] of SLOTS) {
    if (!plan.days[selDay][slot]) {
      h += `<div class="card meal"><div class="e">➕</div><div class="b"><div class="s">${label}</div><h3>Sin plato</h3><div class="row"><button class="btn p" data-swap="${slot}">Elegir plato</button></div></div></div>`;
      continue;
    }
    const d = DISH[plan.days[selDay][slot]], m = macros(d), key = plan.week + '|' + selDay + '|' + slot;
    h += `<div class="card meal"><div class="e">${d.e}</div><div class="b"><div class="s">${label}</div><h3>${esc(d.name)}</h3>
      <p>${d.ing.map(([id, g]) => `${g} g ${FOOD[id].n.toLowerCase()}`).join(' · ')}</p>
      <div class="chips"><span class="chip">${Math.round(m.k)} kcal</span><span class="chip c">${m.c.toFixed(1)} g carbos</span><span class="chip">${Math.round(m.p)} g prot</span><span class="chip">${Math.round(m.f)} g grasa</span></div>
      <div class="row"><button class="btn ${done[key] ? 'done' : ''}" data-done="${slot}">${done[key] ? '✓ Hecho' : 'Marcar hecho'}</button><button class="btn" data-swap="${slot}">🔄 Cambiar</button><button class="btn" data-rec="${d.id}">📖 Receta</button></div></div></div>`;
  }
  h += '<button class="btn big" id="regen">🎲 Generar otra semana</button><button class="btn big" id="clearweek">✍️ Empezar menú manual (vaciar semana)</button>';
  $('#view').innerHTML = h;
}

function openSwap(slot, all = false) {
  const cur = plan.days[selDay][slot];
  const list = DISHES.filter(d => all || (d.slot === slot && (allowed(d) || d.id === cur)));
  openSheet(`<h3>Elegir ${SLOTS.find(s => s[0] === slot)[1].toLowerCase()} · ${DAYS[selDay]}</h3>
    <div class="filters"><button data-swapall="0" class="${all ? '' : 'on'}">Para esta comida</button><button data-swapall="1" class="${all ? 'on' : ''}">Todas las recetas</button></div>
    <div class="row"><button class="btn p" data-pick="__rnd">🎲 Sorpréndeme</button><button class="btn" data-pick="__none">Dejar vacío</button></div><div style="height:10px"></div>` +
    list.map(d => {
      const m = macros(d);
      return `<button class="alt ${d.id === cur ? 'cur' : ''}" data-pick="${d.id}"><span style="font-size:26px">${d.e}</span><span><b>${esc(d.name)}</b><small>${Math.round(m.k)} kcal · ${m.c.toFixed(1)} g carbos netos${allowed(d) ? '' : ' · 🚫'}</small></span></button>`;
    }).join(''));
  $('#sheet').dataset.slot = slot;
}

let recSlot = 'all', recQ = '';
function renderRecipes() {
  const q = recQ.trim().toLowerCase();
  const list = DISHES.filter(d => (recSlot === 'all' || d.slot === recSlot) && (!q || d.name.toLowerCase().includes(q) || d.ing.some(([i]) => FOOD[i].n.toLowerCase().includes(q))));
  $('#view').innerHTML = `<input id="rq" type="search" placeholder="Buscar receta o ingrediente…" value="${esc(recQ)}">
    <div class="filters">${[['all', 'Todas'], ...SLOTS].map(([k, l]) => `<button data-rf="${k}" class="${recSlot === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <p class="muted">${list.length} recetas · tócalas para ver la preparación y añadirlas a tu menú</p>` +
    (list.map(d => {
      const m = macros(d);
      return `<button class="alt" data-rec="${d.id}"><span style="font-size:26px">${d.e}</span><span><b>${esc(d.name)}</b><small>${Math.round(m.k)} kcal · ${m.c.toFixed(1)} g carbos netos${allowed(d) ? '' : ' · 🚫'}</small></span></button>`;
    }).join('') || '<p class="muted">No hay resultados.</p>');
  const r = $('#rq'); r.oninput = () => { recQ = r.value; const p = r.selectionStart; renderRecipes(); const n = $('#rq'); n.focus(); n.setSelectionRange(p, p); };
}

function openRecipe(id) {
  const d = DISH[id], m = macros(d);
  openSheet(`<h3>${d.e} ${esc(d.name)}</h3>
    <div class="chips"><span class="chip">${Math.round(m.k)} kcal</span><span class="chip c">${m.c.toFixed(1)} g carbos netos</span><span class="chip">${Math.round(m.p)} g prot</span><span class="chip">${Math.round(m.f)} g grasa</span></div>
    <div class="card"><b>Ingredientes</b><ul>${d.ing.map(([i, g]) => `<li>${g} g de ${FOOD[i].n.toLowerCase()}${excl.includes(i) ? ' 🚫' : ''}</li>`).join('')}</ul></div>
    <div class="card"><b>Preparación</b><p style="margin:6px 0 0">${esc(STEPS[id] || '')}</p></div>
    <div class="card"><b>Añadir a mi menú</b><label>Día</label><div class="filters" id="rdays">${DAYS.map((x, i) => `<button data-rday="${i}" class="${i === selDay ? 'on' : ''}">${x}</button>`).join('')}</div>
    <label>Comida</label><div class="filters" id="rslots">${SLOTS.map(([k, l]) => `<button data-rslot="${k}" class="${k === d.slot ? 'on' : ''}">${l}</button>`).join('')}</div>
    <button class="btn p big" data-radd="${id}">➕ Añadir</button></div>`);
  $('#sheet').dataset.rday = selDay; $('#sheet').dataset.rslot = d.slot;
}

function renderFoods() {
  const q = foodQ.trim().toLowerCase();
  const list = FOODS.filter(f => (foodFilter === 'all' || f.s === foodFilter) && (!q || f.n.toLowerCase().includes(q)));
  let h = `<input id="q" type="search" placeholder="Buscar alimento…" value="${esc(foodQ)}">
    <div class="filters">${[['all', 'Todos'], ['ok', '✅ Sí'], ['mod', '⚠️ Moderación'], ['no', '⛔ No']].map(([k, l]) => `<button data-ff="${k}" class="${foodFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let cat = '';
  for (const f of list) {
    if (f.cat !== cat) { cat = f.cat; h += `<h2 class="cat">${cat}</h2>`; }
    h += `<button class="food" data-food="${f.id}"><span class="e">${f.e}</span><span class="n">${esc(f.n)}<small>${f.c} g carbos netos / 100 g${excl.includes(f.id) ? ' · 🚫 excluido del menú' : ''}</small></span><span class="dot ${f.s}"></span></button>`;
  }
  if (!list.length) h += '<p class="muted">No hay resultados.</p>';
  $('#view').innerHTML = h;
  const q2 = $('#q'); q2.oninput = () => { foodQ = q2.value; const p = q2.selectionStart; renderFoods(); const n = $('#q'); n.focus(); n.setSelectionRange(p, p); };
}

function openFood(id) {
  const f = FOOD[id], [lbl, cls] = STATUS[f.s];
  openSheet(`<h3>${f.e} ${esc(f.n)}</h3><span class="tag ${cls}">${lbl}</span>
    <div class="card" style="margin-top:12px"><label style="margin-top:0">Cantidad (g)</label><input id="grams" type="number" inputmode="numeric" value="100">
    <div class="chips" id="fm" style="margin-top:12px"></div></div>
    <button class="btn big ${excl.includes(id) ? 'done' : ''}" data-xfood="${id}">${excl.includes(id) ? '✓ Excluido del menú (tocar para permitir)' : '🚫 No quiero esto en mi menú'}</button>
    <p class="muted">Los carbohidratos son <b>netos</b> (hidratos − fibra). Valores aproximados por 100 g.</p>`);
  const upd = () => {
    const r = (parseFloat($('#grams').value) || 0) / 100;
    $('#fm').innerHTML = `<span class="chip c">${(f.c * r).toFixed(1)} g carbos netos</span><span class="chip">${Math.round(f.k * r)} kcal</span><span class="chip">${(f.p * r).toFixed(1)} g prot</span><span class="chip">${(f.f * r).toFixed(1)} g grasa</span>`;
  };
  $('#grams').oninput = upd; upd();
}

function renderShop() {
  ensurePlan();
  const tot = {};
  plan.days.forEach(d => SLOTS.forEach(([s]) => d[s] && DISH[d[s]].ing.forEach(([id, g]) => tot[id] = (tot[id] || 0) + g)));
  const ids = Object.keys(tot).sort((a, b) => FOOD[a].cat.localeCompare(FOOD[b].cat) || FOOD[a].n.localeCompare(FOOD[b].n));
  let h = '<p class="muted">Todo lo que necesitas para los 7 días del menú actual.</p>', cat = '';
  for (const id of ids) {
    const f = FOOD[id], key = plan.week + '|' + id;
    if (f.cat !== cat) { cat = f.cat; h += `<h2 class="cat">${cat}</h2>`; }
    const g = Math.round(tot[id] / 10) * 10 || 10;
    h += `<label class="shop ${shopDone[key] ? 'got' : ''}" style="margin:0 0 6px;color:var(--ink);font-size:16px"><input type="checkbox" data-shop="${key}" ${shopDone[key] ? 'checked' : ''}><span>${f.e} ${esc(f.n)}</span><b>${g >= 1000 ? (g / 1000).toFixed(1) + ' kg' : g + ' g'}</b></label>`;
  }
  $('#view').innerHTML = h;
}

function renderProfile() {
  const p = profile || { name: '', sex: 'f', age: 35, height: 165, weight: 70, activity: 1.375, goal: 0.8, carbs: 25 };
  const T = targets();
  const opt = (v, cur, l) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`;
  $('#view').innerHTML = `<div class="card" style="display:flex;gap:14px;align-items:center"><div class="avatar">${esc((p.name || '?')[0].toUpperCase())}</div>
    <div><b style="font-size:18px">${esc(p.name || 'Tu perfil')}</b><div class="muted">${profile ? T.k + ' kcal · ' + T.c + ' g carbos' : 'Sin configurar'}</div></div></div>
    <div class="card"><label style="margin-top:0">Nombre</label><input id="pn" value="${esc(p.name)}">
    <div class="two"><div><label>Sexo</label><select id="ps">${opt('f', p.sex, 'Mujer')}${opt('m', p.sex, 'Hombre')}</select></div><div><label>Edad</label><input id="pa" type="number" inputmode="numeric" value="${p.age}"></div></div>
    <div class="two"><div><label>Altura (cm)</label><input id="ph" type="number" inputmode="numeric" value="${p.height}"></div><div><label>Peso (kg)</label><input id="pw" type="number" inputmode="decimal" value="${p.weight}"></div></div>
    <label>Actividad</label><select id="pc">${opt(1.2, p.activity, 'Sedentaria')}${opt(1.375, p.activity, 'Ligera (1-3 días/sem)')}${opt(1.55, p.activity, 'Moderada (3-5 días/sem)')}${opt(1.725, p.activity, 'Alta (6-7 días/sem)')}</select>
    <label>Objetivo</label><select id="pg">${opt(0.8, p.goal, 'Perder peso')}${opt(1, p.goal, 'Mantener')}${opt(1.1, p.goal, 'Ganar peso')}</select>
    <label>Límite de carbohidratos netos (g/día)</label><input id="pk" type="number" inputmode="numeric" value="${p.carbs}">
    <button class="btn p big" id="save">Guardar perfil</button></div>
    <div class="card"><b>🚫 Alimentos que no quiero en el menú</b><div class="muted">Toca una categoría para excluirla entera. Para un alimento concreto, ábrelo en la pestaña Alimentos.</div>
    <div class="filters" style="flex-wrap:wrap;overflow:visible">${[...new Set(FOODS.map(f => f.cat))].map(c => {
      const ids = FOODS.filter(f => f.cat === c).map(f => f.id), n = ids.filter(i => excl.includes(i)).length;
      return `<button data-xcat="${esc(c)}" class="${n === ids.length ? 'on' : ''}">${n === ids.length ? '🚫 ' : n ? '◐ ' : ''}${esc(c)}</button>`;
    }).join('')}</div>
    <div class="muted">${excl.length ? 'Excluidos: ' + excl.map(i => FOOD[i].n.toLowerCase()).join(', ') : 'No has excluido nada.'}</div></div>
    <div class="card"><b>Tus objetivos diarios</b><div class="chips" style="margin-top:8px"><span class="chip">${T.k} kcal</span><span class="chip c">${T.c} g carbos</span><span class="chip">${T.p} g proteína</span><span class="chip">${T.f} g grasa</span></div></div>
    <div class="card"><b>Aplicación</b><div class="muted">Versión ${VERSION}</div><button class="btn big" id="upd">🔄 Buscar actualización</button></div>`;
}

function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#title').textContent = { menu: 'Menú semanal', recipes: 'Recetas', foods: 'Alimentos', shop: 'Lista de la compra', profile: 'Perfil' }[tab];
  ({ menu: renderMenu, recipes: renderRecipes, foods: renderFoods, shop: renderShop, profile: renderProfile })[tab]();
  window.scrollTo(0, 0);
}

// ---------- eventos ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button,input[data-shop]'); if (!t) return;
  const d = t.dataset;
  if (d.tab) { tab = d.tab; render(); }
  else if (d.day) { selDay = +d.day; renderMenu(); }
  else if (d.done) { const k = plan.week + '|' + selDay + '|' + d.done; done[k] = !done[k]; store.set('done', done); renderMenu(); }
  else if (d.swap) openSwap(d.swap);
  else if (d.pick) {
    const slot = $('#sheet').dataset.slot, ids = slotIds(slot);
    let id = d.pick;
    if (id === '__rnd') { const o = ids.filter(x => x !== plan.days[selDay][slot]); id = o[Math.floor(Math.random() * o.length)]; }
    plan.days[selDay][slot] = id === '__none' ? null : id; store.set('plan', plan); closeSheet(); renderMenu(); toast(id === '__none' ? 'Comida vacía' : 'Plato cambiado');
  }
  else if (d.swapall !== undefined) openSwap($('#sheet').dataset.slot, d.swapall === '1');
  else if (d.rec) openRecipe(d.rec);
  else if (d.rf) { recSlot = d.rf; renderRecipes(); }
  else if (d.rday !== undefined) { $('#sheet').dataset.rday = d.rday; document.querySelectorAll('#rdays button').forEach(b => b.classList.toggle('on', b === t)); }
  else if (d.rslot) { $('#sheet').dataset.rslot = d.rslot; document.querySelectorAll('#rslots button').forEach(b => b.classList.toggle('on', b === t)); }
  else if (d.radd) {
    const day = +$('#sheet').dataset.rday, slot = $('#sheet').dataset.rslot;
    plan.days[day][slot] = d.radd; store.set('plan', plan); selDay = day; closeSheet(); tab = 'menu'; render();
    toast('Añadido: ' + DAYS[day] + ' · ' + SLOTS.find(s => s[0] === slot)[1].toLowerCase());
  }
  else if (t.id === 'clearweek') {
    if (confirm('¿Vaciar todo el menú de la semana para montarlo a mano?')) { plan.days = Array.from({ length: 7 }, () => ({})); store.set('plan', plan); done = {}; store.set('done', done); renderMenu(); }
  }
  else if (d.xcat) {
    const ids = FOODS.filter(f => f.cat === d.xcat).map(f => f.id), all = ids.every(i => excl.includes(i));
    if (setExcl(all ? excl.filter(i => !ids.includes(i)) : [...new Set([...excl, ...ids])])) { renderProfile(); toast(all ? 'Categoría permitida' : 'Menú actualizado sin ' + d.xcat.toLowerCase()); }
  }
  else if (d.xfood) {
    const id = d.xfood;
    if (setExcl(excl.includes(id) ? excl.filter(i => i !== id) : [...excl, id])) { openFood(id); renderFoods(); toast(excl.includes(id) ? 'Excluido del menú' : 'Permitido otra vez'); }
  }
  else if (d.ff) { foodFilter = d.ff; renderFoods(); }
  else if (d.food) openFood(d.food);
  else if (d.shop !== undefined) { shopDone[d.shop] = t.checked; store.set('shop', shopDone); renderShop(); }
  else if (t.id === 'regen') { if (confirm('¿Generar un menú nuevo para toda la semana?')) { genPlan(); done = {}; store.set('done', done); renderMenu(); } }
  else if (t.id === 'save') {
    const n = id => $('#' + id).value;
    const p = { name: n('pn').trim(), sex: n('ps'), age: +n('pa'), height: +n('ph'), weight: +n('pw'), activity: +n('pc'), goal: +n('pg'), carbs: +n('pk') || 25 };
    if (!(p.age > 0 && p.height > 0 && p.weight > 0)) return toast('Revisa edad, altura y peso');
    profile = p; store.set('profile', p); renderProfile(); toast('Perfil guardado ✓');
  }
  else if (t.id === 'upd') checkUpdate();
});
$('#backdrop').onclick = closeSheet;

// ---------- actualizaciones ----------
let reg = null;
async function checkUpdate(manual = true) {
  if (!reg) return manual && toast('Las actualizaciones solo funcionan con la app instalada desde internet');
  try {
    await reg.update();
    if (reg.installing || reg.waiting) toast('Descargando versión nueva…');
    else if (manual) toast('Ya tienes la última versión (v' + VERSION + ')');
  } catch { manual && toast('Sin conexión'); }
}
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => { reg = r; checkUpdate(false); }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had) toast('Nueva versión lista', 'Actualizar', () => location.reload());
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(false); });
}

render();
