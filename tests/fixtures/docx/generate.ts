// UT-41 / A-26: original OOXML fixtures, zipped with pinned Mammoth's ZIP adapter.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openArrayBuffer } from 'mammoth/lib/zipfile';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
export const paragraph = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
const item = (text: string, id: number, level: number) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="${String(level)}"/><w:numId w:val="${String(id)}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const styles = `<w:styles xmlns:w="${w}">${[1, 2, 3].map((level) => `<w:style w:type="paragraph" w:styleId="Heading${String(level)}"><w:name w:val="heading ${String(level)}"/><w:pPr><w:outlineLvl w:val="${String(level - 1)}"/></w:pPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="Unmapped"><w:name w:val="Unmapped"/></w:style></w:styles>`;
const numbering = `<w:numbering xmlns:w="${w}">${['decimal', 'bullet'].map((format, index) => `<w:abstractNum w:abstractNumId="${String(index)}"><w:multiLevelType w:val="multilevel"/>${[0, 1].map((level) => `<w:lvl w:ilvl="${String(level)}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${format === 'bullet' ? '•' : `%${String(level + 1)}.`}"/></w:lvl>`).join('')}</w:abstractNum><w:num w:numId="${String(index + 1)}"><w:abstractNumId w:val="${String(index)}"/></w:num>`).join('')}</w:numbering>`;
const image = `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="image" descr="Ignored image description"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="pixel.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9525" cy="9525"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

export async function makeDocx(body: string, title?: string, withImage = false) {
  // EOCD for an empty ZIP archive; the adapter supplies compression/packaging.
  const archive = await openArrayBuffer(
    Uint8Array.from([80, 75, 5, 6, ...Array<number>(18).fill(0)]),
  );
  const core =
    title === undefined
      ? ''
      : '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>';
  archive.write(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${core}</Types>`,
  );
  archive.write(
    '_rels/.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${r}/officeDocument" Target="word/document.xml"/>${title === undefined ? '' : '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'}</Relationships>`,
  );
  archive.write(
    'word/document.xml',
    `<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body>${body}${withImage ? image : ''}<w:sectPr/></w:body></w:document>`,
  );
  archive.write('word/styles.xml', styles);
  archive.write('word/numbering.xml', numbering);
  archive.write(
    'word/_rels/document.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${r}/styles" Target="styles.xml"/><Relationship Id="rIdNumbers" Type="${r}/numbering" Target="numbering.xml"/>${withImage ? `<Relationship Id="rIdImage" Type="${r}/image" Target="media/pixel.png"/>` : ''}</Relationships>`,
  );
  if (title !== undefined)
    archive.write(
      'docProps/core.xml',
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title></cp:coreProperties>`,
    );
  if (withImage)
    archive.write(
      'word/media/pixel.png',
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSfoAAAAASUVORK5CYII=',
        'base64',
      ),
    );
  return new Uint8Array(await archive.toArrayBuffer());
}

export async function generateFixtures(directory = new URL('.', import.meta.url)) {
  const table = `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>${[
    ['Plant', 'Water'],
    ['Basil', 'Daily'],
  ]
    .map(
      (cells, index) =>
        `<w:tr>${index === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((cell) => `<w:tc><w:tcPr/>${paragraph(cell)}</w:tc>`).join('')}</w:tr>`,
    )
    .join('')}</w:tbl>`;
  const fixtures = {
    'properties.docx': await makeDocx(
      paragraph('Visible heading', 'Heading1') + paragraph('The property title takes precedence.'),
      'Garden & field handbook',
    ),
    'headings.docx': await makeDocx(
      paragraph('Opening paragraph stays in the root.') +
        paragraph('Garden handbook', 'Heading1') +
        paragraph('Garden introduction.') +
        paragraph('Planting seeds', 'Heading2') +
        paragraph('Prepare the soil.') +
        paragraph('Seed depth', 'Heading3') +
        paragraph('Sow shallowly.') +
        paragraph('Watering plants', 'Heading2') +
        paragraph('Water in the morning.'),
    ),
    'plain.docx': await makeDocx(paragraph('This handbook has no headings.')),
    'lists-table-image.docx': await makeDocx(
      paragraph('Field guide', 'Heading1') +
        item('Prepare soil ', 1, 0) +
        item('Loosen earth', 1, 1) +
        item('Plant seeds', 1, 0) +
        item('Tools ', 2, 0) +
        item('Small trowel', 2, 1) +
        item('Watering can', 2, 0) +
        table +
        paragraph('Text after the table and before the image.'),
      undefined,
      true,
    ),
    'warning.docx': await makeDocx(paragraph('An unfamiliar style keeps its text.', 'Unmapped')),
  };
  for (const [name, bytes] of Object.entries(fixtures))
    await writeFile(new URL(name, directory), bytes);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await generateFixtures();
