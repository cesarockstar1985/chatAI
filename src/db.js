require("dotenv").config();

const { Pool } = require("pg");

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function inicializarDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id          SERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL,
      username    TEXT,
      items       TEXT NOT NULL,
      total       INTEGER NOT NULL,
      estado      TEXT DEFAULT 'pendiente',
      nombre      TEXT,
      telefono    TEXT,
      latitud     FLOAT,
      longitud    FLOAT,
      direccion   TEXT,
      referencia  TEXT,
      forma_pago  TEXT,
      creado_en   TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("✅ Tabla pedidos lista.");
}

async function guardarPedido(userId, username, items, total) {
  const res = await db.query(
    `INSERT INTO pedidos (user_id, username, items, total)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, username, items, total]
  );
  return res.rows[0].id;
}

async function completarPedido(pedidoId, datos) {
  await db.query(
    `UPDATE pedidos SET nombre=$1, telefono=$2, latitud=$3, longitud=$4,
     direccion=$5, referencia=$6, forma_pago=$7 WHERE id=$8`,
    [datos.nombre, datos.telefono, datos.latitud, datos.longitud,
     datos.direccion, datos.referencia, datos.forma_pago, pedidoId]
  );
}

async function obtenerPedido(pedidoId, userId) {
  const res = await db.query(
    `SELECT * FROM pedidos WHERE id = $1 AND user_id = $2`,
    [pedidoId, userId]
  );
  return res.rows[0] || null;
}

async function actualizarPedido(pedidoId, items, total) {
  await db.query(
    `UPDATE pedidos SET items = $1, total = $2 WHERE id = $3`,
    [items, total, pedidoId]
  );
}

async function cancelarPedido(pedidoId) {
  await db.query(`UPDATE pedidos SET estado = 'cancelado' WHERE id = $1`, [pedidoId]);
}

async function listarPedidos(userId) {
  const res = await db.query(
    `SELECT id, items, total, estado, creado_en FROM pedidos
     WHERE user_id = $1 ORDER BY creado_en DESC LIMIT 5`,
    [userId]
  );
  return res.rows;
}

module.exports = { db, inicializarDB, guardarPedido, completarPedido, obtenerPedido, actualizarPedido, cancelarPedido, listarPedidos };
