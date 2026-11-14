# Saved documentation fixtures

Retrieved on 2026-11-10. Each HTML file is the unmodified response body of one
manual GET, after checking that the site's `robots.txt` permits the URL for
`SourcedFixture`. Requests used
`SourcedFixture/1.0 (+https://github.com/firatkill/sourced; documentation parser tests)`.
Tests read these files locally and never fetch them. Prettier excludes the HTML
files to preserve the served bytes. These third-party fixtures retain their
upstream licences rather than the repository's MIT licence.

| File              | Title and source URL                                                                                                           | Attribution and licence                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `python.html`     | [8. Errors and Exceptions](https://docs.python.org/3/tutorial/errors.html)                                                     | Python Software Foundation and Python documentation contributors; [PSF License Agreement](https://docs.python.org/3/license.html), with examples additionally available under 0BSD. Copyright notices are retained in the saved page.                                    |
| `kubernetes.html` | [Overview](https://kubernetes.io/docs/concepts/overview/)                                                                      | The Kubernetes Authors; [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as linked by the saved page's footer.                                                                                                                                                 |
| `mdn.html`        | [The blockquote HTML block quotation element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/blockquote) | Mozilla Contributors; [CC BY-SA 2.5 or later](https://creativecommons.org/licenses/by-sa/2.5/), retained for this fixture. See the [MDN attribution policy](https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license). No modifications. |
| `rust.html`       | [Variables and Mutability](https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html)                               | The Rust Project Developers; [MIT](https://github.com/rust-lang/book/blob/main/LICENSE-MIT) or [Apache-2.0](https://github.com/rust-lang/book/blob/main/LICENSE-APACHE).                                                                                                 |
| `django.html`     | [Django shortcut functions](https://docs.djangoproject.com/en/5.2/topics/http/shortcuts/)                                      | Django Software Foundation and individual contributors; [BSD-3-Clause](https://github.com/django/django/blob/main/LICENSE). Copyright notices are retained in the saved page.                                                                                            |

Robots checks: Python excludes old/development versions, not `/3/tutorial/`;
Kubernetes excludes legacy/versioned/404 paths, not `/docs/concepts/overview/`;
MDN excludes API/files/media paths, not this document; Rust excludes historical
versioned books, not `/book/`; Django's disallowed translated/versioned paths and
search pattern do not cover this English 5.2 topic. All five selected URLs were
also checked with the repository's `robots-parser`, returning `true`.
