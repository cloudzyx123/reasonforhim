// Public settings only. Never put an API key here.
// Paste the src URL from Brevo's official iframe after creating your form.
export const emailSubscription = {
  formUrl: 'https://210fc638.sibforms.com/v2/serve/MUIFAKFznBdIVbdkksvcXPz8mYlXgUciCGQ7HJV50qXv4KusRUMeVj54O3o8M_agVzvRKdAPo20TsAGXVrWaQSjK-aVIKT4Xnbmt4iNA3Sp7ZfseLaK2i10VMj-DoGECkeAFew6RjWqaXHKVaBhSVH1CCXFXpTWdqnpB8zR2pZQMg57fqElDgLXn11SKaf23QWQgZWnmlitjv7gn-Q==',
  // Set true only after double opt-in AND unsubscribe have been tested.
  verified: false,
};

export function getEmailFormUrl(): string | null {
  if (!emailSubscription.verified) return null;
  const url = new URL(emailSubscription.formUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.sibforms.com') ||
      url.username || url.password || url.port || !url.pathname.startsWith('/serve/')) {
    throw new Error('Use the HTTPS /serve/ iframe URL supplied by Brevo.');
  }
  return url.href;
}
