const HORARIOS = `
Lunes a viernes: 12:00 – 15:00 y 19:00 – 23:00
Sábados y domingos: 12:00 – 23:30
`;

function estaAbierto() {
  const ahora = new Date();
  const dia   = ahora.getDay();
  const hora  = ahora.getHours() + ahora.getMinutes() / 60;

  if (dia >= 1 && dia <= 5) {
    return (hora >= 12 && hora < 15) || (hora >= 19 && hora < 23);
  } else {
    return hora >= 12 && hora < 23.5;
  }
}

function mensajeHorario() {
  const ahora = new Date();
  const dia   = ahora.getDay();
  const hora  = ahora.getHours() + ahora.getMinutes() / 60;
  const finde = dia === 0 || dia === 6;
  if (finde) {
    return "Abrimos el lunes a las 8hs. Volvé pronto!";
  } else {
    if (hora < 8)  return "Abrimos hoy a las 8:00. Volvé pronto!";
    if (hora >= 23) return "Ya cerramos. Manana abrimos a las 8:00.";
  }
  return "Estamos cerrados. Horarios: Lun-Vie 12:00-15:00 y 19:00-23:00 / Sab-Dom 12:00-23:30";
}

module.exports = { HORARIOS, estaAbierto, mensajeHorario };
