// Public fixture data: safe to import in Playwright's ordinary Node process.
import type { KitConfig } from '../../../lib/kit/config-schema';

export const fixtureCopy = {
  documentTitle: 'Cep Bahçesi — kaynaklı yanıtlar',
  shortTitle: 'Cep Bahçesi kılavuzu',
  hero: 'Cep Bahçesi hakkında sorun. Yanıtın kaynağını görün.',
  lead: 'Yanıtlar yalnızca özgün Cep Bahçesi belgelerinden gelir; her alıntı doğrulanır.',
  notFound: 'Bu bilgiyi Cep Bahçesi belgelerinde bulamadım.',
  notFoundBody: 'Dizinlenen {documentCount} belgede yanıt bulunamadı. En yakın bölümler:',
  placeholder: 'Cep Bahçesi hakkında bir soru yazın',
  nextPlaceholder: 'Cep Bahçesi hakkında başka bir soru yazın',
  headerScope: 'Yalnızca Cep Bahçesi belgelerine dayalı yanıtlar',
  scope: 'Bu yardımcı yalnızca Cep Bahçesi kılavuzunu kullanır. Bilgi yoksa bunu söyler.',
  searched: '{documentCount} belge tarandı',
  viewerLink: 'Kaynak belgeyi aç',
  sourceDomain: 'cep-bahcesi.example',
  promptSubject: 'Cep Bahçesi belgeleri',
  rerankSubject: 'Cep Bahçesi',
  suggested: [
    { id: 'saksilar', text: 'Saksılar nasıl kaydedilir?', topic: 'Saksılar' },
    { id: 'sulama', text: 'Sulama çizelgesi nasıl hazırlanır?', topic: 'Sulama' },
  ],
} satisfies KitConfig['copy'];
