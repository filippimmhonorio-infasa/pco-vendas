// src/lib/rateio.js — distribui o volume do produto entre os clientes
// Mesma regra do protótipo: clientes com volume fixo mantêm o valor;
// o saldo é distribuído entre os não-fixos proporcionalmente ao share.

export const MESES = ["Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const MES_NUM = { Jul: 7, Ago: 8, Set: 9, Out: 10, Nov: 11, Dez: 12 };

/**
 * ratear — para um produto num mês, devolve o volume de cada cliente.
 * @param cli  lista de clientes [{cod, loja, n, s, pm}]
 * @param volTotal volume projetado do produto no mês
 * @param fixos  mapa clienteKey -> volume fixo (opcional)
 * @returns mapa clienteKey -> volume
 */
export function ratear(cli, volTotal, fixos = {}) {
  const out = {};
  let somaFixos = 0;
  const naoFixos = [];
  for (const c of cli) {
    const key = `${c.cod}|${c.loja}`;
    if (fixos[key] != null) {
      out[key] = fixos[key];
      somaFixos += fixos[key];
    } else {
      naoFixos.push(c);
    }
  }
  const saldo = Math.max(0, volTotal - somaFixos);
  const shareNaoFixos = naoFixos.reduce((a, c) => a + c.s, 0);
  for (const c of naoFixos) {
    const key = `${c.cod}|${c.loja}`;
    out[key] = shareNaoFixos > 0 ? saldo * (c.s / shareNaoFixos) : 0;
  }
  return out;
}

// preço do cliente = override se houver, senão o PM do produto projetado
export function precoCliente(cliente, pmProduto, pmOverride) {
  return pmOverride != null ? pmOverride : (cliente.pm ?? pmProduto);
}
