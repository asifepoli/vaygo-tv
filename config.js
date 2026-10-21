// VERSÃO: 2026-10-21-01 | liga as TVs à aba Publicação da planilha (CSV publicado)
window.VAYGO_CONFIG = {
  // Endereço da aba "Publicação" publicada como CSV no Google Sheets.
  // Deixe vazio ('') para usar o arquivo campanhas.csv deste repositório (modo teste).
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSffPqVq9YEoZ9-RepWiBXYBZuBmKhJw4tUdLiT-SX-yG5v3XYI3echy4T2OKxn9fIFdvujkh8-3m1A/pub?gid=682768418&single=true&output=csv',

  // Arquivo de campanhas usado quando SHEET_CSV_URL está vazio
  LOCAL_CSV: 'campanhas.csv',

  // Pasta das artes dentro do repositório
  ARTES_DIR: 'artes/',

  // De quanto em quanto tempo a TV confere a planilha (milissegundos). 300000 = 5 minutos
  REFRESH_MS: 300000,

  // Recarrega a página inteira de tempos em tempos para evitar travamento (milissegundos). 21600000 = 6 horas
  RELOAD_MS: 21600000,

  // Tempo padrão de cada arte, se a planilha não informar (segundos)
  DEFAULT_SECONDS: 10
};
