# Mixed-format example

Six short files in every format the kit reads (Markdown, MDX, HTML, PDF, `.docx`, plain text), written for the Sourced tests and released under the repository's MIT licence. Used by the T-64 any-corpus check:

```bash
./sourced init --profile local --corpus-name mixed --title "Mixed example" --description "Six files in six formats" --language en --chat openai:gpt-6-luna --embed openai:text-embedding-3-small:1536 --source examples/mixed-folder --yes
./sourced ingest
./sourced ask "What does the guide say?"
```
