# Docling fixtures

`*.json` are Docling's own ground-truth outputs (DoclingDocument JSON) from the
[docling](https://github.com/docling-project/docling) test data (`tests/data/*/groundtruth/`),
MIT licence, copied unchanged. They let the tests check `lib/ingest/parse-docling.ts` against
real Docling output without running the 6.5 GB Docling container.

`slides/` is a folder source for the loader tests: `deck.pptx` holds placeholder bytes (the fake
Docling never reads them) and `report.pdf` is a copy of `tests/fixtures/pdf/pages.pdf`.
