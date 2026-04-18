/**
 * Bot de Telegram para Restaurante con IA (Claude)
 * =================================================
 * Requisitos:
 *   npm install node-telegram-bot-api @anthropic-ai/sdk
 *
 * Uso:
 *   1. Reemplazá TELEGRAM_TOKEN con el token de @BotFather
 *   2. Reemplazá ANTHROPIC_API_KEY con tu clave de Anthropic
 *   3. Personalizá NOMBRE_RESTAURANTE, MENU y HORARIOS
 *   4. Ejecutá: node bot_restaurante.js
 */

const TelegramBot = require("node-telegram-bot-api");
const Anthropic = require("@anthropic-ai/sdk");

// ─────────────────────────────────────────────
// CONFIGURACIÓN — editá estos valores
// ─────────────────────────────────────────────
const TELEGRAM_TOKEN    = "TU_TOKEN_DE_BOTFATHER";
const ANTHROPIC_API_KEY = "TU_API_KEY_DE_ANTHROPIC";

const NOMBRE_RESTAURANTE = "Restaurante Don Carlos";

const MENU = `
🍕 PIZZAS
- Muzzarella        $12.000
- Especial          $15.000
- 4 Quesos          $16.000

🍝 PASTAS
- Fideos al pesto   $13.000
- Ravioles de carne $14.000
- Ñoquis caseros    $13.500

🥗 ENSALADAS
- César             $9.000
- Mixta             $8.000

🥤 BEBIDAS
- Gaseosa 500ml     $3.500
- Agua              $2.500
- Cerveza           $5.000

🛵 Delivery disponible — mínimo $20.000
`;

const HORARIOS = `
Lunes a viernes: 12:00 – 15:00 y 19:00 – 23:00
Sábados y domingos: 12:00 – 23:30
`;

const FORMAS_DE_PAGO = "Efectivo, transferencia bancaria y tarjetas de débito/crédito.";

const SISTEMA_PROMPT = `
Sos el asistente virtual de ${NOMBRE_RESTAURANTE}.
Respondé siempre en español, de forma amable, breve y útil.

MENÚ ACTUAL:
${MENU}

HORARIOS:
${HORARIOS}

FORMAS DE PAGO:
${FORMAS_DE_PAGO}

Podés ayudar a los clientes con:
- Consultas sobre el menú y precios
- Información sobre horarios y delivery
- Tomar pedidos (confirmá los ítems y el total)
- Responder dudas generales del negocio

Si te preguntan algo que no sabés (como el estado de un pedido en curso),
deciles que se comuniquen directamente al local.
No inventes información que no está en este contexto.
`;
// ─────────────────────────────────────────────

const bot      = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Historial de conversación por usuario (en memoria)
const historialUsuarios = new Map();

// ── Helpers ──────────────────────────────────

function obtenerHistorial(userId) {
  if (!historialUsuarios.has(userId)) {
    historialUsuarios.set(userId, []);
  }
  return historialUsuarios.get(userId);
}

function limpiarHistorial(userId) {
  historialUsuarios.set(userId, []);
}

// ── Comandos ─────────────────────────────────

bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  limpiarHistorial(userId);

  bot.sendMessage(
    msg.chat.id,
    `👋 ¡Hola! Bienvenido/a a *${NOMBRE_RESTAURANTE}*.\n\nPuedo ayudarte con nuestro menú, precios, horarios y pedidos. ¿En qué te puedo ayudar hoy?`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/menu/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🍽️ *Menú de ${NOMBRE_RESTAURANTE}*\n${MENU}`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/horarios/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🕐 *Horarios de atención*\n${HORARIOS}`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/reset/, (msg) => {
  limpiarHistorial(msg.from.id);
  bot.sendMessage(msg.chat.id, "🔄 Conversación reiniciada. ¿En qué te puedo ayudar?");
});

// ── Mensajes de texto libre ───────────────────

bot.on("message", async (msg) => {
  // Ignorar comandos (ya los manejan los handlers anteriores)
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const historial = obtenerHistorial(userId);

  // Agregar mensaje del usuario al historial
  historial.push({ role: "user", content: msg.text });

  // Limitar a las últimas 20 interacciones
  const historialReciente = historial.slice(-20);

  try {
    // Indicador "escribiendo..."
    bot.sendChatAction(chatId, "typing");

    const respuesta = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SISTEMA_PROMPT,
      messages: historialReciente,
    });

    const textoRespuesta = respuesta.content[0].text;

    // Guardar respuesta en el historial
    historial.push({ role: "assistant", content: textoRespuesta });

    bot.sendMessage(chatId, textoRespuesta);

  } catch (error) {
    console.error("Error:", error.message);

    const mensajeError = error.status === 401
      ? "Error de autenticación con la IA. Verificá tu API key."
      : "Lo siento, hubo un problema al procesar tu mensaje. Intentá de nuevo en un momento.";

    bot.sendMessage(chatId, mensajeError);
  }
});

// ── Inicio ────────────────────────────────────

console.log(`✅ Bot de ${NOMBRE_RESTAURANTE} corriendo...`);