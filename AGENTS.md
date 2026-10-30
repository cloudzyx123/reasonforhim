## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

## Content naming

- Use concise English kebab-case for article filenames and URL slugs, including articles written in Chinese.
- Do not use pinyin for article filenames or URL slugs.

## Blog publishing

- For preparing, previewing, publishing, or revising blog articles, read `.agents/skills/blog-publish/SKILL.md` and follow it. The author uses natural-language requests and is not a programmer; execute routine technical steps and explain outcomes in Chinese.
- The author-facing instructions are in `博文发布指南.md`.
- Pages CMS is configured in `.pages.yml`; its author guide is `Pages CMS 使用指南.md`. Before local article edits, fetch/check remote changes from CMS and integrate safely. `urlName` must equal the English filename stem; do not use Astro's reserved `slug` field for the CMS input.
- Keep new CMS entries as drafts by default. Explicitly asking to sync a confirmed draft for CMS authorizes uploading that draft with `draft: true`; it does not authorize publishing it. CMS saves of public entries directly update the site after deployment.
- New articles start as drafts. A preview is not permission to publish. Publish the reviewed version after the author's explicit approval; honor approval already given for that version without repeating the question.
- Keep raw drafts, reports, and preview builds under ignored `output/`. Stage only explicit paths related to the approved publication, never all changes indiscriminately.

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
