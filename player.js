// VERSÃO: 2026-10-24-01 | mantém a tela acordada (vídeo mudo minúsculo em repetição, para o Fire TV não entrar em espera); resto igual à versão 2026-10-21-01
(function (root) {
  'use strict';

  var CFG = (root.VAYGO_CONFIG) || {};
  var SHEET_URL = CFG.SHEET_CSV_URL || '';
  var LOCAL_CSV = CFG.LOCAL_CSV || 'campanhas.csv';
  var ARTES_DIR = CFG.ARTES_DIR || 'artes/';
  var REFRESH_MS = CFG.REFRESH_MS || 300000;
  var RELOAD_MS = CFG.RELOAD_MS || 21600000;
  var DEFAULT_SECONDS = CFG.DEFAULT_SECONDS || 10;

  // ---------- funções puras (testáveis) ----------

  function stripAccents(s) {
    var from = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
    var to = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC';
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var idx = from.indexOf(s.charAt(i));
      out += idx >= 0 ? to.charAt(idx) : s.charAt(i);
    }
    return out;
  }

  function normKey(s) {
    return stripAccents(String(s || '')).toLowerCase().replace(/^\s+|\s+$/g, '');
  }

  function detectDelimiter(text) {
    var first = text.split('\n')[0] || '';
    return (first.indexOf(';') >= 0 && first.indexOf(',') < 0) ? ';' : ',';
  }

  // Lê CSV simples (aspas, vírgulas dentro de aspas, quebras de linha)
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var delim = detectDelimiter(text);
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else { field += c; }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === delim) { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* ignora */ }
        else { field += c; }
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  // Converte as linhas do CSV em objetos, usando o cabeçalho
  function rowsToObjects(rows) {
    if (!rows.length) { return []; }
    var head = [];
    for (var h = 0; h < rows[0].length; h++) { head.push(normKey(rows[0][h])); }
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var obj = {};
      var any = false;
      for (var c = 0; c < head.length; c++) {
        var v = rows[r][c] === undefined ? '' : rows[r][c];
        obj[head[c]] = v.replace(/^\s+|\s+$/g, '');
        if (obj[head[c]] !== '') { any = true; }
      }
      if (any) { out.push(obj); }
    }
    return out;
  }

  // Aceita AAAA-MM-DD ou DD/MM/AAAA. Retorna número AAAAMMDD ou null.
  function parseDate(s) {
    s = String(s || '').replace(/^\s+|\s+$/g, '');
    if (!s) { return null; }
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) { return parseInt(m[1], 10) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[3], 10); }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { return parseInt(m[3], 10) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[1], 10); }
    return null;
  }

  function todayNumber(d) {
    d = d || new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function isActive(v) {
    var s = normKey(v);
    return s === 'sim' || s === 's' || s === 'true' || s === '1' || s === 'x' || s === 'ativo';
  }

  function artUrl(arte) {
    arte = String(arte || '').replace(/^\s+|\s+$/g, '');
    if (!arte) { return ''; }
    if (/^https?:\/\//i.test(arte)) { return arte; }
    return ARTES_DIR + arte;
  }

  // Seleciona o que deve passar agora neste ponto
  function selectCampaigns(objs, ponto, today) {
    var list = [];
    var p = normKey(ponto);
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      var op = normKey(o.ponto);
      if (op !== p && op !== 'todos') { continue; }
      if (!isActive(o.ativo)) { continue; }
      var ini = parseDate(o.inicio);
      var fim = parseDate(o.fim);
      if (ini !== null && today < ini) { continue; }
      if (fim !== null && today > fim) { continue; }
      var url = artUrl(o.arte);
      if (!url) { continue; }
      var secs = parseInt(o.segundos, 10);
      if (!(secs > 0)) { secs = DEFAULT_SECONDS; }
      list.push({ url: url, seconds: secs, anunciante: o.anunciante || '' });
    }
    return list;
  }

  var api = {
    parseCSV: parseCSV,
    rowsToObjects: rowsToObjects,
    parseDate: parseDate,
    selectCampaigns: selectCampaigns,
    todayNumber: todayNumber,
    isActive: isActive
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  // ---------- parte do navegador ----------

  var doc = root.document;
  var layers = [doc.getElementById('layerA'), doc.getElementById('layerB')];
  var vazio = doc.getElementById('vazio');
  var dbg = doc.getElementById('debug');

  function getParam(name) {
    var q = String(root.location.search || '').replace(/^\?/, '').split('&');
    for (var i = 0; i < q.length; i++) {
      var kv = q[i].split('=');
      if (decodeURIComponent(kv[0]) === name) {
        return decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      }
    }
    return '';
  }

  var PONTO = getParam('ponto') || root.VAYGO_PONTO || 'teste';
  var DEBUG = getParam('debug') === '1';

  var state = {
    list: [],
    idx: -1,
    front: 0,
    timer: null,
    lastOk: '',
    lastErr: '',
    shown: ''
  };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function nowText() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function renderDebug() {
    if (!DEBUG) { return; }
    dbg.style.display = 'block';
    dbg.innerHTML =
      'ponto: ' + PONTO + '<br>' +
      'artes ativas: ' + state.list.length + '<br>' +
      'passando: ' + state.shown + '<br>' +
      'planilha lida as: ' + (state.lastOk || '-') + '<br>' +
      'erro: ' + (state.lastErr || 'nenhum') + '<br>' +
      'hora: ' + nowText();
  }

  function httpGet(url, cb) {
    var xhr = new XMLHttpRequest();
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    xhr.open('GET', url + sep + 't=' + new Date().getTime(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) { return; }
      if (xhr.status >= 200 && xhr.status < 300 || (xhr.status === 0 && xhr.responseText)) {
        cb(null, xhr.responseText);
      } else {
        cb('HTTP ' + xhr.status);
      }
    };
    xhr.onerror = function () { cb('falha de rede'); };
    try { xhr.send(); } catch (e) { cb('erro ao enviar'); }
  }

  function loadCampaigns(useLocal) {
    var url = useLocal ? LOCAL_CSV : (SHEET_URL || LOCAL_CSV);
    httpGet(url, function (err, text) {
      if (err) {
        state.lastErr = (useLocal ? 'reserva: ' : 'planilha: ') + err;
        renderDebug();
        // planilha falhou e ainda não há nada na tela: tenta o arquivo de reserva do repositório
        if (!useLocal && SHEET_URL && state.list.length === 0) { loadCampaigns(true); }
        return; // senão mantém a lista anterior
      }
      var list = selectCampaigns(rowsToObjects(parseCSV(text)), PONTO, todayNumber());
      state.lastErr = '';
      state.lastOk = nowText();
      var changed = list.length !== state.list.length;
      if (!changed) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].url !== state.list[i].url || list[i].seconds !== state.list[i].seconds) { changed = true; break; }
        }
      }
      if (changed) {
        state.list = list;
        state.idx = -1;
        vazio.style.display = list.length ? 'none' : 'block';
        if (state.timer) { root.clearTimeout(state.timer); state.timer = null; }
        if (list.length) { next(); }
        else { layers[0].className = 'layer'; layers[1].className = 'layer'; }
      }
      renderDebug();
    });
  }

  function show(url, done) {
    var img = new Image();
    var fired = false;
    img.onload = function () {
      if (fired) { return; }
      fired = true;
      var back = 1 - state.front;
      layers[back].style.backgroundImage = 'url("' + url + '")';
      layers[back].className = 'layer on';
      layers[state.front].className = 'layer';
      state.front = back;
      done(true);
    };
    img.onerror = function () {
      if (fired) { return; }
      fired = true;
      state.lastErr = 'arte não abriu: ' + url;
      done(false);
    };
    img.src = url;
  }

  function next() {
    if (!state.list.length) { return; }
    state.idx = (state.idx + 1) % state.list.length;
    var item = state.list[state.idx];
    show(item.url, function (ok) {
      var wait = ok ? item.seconds * 1000 : 1500;
      if (ok) { state.shown = (item.anunciante || item.url) + ' (' + item.seconds + 's)'; }
      renderDebug();
      state.timer = root.setTimeout(next, wait);
    });
  }

  function tryFullscreen() {
    var el = doc.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (fn) { try { fn.call(el); } catch (e) { /* ignora */ } }
  }
  doc.onclick = tryFullscreen;
  doc.onkeydown = function (e) {
    if (e && (e.keyCode === 13 || e.keyCode === 70)) { tryFullscreen(); } // Enter ou F
  };

  // Mantém o aparelho acordado: vídeo mudo, minúsculo, em repetição (Fire TV/Android não dormem enquanto há vídeo tocando)
  function keepAwake() {
    try {
      var v = doc.createElement('video');
      v.setAttribute('muted', ''); v.muted = true;
      v.setAttribute('loop', ''); v.loop = true;
      v.setAttribute('autoplay', '');
      v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      v.style.cssText = 'position:fixed;right:0;bottom:0;width:4px;height:4px;opacity:0.02;pointer-events:none;z-index:0';
      v.src = 'data:video/mp4;base64,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';
      doc.body.appendChild(v);
      var tocar = function () { try { var p = v.play(); if (p && p.catch) { p.catch(function () {}); } } catch (e) { /* ignora */ } };
      tocar();
      root.setInterval(function () { if (v.paused) { tocar(); } }, 30000);
      var antigo = doc.onclick;
      doc.onclick = function (e) { tocar(); if (antigo) { antigo(e); } };
    } catch (e) { /* ignora: em navegador sem suporte nada muda */ }
  }
  keepAwake();

  loadCampaigns();
  root.setInterval(function () { loadCampaigns(); }, REFRESH_MS);
  root.setInterval(renderDebug, 1000);
  root.setTimeout(function () { root.location.reload(); }, RELOAD_MS);

})(typeof window !== 'undefined' ? window : this);
