/** Serializes server-owned JSON as an inert HTML data block, never application code. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character] ?? character;
  });
}

export function webApplication(baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'TikSaveMp4',
    url: baseUrl + '/',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web-based',
    inLanguage: 'en-US',
    browserRequirements: 'Requires a modern web browser',
    description:
      'Download supported public TikTok videos as MP4, convert usable audio to MP3, or save photos individually or as a selected-image ZIP. Available options depend on the source.',
  };
}

export function faqPage(faqs: readonly { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'en-US',
    mainEntity: faqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}
