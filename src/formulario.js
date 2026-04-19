const formularioUsuarios = new Map();
const datosClientes      = new Map();

const PASOS = {
  nombre:    { campo: "nombre",    siguiente: "telefono",  mensaje: "👤 ¿Cuál es tu nombre completo?" },
  telefono:  { campo: "telefono",  siguiente: "ubicacion", mensaje: "📞 ¿Cuál es tu número de teléfono?" },
  ubicacion: {
    campo: null, siguiente: "referencia",
    mensaje: "📍 Por favor compartí tu ubicación:",
    teclado: { keyboard: [[{ text: "📍 Compartir ubicación", request_location: true }]], resize_keyboard: true, one_time_keyboard: true },
  },
  referencia: {
    campo: "referencia", siguiente: "forma_pago",
    mensaje: "🏠 Agregá una referencia de tu dirección (ej: portón azul, piso 3 depto B):",
    teclado: { remove_keyboard: true },
  },
  forma_pago: {
    campo: "forma_pago", siguiente: null,
    mensaje: "💳 ¿Cómo vas a pagar?",
    teclado: {
      keyboard: [
        [{ text: "💵 Efectivo" }, { text: "🏦 Transferencia" }],
        [{ text: "💳 Tarjeta de débito" }, { text: "💳 Tarjeta de crédito" }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  },
};

function crearFormulario(bot, completarPedido) {

  function preguntaPaso(paso, chatId) {
    const config = PASOS[paso];
    if (!config) return;
    bot.sendMessage(chatId, config.mensaje, config.teclado ? { reply_markup: config.teclado } : {});
  }

  async function iniciarFormulario(userId, chatId, pedidoId) {
    const datosGuardados = datosClientes.get(userId);
    if (datosGuardados) {
      formularioUsuarios.set(userId, { pedidoId, paso: "confirmar_datos", datos: { ...datosGuardados } });
      await bot.sendMessage(
        chatId,
        `📋 Tengo tus datos guardados:\n\n` +
        `👤 ${datosGuardados.nombre}\n` +
        `📞 ${datosGuardados.telefono}\n` +
        `📍 ${datosGuardados.direccion}\n` +
        `🏠 ${datosGuardados.referencia}\n` +
        `💳 ${datosGuardados.forma_pago}\n\n` +
        `¿Usamos estos datos para la entrega?`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [[{ text: "✅ Sí, usar estos datos" }, { text: "✏️ No, cambiar datos" }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } else {
      formularioUsuarios.set(userId, { pedidoId, paso: "nombre", datos: {} });
      await bot.sendMessage(chatId, "📋 Necesito algunos datos para la entrega.", { reply_markup: { remove_keyboard: true } });
      preguntaPaso("nombre", chatId);
    }
  }

  async function finalizarPedido(chatId, userId, pedidoId, datos) {
    datosClientes.set(userId, datos);
    await completarPedido(pedidoId, datos);
    await bot.sendMessage(
      chatId,
      `✅ *¡Pedido #${pedidoId} completo!*\n\n` +
      `👤 ${datos.nombre}\n` +
      `📞 ${datos.telefono}\n` +
      `📍 ${datos.direccion}\n` +
      `🏠 ${datos.referencia}\n` +
      `💳 ${datos.forma_pago}\n\n` +
      `Pronto nos comunicamos para confirmar. ¡Gracias!`,
      { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } }
    );
  }

  async function procesarRespuesta(msg, chatId, userId) {
    const formulario = formularioUsuarios.get(userId);
    if (!formulario) return false;

    const { paso, datos, pedidoId } = formulario;

    if (paso === "confirmar_datos") {
      const confirma = msg.text.includes("Sí") || msg.text.includes("Si") || msg.text.includes("si") || msg.text.includes("✅");
      if (confirma) {
        formularioUsuarios.delete(userId);
        await finalizarPedido(chatId, userId, pedidoId, datos);
      } else {
        formulario.paso = "nombre";
        formulario.datos = {};
        formularioUsuarios.set(userId, formulario);
        preguntaPaso("nombre", chatId);
      }
      return true;
    }

    if (paso === "ubicacion") {
      if (msg.text.includes("maps.google") || msg.text.includes("goo.gl") || msg.text.includes("maps.app")) {
        bot.sendMessage(chatId,
          "📍 No puedo leer links de Google Maps. Por favor usá el botón para compartir tu ubicación, o escribí tu dirección completa (ej: Av. Corrientes 1234, Buenos Aires).",
          { reply_markup: { keyboard: [[{ text: "📍 Compartir ubicación", request_location: true }]], resize_keyboard: true, one_time_keyboard: true } }
        );
        return true;
      }
      datos.latitud   = null;
      datos.longitud  = null;
      datos.direccion = msg.text;
      formulario.paso = "referencia";
      formularioUsuarios.set(userId, formulario);
      preguntaPaso("referencia", chatId);
      return true;
    }

    const config = PASOS[paso];
    if (!config) return false;

    datos[config.campo] = msg.text;

    if (config.siguiente === null) {
      formularioUsuarios.delete(userId);
      await finalizarPedido(chatId, userId, pedidoId, datos);
    } else {
      formulario.paso = config.siguiente;
      formularioUsuarios.set(userId, formulario);
      preguntaPaso(config.siguiente, chatId);
    }
    return true;
  }

  return { preguntaPaso, iniciarFormulario, finalizarPedido, procesarRespuesta, formularioUsuarios };
}

module.exports = { crearFormulario };
