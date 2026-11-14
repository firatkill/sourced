// TC-200 / UT-40. Original fixtures; raw PDF 1.4, built-in Helvetica, no dependencies.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

type Line = { text: string; size: number };
export function makePdf(
  pages: Line[][],
  scanned = false,
  width = 612,
  infoTitle?: string,
): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(
    `<< /Type /Pages /Count ${String(pages.length)} /Kids [${pages.map((_, i) => `${String(5 + i * 2)} 0 R`).join(' ')}] >>`,
  );
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const stream = (data: string, dictionary = '') =>
    `<< ${dictionary} /Length ${String(Buffer.byteLength(data))} >>\nstream\n${data}\nendstream`;
  add(
    stream(
      '808080>',
      '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode',
    ),
  );
  for (const [index, lines] of pages.entries()) {
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(width)} 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> /Contents ${String(6 + index * 2)} 0 R >>`,
    );
    const content = scanned
      ? 'q 500 0 0 700 40 40 cm /Im1 Do Q'
      : lines
          .map(
            (line, i) =>
              `BT /F1 ${String(line.size)} Tf 1 0 0 1 40 ${String(750 - i * 35)} Tm (${line.text.replace(/[\\()]/g, '\\$&')}) Tj ET`,
          )
          .join('\n');
    add(stream(content));
  }
  const infoId =
    infoTitle !== undefined
      ? add(`<< /Title (${infoTitle.replace(/[\\()]/g, '\\$&')}) >>`)
      : undefined;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R${infoId !== undefined ? ` /Info ${String(infoId)} 0 R` : ''} >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}

export async function generateFixtures(directory = new URL('.', import.meta.url)) {
  const body = (text: string): Line => ({ text, size: 12 });
  const fixtures = {
    'headings.pdf': makePdf([
      [
        { text: 'Garden handbook', size: 24 },
        body('A practical handbook for a small garden.'),
        { text: 'Planting seeds', size: 15 },
        body('Choose a sunny place for the seed tray.'),
        body('Fill the tray with soil and water gently.'),
        body('Leave enough space between each seed.'),
      ],
      [
        body('Keep the seed tray warm until shoots appear.'),
        body('Check the soil each morning before watering.'),
        { text: 'Caring for seedlings', size: 18 },
        body('Move the seedlings towards the light.'),
        body('Turn the tray regularly for balanced growth.'),
        body('Keep a record of the watering schedule.'),
      ],
    ]),
    'pages.pdf': makePdf([
      [
        body('Page one describes preparing a pot for planting.'),
        body('Place the pot where rain can drain safely.'),
      ],
      [
        body('Page two describes watering the growing plants.'),
        body('Check the soil before adding more water.'),
      ],
    ]),
    'info-title.pdf': makePdf(
      [
        [
          { text: 'Visible garden heading', size: 24 },
          body('The Info title is the document title.'),
          body('The visible heading remains a section.'),
          body('Body text establishes the median font size.'),
        ],
      ],
      false,
      612,
      'Garden metadata title',
    ),
    'scanned.pdf': makePdf([[], []], true),
  };
  for (const [name, bytes] of Object.entries(fixtures))
    await writeFile(new URL(name, directory), bytes);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await generateFixtures();
