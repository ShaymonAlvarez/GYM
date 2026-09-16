// A planilha modelo foi feita antes da pergunta "Quanto tempo o treino leva em média?".
// Antes de preencher, insere essa linha no XML da aba de feedback, deslocando as
// linhas seguintes junto com mesclagens, formatação condicional e listas suspensas.

const ROW_XML_REGEX = /<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;

const shiftAddress = (address: string, insertAt: number) =>
  address.replace(/^(\$?[A-Z]{1,3}\$?)(\d+)$/, (match, column: string, row: string) =>
    Number(row) >= insertAt ? `${column}${Number(row) + 1}` : match
  );

const shiftRangeList = (sqref: string, insertAt: number) =>
  sqref
    .split(' ')
    .map((range) => range.split(':').map((address) => shiftAddress(address, insertAt)).join(':'))
    .join(' ');

const moveRowXml = (rowXml: string, fromRow: number, toRow: number) =>
  rowXml
    .replace(/^<row r="\d+"/, `<row r="${toRow}"`)
    .replace(new RegExp(`<c r="([A-Z]+)${fromRow}"`, 'g'), `<c r="$1${toRow}"`);

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const insertFeedbackQuestionRowXml = (
  xml: string,
  insertAt: number,
  styleSourceRow: number,
  options: string[]
): string => {
  const sheetDataStart = xml.indexOf('<sheetData>') + '<sheetData>'.length;
  const sheetDataEnd = xml.indexOf('</sheetData>');
  const rows: string[] = [];
  let sourceRowXml: string | null = null;

  for (const match of xml.slice(sheetDataStart, sheetDataEnd).matchAll(ROW_XML_REGEX)) {
    const row = Number(match[1]);
    if (row === styleSourceRow) sourceRowXml = match[0];
    if (row === insertAt) {
      rows.push('__INSERTED_ROW__');
    }
    rows.push(row >= insertAt ? moveRowXml(match[0], row, row + 1) : match[0]);
  }

  if (!sourceRowXml) {
    throw new Error('Linha modelo do feedback não encontrada.');
  }

  // Nova linha com o estilo da linha de origem, sem valores (o texto é escrito depois).
  const insertedRow = moveRowXml(sourceRowXml, styleSourceRow, insertAt)
    .replace(/<c ([^>]*?) t="[^"]*"([^>]*)>/g, '<c $1$2>')
    .replace(/<v>[^<]*<\/v>/g, '')
    .replace(/<c ([^>]*[^/])><\/c>/g, '<c $1/>');

  const sheetData = rows.map((rowXml) => (rowXml === '__INSERTED_ROW__' ? insertedRow : rowXml)).join('');
  let result = `${xml.slice(0, sheetDataStart)}${sheetData}${xml.slice(sheetDataEnd)}`;

  result = result
    .replace(/<mergeCell ref="([^"]+)"/g, (_, ref: string) => `<mergeCell ref="${shiftRangeList(ref, insertAt)}"`)
    .replace(/(<conditionalFormatting\b[^>]*?sqref=")([^"]+)"/g, (_, open: string, sqref: string) => `${open}${shiftRangeList(sqref, insertAt)}"`)
    .replace(/(<dataValidation\b[^>]*?sqref=")([^"]+)"/g, (_, open: string, sqref: string) => `${open}${shiftRangeList(sqref, insertAt)}"`);

  const validation = `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="B${insertAt}:H${insertAt}"><formula1>"${escapeXml(options.join(','))}"</formula1></dataValidation>`;
  if (/<dataValidations count="\d+">/.test(result)) {
    result = result
      .replace(/<dataValidations count="(\d+)">/, (_, count: string) => `<dataValidations count="${Number(count) + 1}">`)
      .replace('</dataValidations>', `${validation}</dataValidations>`);
  }

  return result;
};
