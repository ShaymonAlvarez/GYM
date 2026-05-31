import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { SheetLayout } from '../types';

type WorkbookSheetProps = {
  layout: SheetLayout;
  cellValues: Record<string, string>;
};

const borderStyleMap: Record<string, string> = {
  thin: '1px solid',
  medium: '2px solid',
  thick: '3px solid',
  dashed: '1px dashed',
  dotted: '1px dotted',
  double: '3px double'
};

const columnNumberToLetter = (columnNumber: number) => {
  let current = columnNumber;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

const toNumeric = (value: number | string | undefined, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const columnWidthToPixels = (width: number | string) => Math.round(toNumeric(width, 8.43) * 7 + 5);
const rowHeightToPixels = (height: number | string) => Math.round(toNumeric(height, 20) * 1.34);

const buildBorder = (styleName: string | null, color: string | null) => {
  if (!styleName) {
    return undefined;
  }

  return `${borderStyleMap[styleName] ?? '1px solid'} ${color ?? '#000000'}`;
};

const hexToRgb = (value: string | null) => {
  if (!value || !/^#?[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }

  const normalized = value.startsWith('#') ? value.slice(1) : value;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
};

const luminanceChannel = (channel: number) => {
  const normalized = channel / 255;

  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const getContrastRatio = (foreground: string | null, background: string | null) => {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background ?? '#ffffff');

  if (!fg || !bg) {
    return null;
  }

  const fgLuminance =
    0.2126 * luminanceChannel(fg.r) + 0.7152 * luminanceChannel(fg.g) + 0.0722 * luminanceChannel(fg.b);
  const bgLuminance =
    0.2126 * luminanceChannel(bg.r) + 0.7152 * luminanceChannel(bg.g) + 0.0722 * luminanceChannel(bg.b);
  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);

  return (lighter + 0.05) / (darker + 0.05);
};

const ensureReadableTextColor = (foreground: string | null, background: string | null) => {
  const contrastRatio = getContrastRatio(foreground, background);

  if (contrastRatio === null) {
    return foreground ?? '#221b17';
  }

  return contrastRatio < 3.4 ? '#2f241c' : foreground ?? '#221b17';
};

function WorkbookSheet({ layout, cellValues }: WorkbookSheetProps) {
  const { mergeMap, hiddenCells } = useMemo(() => {
    const nextMergeMap = new Map<string, { rowSpan: number; colSpan: number }>();
    const nextHiddenCells = new Set<string>();

    layout.merges.forEach((merge) => {
      const address = `${columnNumberToLetter(merge.startColumn)}${merge.startRow}`;
      nextMergeMap.set(address, {
        rowSpan: merge.endRow - merge.startRow + 1,
        colSpan: merge.endColumn - merge.startColumn + 1
      });

      for (let row = merge.startRow; row <= merge.endRow; row += 1) {
        for (let column = merge.startColumn; column <= merge.endColumn; column += 1) {
          if (row === merge.startRow && column === merge.startColumn) {
            continue;
          }

          nextHiddenCells.add(`${columnNumberToLetter(column)}${row}`);
        }
      }
    });

    return {
      mergeMap: nextMergeMap,
      hiddenCells: nextHiddenCells
    };
  }, [layout.merges]);

  return (
    <div className="workbook-sheet-shell">
      <table className="workbook-sheet" cellPadding={0} cellSpacing={0}>
        <colgroup>
          {layout.columnWidths.map((width, index) => (
            <col key={index} style={{ width: `${columnWidthToPixels(width)}px` }} />
          ))}
        </colgroup>
        <tbody>
          {Array.from({ length: layout.endRow - layout.startRow + 1 }, (_, rowOffset) => {
            const rowNumber = layout.startRow + rowOffset;

            return (
              <tr key={rowNumber} style={{ height: `${rowHeightToPixels(layout.rowHeights[rowOffset] ?? 20)}px` }}>
                {Array.from({ length: layout.endColumn - layout.startColumn + 1 }, (_, columnOffset) => {
                  const columnNumber = layout.startColumn + columnOffset;
                  const address = `${columnNumberToLetter(columnNumber)}${rowNumber}`;

                  if (hiddenCells.has(address)) {
                    return null;
                  }

                  const baseCell = layout.cells[address];
                  const merge = mergeMap.get(address);
                  const style = baseCell?.style;
                  const fillColor = style?.fillColor ?? null;
                  const fontColor = ensureReadableTextColor(style?.fontColor ?? null, fillColor);
                  const cellStyle: CSSProperties = {
                    backgroundColor: fillColor ?? undefined,
                    color: fontColor,
                    fontWeight: style?.bold ? 700 : 400,
                    fontStyle: style?.italic ? 'italic' : 'normal',
                    textDecoration: style?.underline ? 'underline' : 'none',
                    fontSize: `${toNumeric(style?.fontSize, 11)}px`,
                    fontFamily: style?.fontFamily ?? 'Arial, sans-serif',
                    textAlign:
                      style?.horizontalAlignment === 'general'
                        ? undefined
                        : (style?.horizontalAlignment as CSSProperties['textAlign']),
                    verticalAlign:
                      style?.verticalAlignment === 'center'
                        ? 'middle'
                        : (style?.verticalAlignment as CSSProperties['verticalAlign']),
                    whiteSpace: style?.wrapText ? 'pre-wrap' : 'nowrap',
                    borderLeft: buildBorder(style?.leftBorderStyle ?? null, style?.leftBorderColor ?? null),
                    borderRight: buildBorder(style?.rightBorderStyle ?? null, style?.rightBorderColor ?? null),
                    borderTop: buildBorder(style?.topBorderStyle ?? null, style?.topBorderColor ?? null),
                    borderBottom: buildBorder(style?.bottomBorderStyle ?? null, style?.bottomBorderColor ?? null)
                  };

                  return (
                    <td
                      key={address}
                      className="workbook-sheet__cell"
                      colSpan={merge?.colSpan}
                      rowSpan={merge?.rowSpan}
                      style={cellStyle}
                    >
                      {cellValues[address] ?? baseCell?.display ?? ''}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default WorkbookSheet;