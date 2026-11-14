import mammoth from 'mammoth';
import { openArrayBuffer } from 'mammoth/lib/zipfile';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { buildHtmlSections } from './parse-html-generic';
import type { ParsedDocument } from './parse-html';

const CoreProperties = z.object({
  'cp:coreProperties': z.preprocess(
    (value) => (value === '' ? {} : value),
    z.object({ 'dc:title': z.string().optional() }).optional(),
  ),
});

/** FR-70 / TRD §33.5: default Word styles, no images or main-content detection. */
export async function parseDocx(
  bytes: Uint8Array,
  fileName: string,
): Promise<{ document: ParsedDocument; warnings: number }> {
  const buffer = Buffer.from(bytes);
  const archive = await openArrayBuffer(buffer);
  let propertyTitle: string | undefined;
  if (archive.exists('docProps/core.xml')) {
    const xml: unknown = new XMLParser({ parseTagValue: false }).parse(
      await archive.read('docProps/core.xml', 'utf8'),
    );
    propertyTitle = CoreProperties.parse(xml)['cp:coreProperties']?.['dc:title']?.trim();
  }
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      includeEmbeddedStyleMap: false,
      // Mammoth's runtime accepts an empty node array; its public type only
      // exposes branded converters that emit <img>. No image bytes are read.
      convertImage: (() => []) as unknown as NonNullable<
        NonNullable<Parameters<typeof mammoth.convertToHtml>[1]>['convertImage']
      >,
    },
  );
  const $ = load(result.value);
  const title =
    propertyTitle || $('h1,h2,h3,h4,h5,h6').first().text().replace(/\s+/g, ' ').trim() || fileName;
  return {
    document: buildHtmlSections(result.value, title),
    warnings: result.messages.filter((message) => message.type === 'warning').length,
  };
}
