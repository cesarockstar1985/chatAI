require("dotenv").config();

const { google } = require("googleapis");

const GOOGLE_SHEET_ID         = process.env.GOOGLE_SHEET_ID;
const GOOGLE_CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH;

let menuCache = null;
let menuCacheTs = 0;
const MENU_CACHE_TTL = 5 * 60 * 1000;

async function leerMenu() {
  if (menuCache && Date.now() - menuCacheTs < MENU_CACHE_TTL) return menuCache;
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "Menu!A2:D100",
  });
  const filas = res.data.values || [];
  const menu = {};
  for (const [categoria, nombre, precio, disponible] of filas) {
    if (!nombre || disponible === "FALSE") continue;
    if (!menu[categoria]) menu[categoria] = [];
    menu[categoria].push({ nombre, precio: parseInt(precio) });
  }
  menuCache = menu;
  menuCacheTs = Date.now();
  return menu;
}

function formatearMenu(menu) {
  let texto = "";
  for (const [categoria, items] of Object.entries(menu)) {
    texto += `\n${categoria.toUpperCase()}\n`;
    for (const item of items) {
      texto += `- ${item.nombre.padEnd(20)} $${item.precio.toLocaleString()}\n`;
    }
  }
  return texto;
}

module.exports = { leerMenu, formatearMenu };
