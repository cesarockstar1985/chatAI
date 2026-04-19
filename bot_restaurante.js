/**
 * Bot de Telegram para Restaurante con IA (Groq + Google Sheets + PostgreSQL)
 * =============================================================================
 * Requisitos:
 *   npm install node-telegram-bot-api groq-sdk googleapis pg dotenv
 */

require("dotenv").config();

const TelegramBot     = require("node-telegram-bot-api");
const Groq            = require("groq-sdk");
const { leerMenu, formatearMenu } = require("./src/sheets");
const { NOMBRE_RESTAURANTE, promptSistema, promptEdicion } = require("./src/prompts");
const { crearFormulario } = require("./src/formulario");
const { inicializarDB, guardarPedido, completarPedido, obtenerPedido, actualizarPedido, cancelarPedido, listarPedidos } = require("./src/db");
const { estaAbierto, mensajeHorario, HORARIOS } = require("./src/horarios");
const { crearEdicion } = require("./src/edicion");

// ─────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────
const TELEGRAM_TOKEN          = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY            = process.env.GROQ_API_KEY;

// ─────────────────────────────────────────────

const bot  = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_API_KEY });
const { preguntaPaso, iniciarFormulario, procesarRespuesta, formularioUsuarios } = crearFormulario(bot, completarPedido);
const { iniciarEdicion, procesarEdicion } = crearEdicion(bot, groq, { obtenerPedido, actualizarPedido, leerMenu, formatearMenu, promptEdicion });

// ── Estado en memoria ─────────────────────────
const historialUsuarios = new Map(); // userId → mensajes

// ── Helpers ───────────────────────────────────

function obtenerHistorial(userId) {
  if (!historialUsuarios.has(userId)) historialUsuarios.set(userId, []);
  return historialUsuarios.get(userId);
}

function limpiarHistorial(userId) {
  historialUsuarios.set(userId, []);
}

// ── Comandos ─────────────────────────────────

bot.onText(/\/start/, (msg) => {
  limpiarHistorial(msg.from.id);
  formularioUsuarios.delete(msg.from.id);
  const saludo = `👋 ¡Hola! Bienvenido/a a *${NOMBRE_RESTAURANTE}*.\n\n`;

  if(!estaAbierto()){
    return bot.sendMessage( msg.chat.id,  saludo + mensajeHorario());
  }

  bot.sendMessage(
    msg.chat.id,
    `${saludo}Puedo ayudarte con nuestro menú, precios, horarios y pedidos. ¿En qué te puedo ayudar hoy?`,
    { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } }
  );
});

bot.onText(/\/menu/, async (msg) => {
  try {
    const menu  = await leerMenu();
    const texto = formatearMenu(menu);
    bot.sendMessage(
      msg.chat.id,
      `🍽️ *Menú de ${NOMBRE_RESTAURANTE}*\n\`\`\`${texto}\`\`\`\n🛵 Delivery disponible — mínimo $20.000`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("Error leyendo menú:", e.message);
    bot.sendMessage(msg.chat.id, "No pude cargar el menú en este momento. Intentá de nuevo.");
  }
});

bot.onText(/\/horarios/, (msg) => {
  bot.sendMessage(msg.chat.id, `🕐 *Horarios de atención*\n${HORARIOS}`, { parse_mode: "Markdown" });
});

bot.onText(/\/reset/, (msg) => {
  limpiarHistorial(msg.from.id);
  formularioUsuarios.delete(msg.from.id);
  bot.sendMessage(msg.chat.id, "🔄 Conversación reiniciada. ¿En qué te puedo ayudar?", {
    reply_markup: { remove_keyboard: true },
  });
});

bot.onText(/\/mispedidos/, async (msg) => {
  try {
    const pedidos = await listarPedidos(msg.from.id);
    if (pedidos.length === 0) {
      return bot.sendMessage(msg.chat.id, "No tenés pedidos registrados todavía.");
    }
    let texto = "📋 *Tus últimos pedidos:*\n\n";
    for (const p of pedidos) {
      const fecha    = new Date(p.creado_en).toLocaleString("es-AR");
      const editable = p.estado === "pendiente"
        ? `\n✏️ /editarpedido\\_${p.id}   🗑️ /cancelarpedido\\_${p.id}`
        : "";
      texto += `*#${p.id}* — ${fecha}\n${p.items}\nTotal: $${p.total.toLocaleString()} — Estado: *${p.estado}*${editable}\n\n`;
    }
    bot.sendMessage(msg.chat.id, texto, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Error consultando pedidos:", e.message);
    bot.sendMessage(msg.chat.id, "No pude consultar tus pedidos. Intentá de nuevo.");
  }
});

bot.onText(/\/editarpedido_(\d+)/, async (msg, match) => {
  msg.match = match;
  await iniciarEdicion(msg);
});

bot.onText(/\/cancelarpedido_(\d+)/, async (msg, match) => {
  const userId   = msg.from.id;
  const pedidoId = parseInt(match[1]);
  const pedido   = await obtenerPedido(pedidoId, userId);

  if (!pedido) return bot.sendMessage(msg.chat.id, "No encontré ese pedido o no te pertenece.");

  const minutos = (Date.now() - new Date(pedido.creado_en).getTime()) / 60000;
  if (minutos > 5) {
    return bot.sendMessage(msg.chat.id, "❌ Ya pasaron los 5 minutos para cancelar. Contactá al local directamente.");
  }
  if (pedido.estado !== "pendiente") {
    return bot.sendMessage(msg.chat.id, `❌ El pedido #${pedidoId} ya está en *${pedido.estado}* y no puede cancelarse.`, { parse_mode: "Markdown" });
  }

  await cancelarPedido(pedidoId);
  bot.sendMessage(msg.chat.id, `🗑️ Pedido *#${pedidoId}* cancelado correctamente.`, { parse_mode: "Markdown" });
});

// ── Ubicación ─────────────────────────────────

bot.on("location", async (msg) => {
  const userId     = msg.from.id;
  const formulario = formularioUsuarios.get(userId);
  if (!formulario || formulario.paso !== "ubicacion") return;

  formulario.datos.latitud   = msg.location.latitude;
  formulario.datos.longitud  = msg.location.longitude;
  formulario.datos.direccion = `${msg.location.latitude}, ${msg.location.longitude}`;
  formulario.paso = "referencia";
  formularioUsuarios.set(userId, formulario);
  preguntaPaso("referencia", msg.chat.id);
});

// ── Mensajes de texto libre ───────────────────

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId    = msg.chat.id;
  const userId    = msg.from.id;
  const username  = msg.from.username || msg.from.first_name || "cliente";
  const historial = obtenerHistorial(userId);

  // ── Formulario de datos de entrega ──
  if (await procesarRespuesta(msg, chatId, userId)) return;

  // ── Modo edición de pedido ──
  if (await procesarEdicion(msg, chatId, userId)) return;

  // ── Flujo normal con IA ──

  // Validar horario antes de procesar pedidos
  const mensajeLower = msg.text.toLowerCase();
  const esPedido = mensajeLower.includes("quiero") || mensajeLower.includes("pedir") ||
                   mensajeLower.includes("pedido") || mensajeLower.includes("confirmar") ||
                   mensajeLower.includes("ordenar") || mensajeLower.includes("dame");

  if (esPedido && !estaAbierto()) {
    return bot.sendMessage(chatId, mensajeHorario());
  }

  historial.push({ role: "user", content: msg.text });

  try {
    bot.sendChatAction(chatId, "typing");

    const menu      = await leerMenu();
    const menuTexto = formatearMenu(menu);
    const abierto = estaAbierto();
    const sistemaPrompt = promptSistema(abierto, menuTexto);

    const respuesta = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1000,
      messages: [
        { role: "system", content: sistemaPrompt },
        ...historial.slice(-20),
      ],
    });

    const textoRespuesta = respuesta.choices[0].message.content;
    historial.push({ role: "assistant", content: textoRespuesta });

    const matchPedido = textoRespuesta.match(/PEDIDO_CONFIRMADO:\s*(.+?)\s*\|\s*TOTAL:\s*(\d+)/i);

    if (matchPedido) {
      const items    = matchPedido[1].trim();
      const total    = parseInt(matchPedido[2]);

      if (total < 20000) {
        const falta = (20000 - total).toLocaleString();
        await bot.sendMessage(chatId,
          `🛵 Tu pedido llega a $${total.toLocaleString()}. Te faltan $${falta} para el mínimo de delivery ($20.000). ¿Querés agregar algo más?`
        );
        return;
      }

      const pedidoId = await guardarPedido(userId, username, items, total);

      const textoLimpio = textoRespuesta.replace(/PEDIDO_CONFIRMADO:.+/i, "").trim();
      if (textoLimpio) await bot.sendMessage(chatId, textoLimpio);

      await bot.sendMessage(chatId,
        `✅ *Pedido #${pedidoId} registrado.*\nAhora necesito algunos datos para la entrega.`,
        { parse_mode: "Markdown" }
      );

      await iniciarFormulario(userId, chatId, pedidoId);

    } else {
      bot.sendMessage(chatId, textoRespuesta);
    }

  } catch (error) {
    console.error("Error:", error.message);
    bot.sendMessage(chatId, "Lo siento, hubo un problema. Intentá de nuevo en un momento.");
  }
});

// ── Inicio ────────────────────────────────────

inicializarDB().then(() => {
  console.log(`✅ Bot de ${NOMBRE_RESTAURANTE} corriendo con Groq + Sheets + PostgreSQL...`);
});