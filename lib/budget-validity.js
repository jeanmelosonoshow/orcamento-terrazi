export const ORCAMENTO_VALIDADE_DIAS = 5;
export const ORCAMENTO_FUSO_HORARIO = 'America/Sao_Paulo';

function obterDataCivil(data, fusoHorario) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(data);

  return Object.fromEntries(
    partes
      .filter(parte => ['year', 'month', 'day'].includes(parte.type))
      .map(parte => [parte.type, Number(parte.value)])
  );
}

export function calcularDataValidadeOrcamento(dataBase = new Date(), dias = ORCAMENTO_VALIDADE_DIAS) {
  const { year, month, day } = obterDataCivil(dataBase, ORCAMENTO_FUSO_HORARIO);
  const dataValidade = new Date(Date.UTC(year, month - 1, day + dias));
  return dataValidade.toISOString().slice(0, 10);
}
