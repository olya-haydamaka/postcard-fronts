import { describe, expect, it } from 'vitest';
import { cardLabel, exportFileName, padNumber, parseFileName } from '../src/io/filename';

describe('title and number from the file name', () => {
  it('a leading number gives the place; the rest, without the extension, is the title', () => {
    expect(parseFileName('01 Багрянці.tiff')).toEqual({ num: 1, title: 'Багрянці' });
    expect(parseFileName('05 Сосна. Пісня гірського вітру.jpg')).toEqual({ num: 5, title: 'Сосна. Пісня гірського вітру' });
    expect(parseFileName('10 Березовий гай, травневий спокій.TIF')).toEqual({
      num: 10,
      title: 'Березовий гай, травневий спокій',
    });
    expect(parseFileName('0042 scan.tif')).toEqual({ num: 42, title: 'scan' });
  });

  it('common separators after the number', () => {
    expect(parseFileName('12. Ранній іній.webp')).toEqual({ num: 12, title: 'Ранній іній' });
    expect(parseFileName("13 - Подвір'я, що спить.jpeg")).toEqual({ num: 13, title: "Подвір'я, що спить" });
    expect(parseFileName('14 — Щебет птахів.png')).toEqual({ num: 14, title: 'Щебет птахів' });
    expect(parseFileName('07_Руда_лисиця.png')).toEqual({ num: 7, title: 'Руда лисиця' });
    expect(parseFileName('3) Ожина.jpg')).toEqual({ num: 3, title: 'Ожина' });
  });

  it('no number: the whole name is the title', () => {
    expect(parseFileName('Sunset.jpg')).toEqual({ num: null, title: 'Sunset' });
    expect(parseFileName('3D view.png')).toEqual({ num: null, title: '3D view' });
    expect(parseFileName('IMG_0001.JPG')).toEqual({ num: null, title: 'IMG 0001' });
  });

  it('a name that is only a number keeps it as the title as well', () => {
    expect(parseFileName('3.jpg')).toEqual({ num: 3, title: '3' });
  });

  it('NFC, collapsed spaces, extension only once', () => {
    expect(parseFileName('Cafe\u{301}.jpg').title).toBe('Caf\u{e9}');
    expect(parseFileName('  02   Ранній   іній .jpg')).toEqual({ num: 2, title: 'Ранній іній' });
    expect(parseFileName('Vol.2.jpg').title).toBe('Vol.2');
  });
});

describe('numbers and export file names', () => {
  it('two digits at least', () => {
    expect(padNumber(1)).toBe('01');
    expect(padNumber(15)).toBe('15');
    expect(padNumber(123)).toBe('123');
  });

  it('NN Title - side.tiff, with . and , removed; no number, no prefix', () => {
    expect(exportFileName(1, 'Багрянці', 'front')).toBe('01 Багрянці - front.tiff');
    expect(exportFileName(5, 'Сосна. Пісня гірського вітру', 'back')).toBe('05 Сосна Пісня гірського вітру - back.tiff');
    expect(exportFileName(10, 'Березовий гай, травневий спокій', 'front')).toBe(
      '10 Березовий гай травневий спокій - front.tiff',
    );
    expect(exportFileName(13, "Подвір'я, що спить", 'front')).toBe("13 Подвір'я що спить - front.tiff");
    expect(exportFileName(null, 'Sunset', 'back')).toBe('Sunset - back.tiff');
  });

  it('a card is named by its number, or by its title without one', () => {
    expect(cardLabel(3, 'Ожина')).toBe('03');
    expect(cardLabel(null, 'Sunset')).toBe('Sunset');
  });
});
