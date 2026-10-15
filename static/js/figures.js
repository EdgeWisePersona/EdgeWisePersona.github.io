// Interactive sections for the EdgeWisePersona page: a session explorer over
// three real users of the dataset (static/data/sample.json, CC BY 4.0) and the
// benchmark results as a chart. Plain SVG and DOM, no libraries.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var EDGE = '#2563eb', LARGE = '#64748b';

  // Benchmark results (paper Table 3): triggers, actions, exact-match, Jaccard (%).
  var MODELS = [
    ['Phi-4-mini-4B', 'edge', 2.4, 0.0, 0.0, 23.1],
    ['Llama-3.2-3B', 'edge', 76.8, 1.1, 1.1, 39.9],
    ['Qwen2.5-3B', 'edge', 77.3, 1.0, 0.8, 55.4],
    ['Gemma-3-4B', 'edge', 52.8, 3.5, 2.3, 66.2],
    ['Gemini-2.5-Flash', 'large', 94.4, 45.4, 43.9, 89.6],
    ['GPT-4o', 'large', 98.4, 35.6, 35.0, 85.4],
    ['DeepSeek-V3', 'large', 58.5, 31.9, 26.9, 81.9]
  ];
  var METRICS = [
    { id: 2, label: 'Triggers', long: 'trigger accuracy (exact match on the routine’s conditions)' },
    { id: 3, label: 'Actions', long: 'action accuracy (exact match on the device settings)' },
    { id: 4, label: 'Routines, exact', long: 'routine prediction, exact match' },
    { id: 5, label: 'Routines, Jaccard', long: 'routine prediction, Jaccard overlap' }
  ];
  var DEVICE = { ac: 'AC', lights: 'Lights', speaker: 'Speaker', tv: 'TV', security: 'Security' };

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function html(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function chips(parent, label, items, initial, onPick) {
    var row = html('div', 'chip-row', null, parent);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label);
    html('span', 'chip-label', label, row);
    var buttons = items.map(function (it) {
      var b = html('button', 'chip', it.label, row);
      b.type = 'button';
      b.setAttribute('aria-pressed', it.id === initial ? 'true' : 'false');
      b.addEventListener('click', function () {
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        onPick(it.id);
      });
      return b;
    });
    return row;
  }
  function tooltip(card) {
    var t = html('div', 'viz-tooltip', null, card);
    t.setAttribute('role', 'status');
    return {
      show: function (content, evt) {
        t.innerHTML = content;
        t.classList.add('is-on');
        var box = card.getBoundingClientRect();
        var x = evt.clientX - box.left + 14, y = evt.clientY - box.top + 14;
        if (x + t.offsetWidth > box.width - 8) x = evt.clientX - box.left - t.offsetWidth - 14;
        if (y + t.offsetHeight > box.height - 8) y = evt.clientY - box.top - t.offsetHeight - 14;
        t.style.left = Math.max(8, x) + 'px';
        t.style.top = Math.max(8, y) + 'px';
      },
      hide: function () { t.classList.remove('is-on'); }
    };
  }
  function words(s) { return String(s).replace(/_/g, ' '); }
  function actionText(dev, a) {
    var parts = [];
    if (dev === 'ac') parts = [a.mode, a.temperature + '°C', 'fan ' + a.fan_speed];
    else if (dev === 'lights') parts = [a.brightness + '%', a.color, a.mode];
    else if (dev === 'speaker') parts = ['volume ' + a.volume, a.equalizer];
    else Object.keys(a).forEach(function (k) { parts.push(words(k) + ' ' + a[k]); });
    return parts.filter(function (p) { return p != null && p !== 'undefined'; }).map(words).join(', ');
  }

  // ------------------------------------------------------------ explorer
  function explorer(root, data) {
    var state = { user: 0, session: 0 };
    var head = html('div', null, null, root);
    chips(head, 'User', data.users.map(function (u, i) { return { id: i, label: u.character.split(' ')[0] }; }), 0,
      function (i) { state.user = i; state.session = 0; render(); });
    var persona = html('p', 'ewp-persona', null, root);
    var grid = html('div', 'ewp-grid', null, root);
    var left = html('div', 'ewp-routines', null, grid);
    var right = html('div', 'ewp-session', null, grid);

    function render() {
      var u = data.users[state.user];
      persona.textContent = u.character;
      while (right.firstChild) right.removeChild(right.firstChild);
      chips(right, 'Session', u.sessions.map(function (s, i) { return { id: i, label: String(i + 1) }; }), state.session,
        function (i) { state.session = i; drawSession(); });
      var body = html('div', null, null, right);
      function drawSession() {
        var s = u.sessions[state.session], applied = s.applied_routines.length ? s.applied_routines[0] : null;
        while (body.firstChild) body.removeChild(body.firstChild);
        var ctx = html('div', 'ewp-context', null, body);
        Object.keys(s.meta).forEach(function (k) { html('span', 'ewp-tag', words(s.meta[k]), ctx); });
        var chat = html('div', 'ewp-chat', null, body);
        s.messages.forEach(function (m) { html('div', 'ewp-msg ' + (m.role === 'user' ? 'is-user' : 'is-assistant'), m.text, chat); });
        var verdict = html('div', 'viz-insight', null, body);
        verdict.innerHTML = applied === null
          ? '<strong>Spontaneous session.</strong> It follows none of the routines; a model has to tell these apart from habits.'
          : 'This session expresses <strong>routine ' + (applied + 1) + '</strong>: its context matches the routine’s triggers and the user asks for its actions. Benchmarked models see only sessions like this one and must recover the routines.';
        drawRoutines(applied, s.meta);
      }
      drawSession();
    }
    function drawRoutines(applied, meta) {
      var u = data.users[state.user];
      while (left.firstChild) left.removeChild(left.firstChild);
      html('div', 'ewp-col-title', 'Routines in this profile', left);
      u.routines.forEach(function (r, i) {
        var card = html('div', 'ewp-routine' + (i === applied ? ' is-applied' : ''), null, left);
        html('div', 'ewp-routine-title', 'Routine ' + (i + 1) + (i === applied ? ' · this session' : ''), card);
        var when = html('div', 'ewp-when', null, card);
        html('span', 'ewp-label', 'When', when);
        Object.keys(r.triggers).forEach(function (k) {
          var match = i === applied && meta[k] === r.triggers[k];
          html('span', 'ewp-tag' + (match ? ' is-match' : ''), words(r.triggers[k]), when);
        });
        var then = html('div', 'ewp-then', null, card);
        html('span', 'ewp-label', 'Then', then);
        var list = html('ul', null, null, then);
        Object.keys(r.actions).forEach(function (dev) {
          if (r.actions[dev]) html('li', null, (DEVICE[dev] || dev) + ': ' + actionText(dev, r.actions[dev]), list);
        });
      });
    }
    render();
  }

  // ------------------------------------------------------------ results
  function results(card, W) {
    var narrow = W < 560;
    var state = card._state || (card._state = { metric: 3 });
    var labelW = narrow ? 128 : 160, right = 52, top = 28, rowH = 30, groupH = 28;
    chips(card, 'Metric', METRICS.map(function (m) { return { id: m.id, label: m.label }; }), state.metric,
      function (id) { state.metric = id; draw(); });
    var svg = el('svg', { class: 'viz-svg', role: 'img' }, card);
    var tip = tooltip(card);
    var lg = html('div', 'viz-legend', null, card);
    lg.innerHTML = '<span class="key"><span class="swatch" style="background:' + EDGE + '"></span>Edge-device model (3-4B)</span>' +
      '<span class="key"><span class="swatch" style="background:' + LARGE + '"></span>Large model</span>';
    var insight = html('div', 'viz-insight', null, card);
    insight.setAttribute('aria-live', 'polite');
    var details = html('details', 'viz-table-toggle', null, card);
    html('summary', null, 'Show as a table', details);
    var table = html('table', 'table is-narrow is-striped', null, details);
    table.innerHTML = '<thead><tr><th>Model</th><th>Triggers</th><th>Actions</th><th>Routines, exact</th><th>Routines, Jaccard</th></tr></thead><tbody>' +
      MODELS.map(function (m) { return '<tr><td>' + m[0] + '</td><td>' + m[2].toFixed(1) + '</td><td>' + m[3].toFixed(1) + '</td><td>' + m[4].toFixed(1) + '</td><td>' + m[5].toFixed(1) + '</td></tr>'; }).join('') + '</tbody>';

    function draw() {
      var col = state.metric, meta = METRICS.filter(function (m) { return m.id === col; })[0];
      var groups = [['edge', 'Edge-device models'], ['large', 'Large models']];
      var H = top + groups.length * groupH + MODELS.length * rowH + 6;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      function X(v) { return labelW + v / 100 * (W - labelW - right); }
      el('title', {}, svg).textContent = meta.long + ': ' + MODELS.map(function (m) { return m[0] + ' ' + m[col] + '%'; }).join(', ');
      (narrow ? [0, 50, 100] : [0, 20, 40, 60, 80, 100]).forEach(function (v) {
        el('line', { class: v === 0 ? 'zero-line' : 'grid-line', x1: X(v), x2: X(v), y1: top - 6, y2: H }, svg);
        el('text', { class: 'tick-label', x: X(v), y: top - 12, 'text-anchor': 'middle' }, svg).textContent = v + '%';
      });
      var y = top;
      groups.forEach(function (g) {
        el('text', { x: 0, y: y + 18, style: 'font-weight:600;fill:var(--text-secondary);font-size:12px' }, svg).textContent = g[1];
        y += groupH;
        MODELS.filter(function (m) { return m[1] === g[0]; }).sort(function (a, b) { return b[col] - a[col]; }).forEach(function (m) {
          var v = m[col], color = g[0] === 'edge' ? EDGE : LARGE;
          el('text', { class: 'row-label', x: labelW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end' }, svg).textContent = m[0];
          var bar = el('rect', { x: X(0), y: y + 5, width: Math.max(1.5, X(v) - X(0)), height: rowH - 10, rx: 4, fill: color }, svg);
          el('text', { class: 'value-label', x: X(v) + 6, y: y + rowH / 2 + 4 }, svg).textContent = v.toFixed(1) + '%';
          var hit = el('rect', { class: 'hit', x: 0, y: y, width: W, height: rowH }, svg);
          hit.addEventListener('mousemove', function (e) {
            tip.show('<strong>' + m[0] + '</strong> · ' + (g[0] === 'edge' ? 'edge-device model' : 'large model') +
              '<br>Triggers ' + m[2].toFixed(1) + '% · actions ' + m[3].toFixed(1) + '%<br>Routines ' + m[4].toFixed(1) + '% exact, ' + m[5].toFixed(1) + '% Jaccard', e);
            bar.style.opacity = 0.75;
          });
          hit.addEventListener('mouseleave', function () { tip.hide(); bar.style.opacity = 1; });
          y += rowH;
        });
      });
      function best(group) {
        return MODELS.filter(function (m) { return m[1] === group; }).sort(function (a, b) { return b[col] - a[col]; })[0];
      }
      var be = best('edge'), bl = best('large');
      var text = {
        2: 'Edge models can often name when a routine fires: the best, ' + be[0] + ', reaches ' + be[2].toFixed(1) + '% against ' + bl[2].toFixed(1) + '% for ' + bl[0] + '.',
        3: 'Recovering the exact device settings is where edge models fail: the best reaches <strong>' + be[3].toFixed(1) + '%</strong>, against ' + bl[3].toFixed(1) + '% for ' + bl[0] + '.',
        4: 'Whole routines, exactly right, are nearly out of reach on device: ' + be[4].toFixed(1) + '% at best, against ' + bl[4].toFixed(1) + '% for ' + bl[0] + '.',
        5: 'Partial credit narrows the gap: ' + be[0] + ' overlaps ' + be[5].toFixed(1) + '% with the true routines, against ' + bl[5].toFixed(1) + '% for ' + bl[0] + '.'
      };
      insight.innerHTML = text[col];
    }
    draw();
  }

  function mount(card, chart) {
    var head = Array.prototype.slice.call(card.children, 0, 2), drawn = 0, timer = null;
    function render() {
      var cs = getComputedStyle(card);
      var w = Math.floor(card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      if (Math.abs(w - drawn) < 2) return;
      drawn = w;
      Array.prototype.slice.call(card.children).forEach(function (n) { if (head.indexOf(n) < 0) card.removeChild(n); });
      chart(card, Math.max(280, w));
    }
    render();
    window.addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(render, 150); });
  }

  function init() {
    var ex = document.getElementById('session-explorer'), res = document.getElementById('fig-results');
    if (res) mount(res, results);
    if (ex) fetch('static/data/sample.json').then(function (r) { return r.json(); }).then(function (d) { explorer(ex, d); })
      .catch(function () { html('p', 'viz-note', 'The session explorer could not load its data.', ex); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
