const esperandoEdicion = new Map();

function crearEdicion(bot, groq, { obtenerPedido, actualizarPedido, leerMenu, formatearMenu, promptEdicion }) {

  async function iniciarEdicion(msg) {
    const userId   = msg.from.id;
    const pedidoId = parseInt(msg.match[1]);
    const pedido   = await obtenerPedido(pedidoId, userId);

    if (!pedido) return bot.sendMessage(msg.chat.id, "No encontré ese pedido o no te pertenece.");
    if (pedido.estado !== "pendiente") {
      return bot.sendMessage(msg.chat.id, `❌ El pedido #${pedidoId} ya está en *${pedido.estado}* y no puede modificarse.`, { parse_mode: "Markdown" });
    }

    esperandoEdicion.set(userId, pedidoId);
    bot.sendMessage(
      msg.chat.id,
      `✏️ Pedido *#${pedidoId}* actual:\n_${pedido.items}_\n\nContame qué querés cambiar.`,
      { parse_mode: "Markdown" }
    );
  }

  async function procesarEdicion(msg, chatId, userId) {
    if (!esperandoEdicion.has(userId)) return false;

    const pedidoId = esperandoEdicion.get(userId);
    const pedido   = await obtenerPedido(pedidoId, userId);

    if (!pedido || pedido.estado !== "pendiente") {
      esperandoEdicion.delete(userId);
      bot.sendMessage(chatId, "El pedido ya no está disponible para editar.");
      return true;
    }

    try {
      bot.sendChatAction(chatId, "typing");
      const menu      = await leerMenu();
      const menuTexto = formatearMenu(menu);
      const prompt    = promptEdicion(pedido.items, pedido.total, menuTexto);

      const respuesta = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1000,
        messages: [
          { role: "system", content: prompt },
          { role: "user",   content: msg.text },
        ],
      });

      const textoRespuesta = respuesta.choices[0].message.content;
      const matchEdicion   = textoRespuesta.match(/PEDIDO_ACTUALIZADO:\s*(.+?)\s*\|\s*TOTAL:\s*(\d+)/i);

      if (matchEdicion) {
        const nuevosItems = matchEdicion[1].trim();
        const nuevoTotal  = parseInt(matchEdicion[2]);
        await actualizarPedido(pedidoId, nuevosItems, nuevoTotal);
        esperandoEdicion.delete(userId);

        const textoLimpio = textoRespuesta.replace(/PEDIDO_ACTUALIZADO:.+/i, "").trim();
        if (textoLimpio) await bot.sendMessage(chatId, textoLimpio);
        await bot.sendMessage(chatId, `✅ *Pedido #${pedidoId} actualizado correctamente.*`, { parse_mode: "Markdown" });
      } else {
        bot.sendMessage(chatId, textoRespuesta);
      }
    } catch (e) {
      console.error("Error editando pedido:", e.message);
      bot.sendMessage(chatId, "Hubo un error al editar el pedido. Intentá de nuevo.");
    }
    return true;
  }

  return { iniciarEdicion, procesarEdicion };
}

module.exports = { crearEdicion };
